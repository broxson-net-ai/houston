/Users/openclaw/projects/houston-fork/packages/worker/src/scheduler.ts
import PgBoss from "pg-boss";
import { db } from "@houston/shared";
import cronParser from "cron-parser";
import { DispatchService, DispatchJobData } from "./dispatcher.js";

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
      await this.updateSystemStatus();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Failed to update system status: ${errorText}`);
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
        status: { in: ["QUEUE", "IN_PROGRESS"] },
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
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(
        `[scheduler] Failed to cleanup old logs: ${errorText} ` +
            `(retention: ${LOG_RETENTION_DAYS} days)`
      );
    }
  }
}
