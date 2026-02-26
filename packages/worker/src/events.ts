import { db, TaskStatus, TaskRunStatus } from "@houston/shared";
import { GatewayClient, GatewayEvent } from "./gateway.js";

function getMaxLogBytes(): number {
  return parseInt(process.env.MAX_LOG_BYTES ?? "10485760", 10);
}

export class GatewayEventHandler {
  private logSizes = new Map<string, number>(); // taskRunId → current log size

  constructor(private gatewayClient: GatewayClient) {}

  start() {
    this.gatewayClient.on("event", (event: GatewayEvent) => {
      this.handleEvent(event).catch((err) => {
        console.error("[events] Error handling event:", err);
      });
    });
  }

  private async handleEvent(event: GatewayEvent): Promise<void> {
    const { type, run_id: gatewayRunId } = event;

    if (!gatewayRunId) return;

    const taskRun = await db.taskRun.findFirst({
      where: { gatewayRunId: gatewayRunId as string },
      include: { task: true },
    });

    if (!taskRun) {
      console.warn(`[events] No TaskRun found for gatewayRunId: ${gatewayRunId}`);
      return;
    }

    switch (type) {
      case "run_started":
        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            status: TaskRunStatus.RUNNING,
            startedAt: new Date(),
          },
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
          },
        });
        break;

      case "run_completed":
        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            status: TaskRunStatus.COMPLETED,
            finishedAt: new Date(),
            responsePayload: event.payload as object ?? taskRun.responsePayload,
          },
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
          },
        });
        break;

      case "run_failed":
        await db.taskRun.update({
          where: { id: taskRun.id },
          data: {
            status: TaskRunStatus.FAILED,
            finishedAt: new Date(),
            errorText: event.error as string ?? "Run failed",
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
            message: event.error as string ?? "Run failed",
          },
        });
        break;

      case "log_chunk": {
        const chunk = (event.chunk as string) ?? "";
        const chunkSize = Buffer.byteLength(chunk, "utf8");
        const currentSize = this.logSizes.get(taskRun.id) ?? 0;
        const MAX_LOG_BYTES = getMaxLogBytes();

        if (currentSize >= MAX_LOG_BYTES) {
          // Already at cap, don't append
          return;
        }

        // Get or create log entry
        let logEntry = await db.taskLog.findFirst({
          where: { taskRunId: taskRun.id },
          orderBy: { createdAt: "desc" },
        });

        if (!logEntry) {
          logEntry = await db.taskLog.create({
            data: {
              taskRunId: taskRun.id,
              logText: "",
              truncated: false,
            },
          });
        }

        const newSize = currentSize + chunkSize;
        const truncated = newSize >= MAX_LOG_BYTES;
        const appendText = truncated
          ? chunk.slice(0, MAX_LOG_BYTES - currentSize)
          : chunk;

        await db.taskLog.update({
          where: { id: logEntry.id },
          data: {
            logText: logEntry.logText + appendText,
            truncated,
          },
        });

        this.logSizes.set(taskRun.id, Math.min(newSize, MAX_LOG_BYTES));
        break;
      }
    }
  }
}
