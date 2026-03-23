import PgBoss from "pg-boss";
import { db, TaskStatus, TaskRunStatus } from "@houston/shared";
import cronParser from "cron-parser";
import { DispatchService, DispatchJobData, DispatchTaskJobData } from "./dispatcher.js";
import os from "os";
import path from "path";
import { promises as fsp } from "fs";
import { createWriteStream } from "fs";
import { createGzip } from "zlib";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const parseCronExpression = (cronParser as any).parseExpression;

const TICK_INTERVAL_MS =
  parseInt(process.env.HOUSTON_SCHEDULER_TICK_SECONDS ?? "30", 10) * 1000;
const GRACE_WINDOW_SECONDS = parseInt(
  process.env.HOUSTON_GRACE_WINDOW_SECONDS ?? "300",
  10
);
const LOOKBACK_WINDOW_HOURS = parseInt(
  process.env.HOUSTON_LOOKBACK_WINDOW_HOURS ?? "48",
  10
);
const LOG_RETENTION_DAYS = parseInt(
  process.env.HOUSTON_LOG_RETENTION_DAYS ?? "30",
  10
);
const APPROVAL_AUDIT_ROTATE_DAYS = parseInt(
  process.env.HOUSTON_APPROVAL_AUDIT_ROTATE_DAYS ?? "7",
  10
);
const APPROVAL_AUDIT_ROTATE_BATCH_SIZE = parseInt(
  process.env.HOUSTON_APPROVAL_AUDIT_ROTATE_BATCH_SIZE ?? "500",
  10
);
const APPROVAL_AUDIT_ARCHIVE_DIR =
  process.env.HOUSTON_APPROVAL_AUDIT_ARCHIVE_DIR ??
  path.join(os.homedir(), ".openclaw", "workspace", "state", "approval-audit-archive");
const STALE_ACCEPTED_MINUTES = parseInt(
  process.env.HOUSTON_STALE_ACCEPTED_MINUTES ?? "30",
  10
);

export type ScheduleRow = {
  id: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
};

export function computeNextRunAt(cron: string, timezone: string, after?: Date): Date {
  const interval = parseCronExpression(cron, {
    currentDate: after ?? new Date(),
    tz: timezone,
  });
  return interval.next().toDate();
}

export function getExpectedRunsInWindow(
  cron: string,
  timezone: string,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const runs: Date[] = [];
  try {
    const interval = parseCronExpression(cron, {
      currentDate: new Date(windowStart.getTime() - 1),
      tz: timezone,
    });

    while (true) {
      const next = interval.next().toDate();
      if (next > windowEnd) break;
      if (next >= windowStart) runs.push(next);
    }
  } catch {
    // ignore invalid cron
  }
  return runs;
}

export class HoustonScheduler {
  private boss?: PgBoss;
  private tickTimer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private dispatchService: DispatchService) {}

  async start(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL not set");
    }

    this.boss = new PgBoss({ connectionString: databaseUrl });
    await this.boss.start();

    await this.boss.work<DispatchJobData>(
      "dispatch",
      { teamSize: parseInt(process.env.HOUSTON_DISPATCH_CONCURRENCY ?? "5", 10) },
      async (job) => {
        await this.dispatchService.dispatch(job.data);
      }
    );

    await this.boss.work<DispatchTaskJobData>(
      "dispatch-task",
      { teamSize: parseInt(process.env.HOUSTON_DISPATCH_CONCURRENCY ?? "5", 10) },
      async (job) => {
        await this.dispatchService.dispatchTask(job.data);
      }
    );

    this.running = true;
    // Run immediately
    await this.tick();
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) =>
        console.error("[scheduler] Tick error:", err)
      );
    }, TICK_INTERVAL_MS);

    // Update system status
    await this.updateSystemStatus();
  }

  async tick(): Promise<void> {
    const now = new Date();

    try {
      await this.recoverStaleAcceptedRuns();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Failed stale-run recovery: ${errorText}`);
    }

    const enabledSchedules = await db.schedule.findMany({
      where: { enabled: true },
    });

    for (const schedule of enabledSchedules) {
      // Check if due
      if (schedule.nextRunAt && schedule.nextRunAt <= now) {
        try {
          await this._enqueueDue(schedule);
        } catch (err) {
          const errorText = err instanceof Error ? err.message : String(err);
          console.error(
            `[scheduler] Failed to enqueue schedule ${schedule.id}: ${errorText}`
          );
        }
      }

      // Detect missed runs
      try {
        await this.detectMissedRuns(schedule);
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(
          `[scheduler] Failed to detect missed runs for schedule ${schedule.id}: ${errorText}`
        );
      }
    }

    try {
      await this.dispatchReadyAutoTasks();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Failed auto-dispatch pass: ${errorText}`);
    }

    try {
      await this.updateSystemStatus();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Failed to update system status: ${errorText}`);
    }
  }

  private async dispatchReadyAutoTasks(): Promise<void> {
    if (!this.boss) return;

    const queueTasks = await db.task.findMany({
      where: {
        status: { in: [TaskStatus.QUEUE, TaskStatus.BLOCKED] },
        autoDispatch: true,
        archivedAt: null,
      },
      include: {
        taskRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        dependencies: {
          include: {
            dependsOnTask: {
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    for (const task of queueTasks) {
      const latestRun = task.taskRuns[0] ?? null;
      if (latestRun && (latestRun.status === TaskRunStatus.ACCEPTED || latestRun.status === TaskRunStatus.RUNNING)) {
        continue;
      }

      const deps = task.dependencies ?? [];
      const blocked = deps.some((dep) => dep.dependsOnTask?.status !== TaskStatus.DONE);
      if (blocked) {
        if (task.status !== TaskStatus.BLOCKED) {
          await db.task.update({
            where: { id: task.id },
            data: { status: TaskStatus.BLOCKED },
          });
          await db.taskEvent.create({
            data: {
              taskId: task.id,
              type: "STATUS_CHANGED",
              message: "Task blocked: waiting on dependencies",
              metadata: {
                semanticStatus: "BLOCKED",
                blockingDependencyCount: deps.length,
              },
            },
          });
        }
        continue;
      }

      if (task.status === TaskStatus.BLOCKED) {
        await db.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.QUEUE },
        });
        await db.taskEvent.create({
          data: {
            taskId: task.id,
            type: "STATUS_CHANGED",
            message: "Task unblocked: dependencies satisfied",
            metadata: {
              semanticStatus: "UNBLOCKED",
              dependencyCount: deps.length,
            },
          },
        });
      }

      await this.boss.send("dispatch-task", {
        taskId: task.id,
        reason: deps.length > 0 ? "dependency-ready" : "auto-dispatch",
      });

      await db.taskEvent.create({
        data: {
          taskId: task.id,
          type: "QUEUED",
          message: deps.length > 0
            ? "Dependencies satisfied; auto-dispatch enqueued"
            : "Auto-dispatch enqueued",
          metadata: {
            autoDispatch: true,
            dependencyCount: deps.length,
          },
        },
      });
    }
  }

  private async recoverStaleAcceptedRuns(): Promise<void> {
    if (STALE_ACCEPTED_MINUTES <= 0) return;
    const staleBefore = new Date(Date.now() - STALE_ACCEPTED_MINUTES * 60 * 1000);

    const staleRuns = await db.taskRun.findMany({
      where: {
        status: TaskRunStatus.ACCEPTED,
        startedAt: null,
        createdAt: { lt: staleBefore },
      },
      include: {
        task: true,
      },
      take: 200,
    });

    for (const run of staleRuns) {
      await db.taskRun.update({
        where: { id: run.id },
        data: {
          status: TaskRunStatus.FAILED,
          finishedAt: new Date(),
          errorText: `stale accepted run recovered after ${STALE_ACCEPTED_MINUTES}m timeout`,
        },
      });

      if (run.taskId) {
        await db.task.update({
          where: { id: run.taskId },
          data: { status: TaskStatus.QUEUE },
        });

        await db.taskEvent.create({
          data: {
            taskId: run.taskId,
            taskRunId: run.id,
            type: "FAILED",
            message: `Recovered stale ACCEPTED run after ${STALE_ACCEPTED_MINUTES}m`,
            metadata: {
              staleAcceptedRecovery: true,
              staleMinutes: STALE_ACCEPTED_MINUTES,
            },
          },
        });
      }
    }
  }

  private async _enqueueDue(schedule: ScheduleRow): Promise<void> {
    const dueAt = schedule.nextRunAt!;

    if (!this.boss) return;
    await this.boss.send("dispatch", { scheduleId: schedule.id, dueAt: dueAt.toISOString() });

    const nextRunAt = computeNextRunAt(schedule.cron, schedule.timezone, dueAt);
    await db.schedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: dueAt, nextRunAt },
    });

    await db.taskEvent.create({
      data: {
        scheduleId: schedule.id,
        type: "QUEUED",
        message: `Dispatch job enqueued for ${dueAt.toISOString()}`,
      },
    });
  }

  async detectMissedRuns(schedule: ScheduleRow): Promise<void> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - LOOKBACK_WINDOW_HOURS * 60 * 60 * 1000
    );

    const expectedRuns = getExpectedRunsInWindow(
      schedule.cron,
      schedule.timezone,
      windowStart,
      now
    );

    for (const expectedTime of expectedRuns) {
      // Within grace window: not yet missed
      if (now.getTime() - expectedTime.getTime() < GRACE_WINDOW_SECONDS * 1000) {
        continue;
      }

      // Check if a TaskRun exists for this schedule + dueAt window (±1 minute)
      const existing = await db.taskRun.findFirst({
        where: {
          idempotencyKey: `dispatch:${schedule.id}:${expectedTime.toISOString()}`,
        },
      });

      if (existing) continue;

      // Also check for a MISSED event for this expected time
      const existingMissedEvent = await db.taskEvent.findFirst({
        where: {
          scheduleId: schedule.id,
          type: "MISSED",
          metadata: {
            path: ["expectedAt"],
            equals: expectedTime.toISOString(),
          },
        },
      });

      if (existingMissedEvent) continue;

      // Mark missed
      await db.taskEvent.create({
        data: {
          scheduleId: schedule.id,
          type: "MISSED",
          message: `Missed run at ${expectedTime.toISOString()}`,
          metadata: { expectedAt: expectedTime.toISOString() },
        },
      });

      await db.schedule.update({
        where: { id: schedule.id },
        data: {
          missedCount: { increment: 1 },
          lastMissedAt: expectedTime,
        },
      });
    }
  }

  private async updateSystemStatus(): Promise<void> {
    // Update scheduler last tick
    await db.systemStatus.upsert({
      where: { key: "scheduler_last_tick" },
      update: { value: { timestamp: new Date().toISOString() } },
      create: {
        key: "scheduler_last_tick",
        value: { timestamp: new Date().toISOString() },
      },
    });

    // Update tasks pending count
    const pendingCount = await db.task.count({
      where: {
        status: { in: ["QUEUE", "BLOCKED", "IN_PROGRESS"] },
      },
    });
    await db.systemStatus.upsert({
      where: { key: "tasks_pending" },
      update: { value: { count: pendingCount, timestamp: new Date().toISOString() } },
      create: {
        key: "tasks_pending",
        value: { count: pendingCount, timestamp: new Date().toISOString() },
      },
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
    }
    if (this.boss) {
      await this.boss.stop();
    }
  }

  async cleanupOldLogs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

      const deletedLogs = await db.taskLog.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      if (deletedLogs.count > 0) {
        console.log(
          `[scheduler] Cleaned up ${deletedLogs.count} old task logs ` +
            `older than ${LOG_RETENTION_DAYS} days`
        );
      }

      await this.rotateApprovalAuditEvents();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(
        `[scheduler] Failed to cleanup old logs: ${errorText} ` +
            `(retention: ${LOG_RETENTION_DAYS} days)`
      );
    }
  }

  async rotateApprovalAuditEvents(): Promise<void> {
    if (APPROVAL_AUDIT_ROTATE_DAYS <= 0) return;

    try {

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - APPROVAL_AUDIT_ROTATE_DAYS);

    let rotated = 0;
    let deleted = 0;
    let files = 0;

    while (true) {
      const batch = await db.approvalAuditEvent.findMany({
        where: { createdAt: { lt: cutoffDate } },
        orderBy: { createdAt: "asc" },
        take: APPROVAL_AUDIT_ROTATE_BATCH_SIZE,
      });

      if (batch.length === 0) break;

      const groups = new Map<string, typeof batch>();
      for (const item of batch) {
        const day = item.createdAt.toISOString().slice(0, 10);
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day)!.push(item);
      }

      for (const [day, events] of groups.entries()) {
        const [year, month] = day.split("-");
        const dir = path.join(APPROVAL_AUDIT_ARCHIVE_DIR, year, month);
        await fsp.mkdir(dir, { recursive: true });

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const baseName = `approval-audit-${day}-${stamp}`;
        const jsonlPath = path.join(dir, `${baseName}.jsonl`);
        const gzPath = `${jsonlPath}.gz`;

        const lines = events
          .map((event) => JSON.stringify(event))
          .join("\n");
        await fsp.writeFile(jsonlPath, `${lines}\n`, "utf8");

        await pipeline(
          Readable.from([await fsp.readFile(jsonlPath)]),
          createGzip({ level: 9 }),
          createWriteStream(gzPath)
        );
        await fsp.unlink(jsonlPath);

        const gzBytes = await fsp.readFile(gzPath);
        const checksum = createHash("sha256").update(gzBytes).digest("hex");
        const manifestPath = path.join(APPROVAL_AUDIT_ARCHIVE_DIR, "manifest.jsonl");
        const manifestEntry = {
          archivedAt: new Date().toISOString(),
          day,
          file: path.relative(APPROVAL_AUDIT_ARCHIVE_DIR, gzPath),
          count: events.length,
          checksum,
          firstCreatedAt: events[0]?.createdAt?.toISOString() ?? null,
          lastCreatedAt: events[events.length - 1]?.createdAt?.toISOString() ?? null,
        };
        await fsp.appendFile(manifestPath, `${JSON.stringify(manifestEntry)}\n`, "utf8");

        const ids = events.map((event) => event.id);
        const res = await db.approvalAuditEvent.deleteMany({
          where: { id: { in: ids } },
        });

        rotated += events.length;
        deleted += res.count;
        files += 1;
      }
    }

    await db.systemStatus.upsert({
      where: { key: "approval_audit_rotation" },
      create: {
        key: "approval_audit_rotation",
        value: {
          ranAt: new Date().toISOString(),
          rotateDays: APPROVAL_AUDIT_ROTATE_DAYS,
          batchSize: APPROVAL_AUDIT_ROTATE_BATCH_SIZE,
          rotated,
          deleted,
          files,
          archiveDir: APPROVAL_AUDIT_ARCHIVE_DIR,
        },
      },
      update: {
        value: {
          ranAt: new Date().toISOString(),
          rotateDays: APPROVAL_AUDIT_ROTATE_DAYS,
          batchSize: APPROVAL_AUDIT_ROTATE_BATCH_SIZE,
          rotated,
          deleted,
          files,
          archiveDir: APPROVAL_AUDIT_ARCHIVE_DIR,
        },
      },
    });

    if (rotated > 0) {
      console.log(
        `[scheduler] Rotated ${rotated} approval audit events into ${files} archive files ` +
          `(deleted ${deleted}, cutoff ${APPROVAL_AUDIT_ROTATE_DAYS}d)`
      );
    }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      await db.systemStatus
        .upsert({
          where: { key: "approval_audit_rotation_error" },
          create: {
            key: "approval_audit_rotation_error",
            value: {
              at: new Date().toISOString(),
              error: errorText,
              archiveDir: APPROVAL_AUDIT_ARCHIVE_DIR,
            },
          },
          update: {
            value: {
              at: new Date().toISOString(),
              error: errorText,
              archiveDir: APPROVAL_AUDIT_ARCHIVE_DIR,
            },
          },
        })
        .catch(() => null);
      throw err;
    }
  }
}
