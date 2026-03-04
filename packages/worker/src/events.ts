import { db, TaskStatus, TaskRunStatus } from "@houston/shared";
import { GatewayClient, GatewayEvent } from "./gateway.js";

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

  constructor(private gatewayClient: GatewayClient) {}

  start() {
    this.gatewayClient.on("event", (event: GatewayEvent) => {
      this.handleEvent(event).catch((err) => {
        console.error("[events] Error handling event:", err);
      });
    });
  }

  private async handleEvent(event: GatewayEvent): Promise<void> {
    // Expect OpenClaw event framing
    const eventName = (event as any).event as string | undefined;
    const payload = (event as any).payload as any;

    if (eventName !== "agent") return;
    const gatewayRunId = payload?.runId as string | undefined;
    if (!gatewayRunId) return;

    const taskRun = await db.taskRun.findFirst({
      where: { gatewayRunId },
      include: { task: true },
    });

    if (!taskRun) return;

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
          },
        });
        return;
      }

      if (phase === "error") {
        const errorText = (data?.error as string) ?? "Run failed";
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

      let logEntry = await db.taskLog.findFirst({
        where: { taskRunId: taskRun.id },
        orderBy: { createdAt: "desc" },
      });
      if (!logEntry) {
        logEntry = await db.taskLog.create({
          data: { taskRunId: taskRun.id, logText: "", truncated: false },
        });
      }

      const newSize = currentSize + chunkSize;
      const truncated = newSize >= MAX_LOG_BYTES;
      const appendText = truncated
        ? text.slice(0, MAX_LOG_BYTES - currentSize)
        : text;

      await db.taskLog.update({
        where: { id: logEntry.id },
        data: { logText: logEntry.logText + appendText, truncated },
      });

      this.logSizes.set(taskRun.id, Math.min(newSize, MAX_LOG_BYTES));
      return;
    }
  }
}
