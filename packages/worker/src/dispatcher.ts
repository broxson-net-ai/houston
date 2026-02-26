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

    if (!template) throw new Error(`Template not found: ${templateId}`);

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

    if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`);
    if (!schedule.template) throw new Error(`Template not found for schedule: ${scheduleId}`);

    const agentId = schedule.template.defaultAgentId;
    if (!agentId) throw new Error("Template has no default agent");

    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

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
      },
    });

    if (!this.gatewayClient?.isConnected()) {
      await db.taskRun.update({
        where: { id: taskRun.id },
        data: { status: TaskRunStatus.FAILED, errorText: "Gateway not connected" },
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
          message: "Gateway not connected",
        },
      });
      return;
    }

    const requestPayload = {
      routingKey: agent.routingKey,
      instructions: assembled,
      metadata: {
        templateId: schedule.templateId,
        scheduleId,
        dueAt,
        tags: schedule.template.tags,
        priority: schedule.template.priority,
      },
      deliveryHint: "primary channel",
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
          gatewayRunId: response?.run_id as string ?? null,
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
          metadata: { gatewayRunId: (response?.run_id as string) ?? null },
        },
      });
    } catch (err) {
      const errorText = err instanceof Error ? err.message : String(err);
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
        },
      });
    }
  }
}
