import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@houston/shared";
import { DispatchService } from "../dispatcher.js";

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === "1";

describe.runIf(shouldRun)("DispatchService integration (DB-backed)", () => {
  const createdTaskIds: string[] = [];
  const createdTaskRunIds: string[] = [];
  const createdApprovalIds: string[] = [];
  let createdScheduleId: string | null = null;
  let createdTemplateId: string | null = null;
  let createdAgentId: string | null = null;

  beforeAll(async () => {
    process.env.HOUSTON_APPROVAL_TRUST_DEFAULT = "always";
    process.env.HOUSTON_APPROVAL_TRUST_MODES = JSON.stringify({
      "exec-assistant.external-send": "once-per-session",
    });
  });

  afterAll(async () => {
    if (createdApprovalIds.length > 0) {
      await db.approvalRequest.deleteMany({
        where: { id: { in: createdApprovalIds } },
      });
    }
    if (createdTaskRunIds.length > 0) {
      await db.taskEvent.deleteMany({
        where: { taskRunId: { in: createdTaskRunIds } },
      });
      await db.taskRun.deleteMany({
        where: { id: { in: createdTaskRunIds } },
      });
    }
    if (createdTaskIds.length > 0) {
      await db.taskEvent.deleteMany({
        where: { taskId: { in: createdTaskIds } },
      });
      await db.task.deleteMany({
        where: { id: { in: createdTaskIds } },
      });
    }
    if (createdScheduleId) {
      await db.taskEvent.deleteMany({ where: { scheduleId: createdScheduleId } });
      await db.schedule.deleteMany({ where: { id: createdScheduleId } });
    }
    if (createdTemplateId) {
      await db.template.deleteMany({ where: { id: createdTemplateId } });
    }
    if (createdAgentId) {
      await db.agent.deleteMany({ where: { id: createdAgentId } });
    }
  });

  it("uses prior same-session approval to auto-approve follow-up dispatch", async () => {
    const runTag = `int-${Date.now()}`;
    const gateway = {
      isConnected: () => true,
      request: async (_type: string, _payload: unknown, idempotencyKey: string) => ({
        runId: `gw-${idempotencyKey}`,
      }),
    };
    const service = new DispatchService(gateway as any);

    const agent = await db.agent.create({
      data: {
        name: `exec-assistant-${runTag}`,
        routingKey: `agent:exec-assistant:${runTag}`,
        enabled: true,
        tags: ["integration", "trust-ladder"],
      },
    });
    createdAgentId = agent.id;

    const template = await db.template.create({
      data: {
        name: `trust-ladder-int-${runTag}`,
        defaultAgentId: agent.id,
        instructions: "Draft and send an email update to customer success team.",
        tags: ["integration", "trust-ladder"],
        priority: 0,
        enabled: true,
      },
    });
    createdTemplateId = template.id;

    const schedule = await db.schedule.create({
      data: {
        templateId: template.id,
        cron: "*/10 * * * *",
        timezone: "America/Los_Angeles",
        enabled: true,
      },
    });
    createdScheduleId = schedule.id;

    const dueAtOne = new Date(Date.now() + 60_000).toISOString();
    const dueAtTwo = new Date(Date.now() + 120_000).toISOString();

    await service.dispatch({ scheduleId: schedule.id, dueAt: dueAtOne });

    const runOne = await db.taskRun.findFirst({
      where: { idempotencyKey: `dispatch:${schedule.id}:${dueAtOne}` },
      include: { task: true },
    });
    expect(runOne).toBeTruthy();
    if (!runOne?.task) throw new Error("run one task missing");
    createdTaskRunIds.push(runOne.id);
    createdTaskIds.push(runOne.task.id);

    const approvalOne = await db.approvalRequest.findFirst({
      where: { taskRunId: runOne.id },
      orderBy: { createdAt: "desc" },
    });
    expect(approvalOne?.decision).toBe("PENDING");
    if (!approvalOne) throw new Error("approval one missing");
    createdApprovalIds.push(approvalOne.id);

    await db.approvalRequest.update({
      where: { id: approvalOne.id },
      data: {
        decision: "APPROVED",
        decider: "integration-test",
        reason: "seed approval",
        decidedAt: new Date(),
      },
    });

    await service.resumeApprovedRequests(50);

    const runOneAfter = await db.taskRun.findUnique({ where: { id: runOne.id } });
    expect(runOneAfter?.gatewayRunId).toBeTruthy();

    await service.dispatch({ scheduleId: schedule.id, dueAt: dueAtTwo });

    const runTwo = await db.taskRun.findFirst({
      where: { idempotencyKey: `dispatch:${schedule.id}:${dueAtTwo}` },
      include: { task: true },
    });
    expect(runTwo).toBeTruthy();
    if (!runTwo?.task) throw new Error("run two task missing");
    createdTaskRunIds.push(runTwo.id);
    createdTaskIds.push(runTwo.task.id);

    const approvalTwo = await db.approvalRequest.findFirst({
      where: { taskRunId: runTwo.id },
      orderBy: { createdAt: "desc" },
    });
    expect(approvalTwo).toBeTruthy();
    if (!approvalTwo) throw new Error("approval two missing");
    createdApprovalIds.push(approvalTwo.id);

    expect(approvalTwo.decision).toBe("APPROVED");
    expect(approvalTwo.decider).toBe("policy:trust-ladder");

    const runTwoAfter = await db.taskRun.findUnique({ where: { id: runTwo.id } });
    expect(runTwoAfter?.gatewayRunId).toBeTruthy();
  }, 30_000);
});
