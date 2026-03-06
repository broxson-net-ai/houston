import { db, TaskStatus, TaskRunStatus } from "@houston/shared";
import { v4 as uuidv4 } from "uuid";
import { GatewayClient } from "./gateway.js";

export type DispatchJobData = {
  scheduleId: string;
  dueAt: string; // ISO string
};

export class DispatchService {
  constructor(private gatewayClient?: GatewayClient) {}

  async assembleInstructions(
    templateId: string,
    instructionsOverride?: string | null
  ): Promise<{ assembled: string; preVersion: string | null }> {
    const [activePreInstr, template] = await Promise.all([
      db.preInstructionsVersion.findFirst({ where: { isActive: true } }),
      db.template.findUnique({ where: { id: templateId } }),
    ]);

    if (!template) {
      const errorText = `Template not found: ${templateId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const parts: string[] = [];

    if (activePreInstr) {
      parts.push("=== PRE-INSTRUCTIONS ===");
      parts.push(activePreInstr.content);
    }

    parts.push("=== TASK INSTRUCTIONS ===");
    parts.push(template.instructions);

    if (instructionsOverride) {
      parts.push("=== OVERRIDE ===");
      parts.push(instructionsOverride);
    }

    return {
      assembled: parts.join("\n\n"),
      preVersion: activePreInstr?.id ?? null,
    };
  }

  async dispatch(data: DispatchJobData): Promise<void> {
    const { scheduleId, dueAt } = data;
    const dueAtDate = new Date(dueAt);

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { template: true },
    });

    if (!schedule) {
      const errorText = `Schedule not found: ${scheduleId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }
    if (!schedule.template) {
      const errorText = `Template not found for schedule: ${scheduleId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const agentId = schedule.template.defaultAgentId;
    if (!agentId) {
      const errorText = "Template has no default agent";
      console.error(`[dispatcher] ${errorText} (scheduleId: ${scheduleId})`);
      throw new Error(errorText);
    }

    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      const errorText = `Agent not found: ${agentId}`;
      console.error(`[dispatcher] ${errorText}`);
      throw new Error(errorText);
    }

    const { assembled, preVersion } = await this.assembleInstructions(
      schedule.templateId,
      null
    );

    // Idempotency key: scheduleId + dueAt
    const idempotencyKey = `dispatch:${scheduleId}:${dueAt}`;

    // Check for existing task (idempotency)
    const existingRun = await db.taskRun.findFirst({
      where: { idempotencyKey },
    });
    if (existingRun) {
      console.log(`[dispatcher] Skipping duplicate dispatch: ${idempotencyKey}`);
      return;
    }

    // Create Task
    const task = await db.task.create({
      data: {
        title: `${schedule.template.name} — ${dueAtDate.toISOString()}`,
        templateId: schedule.templateId,
        scheduleId,
        agentId,
        dueAt: dueAtDate,
        status: TaskStatus.QUEUE,
        assembledInstructionsSnapshot: assembled,
        preInstructionsVersion: preVersion ?? undefined,
      },
    });

    // Create TaskRun
    const taskRun = await db.taskRun.create({
      data: {
        taskId: task.id,
        attemptNumber: 1,
        status: TaskRunStatus.ACCEPTED,
        idempotencyKey,
        dispatchedAt: new Date(),
      },
    });

    // Create CREATED event
    await db.taskEvent.create({
      data: {
        taskId: task.id,
        scheduleId,
        type: "CREATED",
        message: `Task created for schedule ${scheduleId}`,
        metadata: { templateId: schedule.templateId },
      },
    });

    if (!this.gatewayClient?.isConnected()) {
      const errorText = "Gateway not connected";
      console.error(`[dispatcher] ${errorText} (scheduleId: ${scheduleId}, taskId: ${task.id}, templateId: ${schedule.templateId})`);
      await db.taskRun.update({
        where: { id: taskRun.id },
        data: { status: TaskRunStatus.FAILED, errorText },
      });
      await db.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.FAILED },
      });
      await db.taskEvent.create({
        data: {
          taskId: task.id,
          taskRunId: taskRun.id,
          type: "FAILED",
          message: errorText,
          metadata: { scheduleId, templateId: schedule.templateId },
        },
      });
      return;
    }

    // OpenClaw Gateway (current) expects to "agent" method params to look like
    // { message, sessionKey, idempotencyKey, deliver, channel, lane, timeout, ... }
    // not older { routingKey, instructions } shape.
    const requestPayload = {
      message: assembled,
      sessionKey: agent.routingKey, // e.g. "agent:main:main"
      idempotencyKey,
      deliver: false,
      channel: "webchat",
      lane: "cron",
      timeout: 0,
      // NOTE: OpenClaw's agent params schema is strict (additionalProperties: false)
      // so we cannot send arbitrary metadata here.
    };

    try {
      const response = await this.gatewayClient!.request(
        "agent",
        requestPayload,
        idempotencyKey
      ) as Record<string, unknown>;

      await db.taskRun.update({
        where: { id: taskRun.id },
        data: {
          wsRequestId: taskRun.id,
          // OpenClaw returns runId (camelCase)
          gatewayRunId: (response?.runId as string) ?? null,
          requestPayload: requestPayload as object,
          responsePayload: response as object,
          status: TaskRunStatus.ACCEPTED,
        },
      });

      await db.taskEvent.create({
        data: {
          taskId: task.id,
          taskRunId: taskRun.id,
          scheduleId,
          type: "DISPATCHED",
          message: `Dispatched to agent ${agent.routingKey}`,
          metadata: { gatewayRunId: (response?.runId as string) ?? null, templateId: schedule.templateId },
        },
      });
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
      console.error(`[dispatcher] Dispatch failed (scheduleId: ${scheduleId}, taskId: ${task.id}, templateId: ${schedule.templateId}, taskRunId: ${taskRun.id}): ${errorText}`);
      await db.taskRun.update({
        where: { id: taskRun.id },
        data: {
          status: TaskRunStatus.FAILED,
          errorText,
          requestPayload,
        },
      });
      await db.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.FAILED },
      });
      await db.taskEvent.create({
        data: {
          taskId: task.id,
          taskRunId: taskRun.id,
          type: "FAILED",
          message: `Dispatch failed: ${errorText}`,
          metadata: { scheduleId, templateId: schedule.templateId },
        },
      });
    }
  }
}
