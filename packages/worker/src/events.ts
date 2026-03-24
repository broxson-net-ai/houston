import { db, TaskStatus, TaskRunStatus } from "@houston/shared";
import { GatewayClient, GatewayEvent } from "./gateway.js";

const LOG_RETENTION_DAYS = parseInt(
  process.env.HOUSTON_LOG_RETENTION_DAYS ?? "30",
  10
);

function getMaxLogBytes(): number {
  return parseInt(process.env.MAX_LOG_BYTES ?? "10485760", 10);
}

// Houston upstream expected legacy gateway events:
//   run_started/run_completed/run_failed/log_chunk
// Current OpenClaw gateway emits a unified event frame:
//   { type:"event", event:"agent", payload:{ runId, stream, data, ... } }
// We map a minimal subset of those events into TaskRun/Task/TaskLog updates.

export class GatewayEventHandler {
  private logSizes = new Map<string, number>(); // taskRunId → current log size
  private logEntryIds = new Map<string, string>(); // taskRunId → taskLogId
  private runQueues = new Map<string, Promise<void>>(); // gatewayRunId → serial queue
  private unresolvedRuns = new Set<string>();

  constructor(private gatewayClient: GatewayClient) {}

  start() {
    this.gatewayClient.on("event", (event: GatewayEvent) => {
      const eventName = (event as any).event as string | undefined;
      const payload = (event as any).payload as any;
      const gatewayRunId = payload?.runId as string | undefined;

      if (eventName !== "agent" || !gatewayRunId) {
        return;
      }

      this.enqueueRunEvent(gatewayRunId, async () => {
        await this.handleEvent(event, gatewayRunId);
      }).catch((err) => {
        const errorText = err instanceof Error ? err.message : String(err);
        console.error(`[events] Error handling event: ${errorText}`);
      });
    });
  }

  private enqueueRunEvent(gatewayRunId: string, fn: () => Promise<void>) {
    const previous = this.runQueues.get(gatewayRunId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(fn)
      .finally(() => {
        if (this.runQueues.get(gatewayRunId) === next) {
          this.runQueues.delete(gatewayRunId);
        }
      });
    this.runQueues.set(gatewayRunId, next);
    return next;
  }

  private async handleEvent(event: GatewayEvent, gatewayRunId: string): Promise<void> {
    const payload = (event as any).payload as any;

    const taskRun = await this.findTaskRunWithRetry(gatewayRunId);
    if (!taskRun) {
      if (!this.unresolvedRuns.has(gatewayRunId)) {
        this.unresolvedRuns.add(gatewayRunId);
        console.warn(`[events] No task run found for gatewayRunId after retry: ${gatewayRunId}`);
      }
      return;
    }

    this.unresolvedRuns.delete(gatewayRunId);

    const stream = payload?.stream as string | undefined;
    const data = payload?.data as any;

    // Lifecycle mapping
    if (stream === "lifecycle") {
      const phase = data?.phase as string | undefined;

      if (phase === "start") {
        await db.taskRun.update({
          where: { id: taskRun.id },
          data: { status: TaskRunStatus.RUNNING, startedAt: new Date() },
        });
        await db.task.update({
          where: { id: taskRun.taskId },
          data: { status: TaskStatus.IN_PROGRESS },
        });
        await db.taskEvent.create({
          data: {
            taskId: taskRun.taskId,
            taskRunId: taskRun.id,
            type: "STARTED",
            message: "Run started",
            metadata: { gatewayRunId },
          },
        });
        return;
      }

      if (phase === "end") {
        await db.taskRun.update({
          where: { id: taskRun.id },
          data: { status: TaskRunStatus.COMPLETED, finishedAt: new Date() },
        });
        await db.task.update({
          where: { id: taskRun.taskId },
          data: { status: TaskStatus.DONE },
        });
        await db.taskEvent.create({
          data: {
            taskId: taskRun.taskId,
            taskRunId: taskRun.id,
            type: "COMPLETED",
            message: "Run completed successfully",
            metadata: { gatewayRunId },
          },
        });
        return;
      }

      if (phase === "error") {
        const errorText = (data?.error as string) ?? "Run failed";
        console.error(`[events] Agent error (taskRunId: ${taskRun.id}, taskId: ${taskRun.taskId}): ${errorText}`);
        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            status: TaskRunStatus.FAILED,
            finishedAt: new Date(),
            errorText,
          },
        });
        await db.task.update({
          where: { id: taskRun.taskId },
          data: { status: TaskStatus.FAILED },
        });
        await db.taskEvent.create({
          data: {
            taskId: taskRun.taskId,
            taskRunId: taskRun.id,
            type: "FAILED",
            message: errorText,
            metadata: { gatewayRunId },
          },
        });
        return;
      }
    }

    // Log-ish mapping (best-effort)
    // Append assistant stream text to TaskLog (this keeps the UI useful even
    // before we implement full tool/log streaming support).
    if (stream === "assistant") {
      const text = (data?.text as string) ?? "";
      if (!text) return;

      const chunkSize = Buffer.byteLength(text, "utf8");
      const currentSize = this.logSizes.get(taskRun.id) ?? 0;
      const MAX_LOG_BYTES = getMaxLogBytes();
      if (currentSize >= MAX_LOG_BYTES) return;

      let logEntryId = this.logEntryIds.get(taskRun.id);
      if (!logEntryId) {
        const existingLog = await db.taskLog.findFirst({
          where: { taskRunId: taskRun.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (existingLog) {
          logEntryId = existingLog.id;
        } else {
          const createdLog = await db.taskLog.create({
            data: { taskRunId: taskRun.id, logText: "", truncated: false },
            select: { id: true },
          });
          logEntryId = createdLog.id;
        }

        this.logEntryIds.set(taskRun.id, logEntryId);
      }

      const newSize = currentSize + chunkSize;
      const truncated = newSize >= MAX_LOG_BYTES;
      const appendText = truncated
        ? text.slice(0, MAX_LOG_BYTES - currentSize)
        : text;

      await db.$executeRaw`
        UPDATE task_logs
        SET "logText" = "logText" || ${appendText},
            truncated = ${truncated}
        WHERE id = ${logEntryId}
      `;

      this.logSizes.set(taskRun.id, Math.min(newSize, MAX_LOG_BYTES));
      return;
    }
  }

  private async findTaskRunWithRetry(gatewayRunId: string) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const taskRun = await db.taskRun.findFirst({
        where: { gatewayRunId },
        include: { task: true },
      });
      if (taskRun) {
        return taskRun;
      }
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    return null;
  }

  /**
   * Cleanup old task logs beyond retention period
   */
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
          `[events] Cleaned up ${deletedLogs.count} old task logs ` +
            `older than ${LOG_RETENTION_DAYS} days`
        );
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(
        `[events] Failed to cleanup old logs: ${errorText} ` +
            `(retention: ${LOG_RETENTION_DAYS} days)`
      );
    }
  }
}
