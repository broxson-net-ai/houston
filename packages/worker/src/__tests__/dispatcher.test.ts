import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

const mockDb = vi.hoisted(() => ({
  preInstructionsVersion: {
    findFirst: vi.fn(),
  },
  template: {
    findUnique: vi.fn(),
  },
  agent: {
    findUnique: vi.fn(),
  },
  schedule: {
    findUnique: vi.fn(),
  },
  task: {
    create: vi.fn(),
    update: vi.fn(),
  },
  taskRun: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  taskEvent: {
    create: vi.fn(),
  },
  approvalRequest: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@houston/shared", () => ({
  db: mockDb,
  TaskStatus: {
    QUEUE: "QUEUE",
    IN_PROGRESS: "IN_PROGRESS",
    DONE: "DONE",
    FAILED: "FAILED",
  },
  TaskRunStatus: {
    ACCEPTED: "ACCEPTED",
    RUNNING: "RUNNING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
  },
}));

import { DispatchService } from "../dispatcher.js";

function extractApprovalIntentText(assembled: string): string {
  const sectionContent = new Map<string, string[]>();
  let currentSection = "BODY";
  sectionContent.set(currentSection, []);

  for (const line of assembled.split(/\r?\n/)) {
    const marker = line.match(/^===\s+(.+?)\s+===$/);
    if (marker) {
      currentSection = marker[1].trim().toUpperCase();
      if (!sectionContent.has(currentSection)) sectionContent.set(currentSection, []);
      continue;
    }
    sectionContent.get(currentSection)?.push(line);
  }

  const selected = ["TASK INSTRUCTIONS", "OVERRIDE", "REVISION"]
    .map((key) => (sectionContent.get(key) || []).join("\n").trim())
    .filter(Boolean);

  return selected.length > 0 ? selected.join("\n\n") : assembled;
}

function canonicalizeIntentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function approvalPattern(role: string, trigger: string, assembled: string): string {
  const canonical = canonicalizeIntentText(extractApprovalIntentText(assembled));
  return createHash("sha256").update(`v2|${role}|${trigger}|${canonical}`).digest("hex").slice(0, 16);
}

function setTrustEnv(defaultMode: string, modes: Record<string, string> = {}) {
  process.env.HOUSTON_APPROVAL_TRUST_DEFAULT = defaultMode;
  process.env.HOUSTON_APPROVAL_TRUST_MODES = Object.keys(modes).length ? JSON.stringify(modes) : "";
}

describe("DispatchService.assembleInstructions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.taskEvent.create.mockResolvedValue({});
  });

  it("assembles instructions in correct order: pre → template → override", async () => {
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue({
      id: "pre-1",
      content: "Pre-instructions content",
      isActive: true,
    });
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-1",
      name: "Test Template",
      instructions: "Template instructions",
      defaultAgentId: "agent-1",
    });

    const service = new DispatchService();
    const result = await service.assembleInstructions("tmpl-1", "Override content");

    expect(result.assembled).toContain("Pre-instructions content");
    expect(result.assembled).toContain("Template instructions");
    expect(result.assembled).toContain("Override content");

    const preIdx = result.assembled.indexOf("Pre-instructions content");
    const tmplIdx = result.assembled.indexOf("Template instructions");
    const overrideIdx = result.assembled.indexOf("Override content");

    expect(preIdx).toBeLessThan(tmplIdx);
    expect(tmplIdx).toBeLessThan(overrideIdx);
  });

  it("omits override section when no override", async () => {
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue({
      id: "pre-1",
      content: "Pre-instructions content",
      isActive: true,
    });
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-1",
      instructions: "Template instructions",
      defaultAgentId: "agent-1",
    });

    const service = new DispatchService();
    const result = await service.assembleInstructions("tmpl-1");

    expect(result.assembled).not.toContain("OVERRIDE");
    expect(result.assembled).toContain("Template instructions");
  });
});

describe("DispatchService.dispatch", () => {
  let mockGateway: { isConnected: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.taskEvent.create.mockResolvedValue({});
    mockDb.approvalRequest.findUnique.mockResolvedValue(null);
    mockDb.approvalRequest.findMany.mockResolvedValue([]);
    setTrustEnv("always");
    mockGateway = {
      isConnected: vi.fn().mockReturnValue(true),
      request: vi.fn(),
    };
  });

  it("creates Task and TaskRun with ACCEPTED status on success", async () => {
    const scheduleId = "sched-1";
    const dueAt = new Date("2026-01-01T05:00:00Z").toISOString();

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-1",
      template: {
        id: "tmpl-1",
        name: "Test",
        defaultAgentId: "agent-1",
        instructions: "Do the thing",
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      name: "Test Agent",
      routingKey: "test-agent",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-1",
      instructions: "Do the thing",
      defaultAgentId: "agent-1",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null); // No existing run
    mockDb.task.create.mockResolvedValue({ id: "task-1", status: "QUEUE" });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-1", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.taskRun.update.mockResolvedValue({ id: "run-1", status: "ACCEPTED" });

    mockGateway.request.mockResolvedValue({ run_id: "gw-run-1" });

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    expect(mockDb.task.create).toHaveBeenCalled();
    expect(mockDb.taskRun.create).toHaveBeenCalled();
    expect(mockGateway.request).toHaveBeenCalledWith("agent", expect.any(Object), expect.any(String));
  });

  it("marks Task and TaskRun as FAILED on gateway error", async () => {
    const scheduleId = "sched-2";
    const dueAt = new Date("2026-01-01T06:00:00Z").toISOString();

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-1",
      template: {
        id: "tmpl-1",
        name: "Test",
        defaultAgentId: "agent-1",
        instructions: "Do the thing",
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      routingKey: "test-agent",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-1",
      instructions: "Do the thing",
      defaultAgentId: "agent-1",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: "task-2", status: "QUEUE" });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-2", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.taskRun.update.mockResolvedValue({});
    mockDb.task.update.mockResolvedValue({});

    mockGateway.request.mockRejectedValue(new Error("Gateway error"));

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    expect(mockDb.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
    expect(mockDb.taskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("retries retriable gateway errors and succeeds on later attempt", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    process.env.HOUSTON_GATEWAY_RETRY_MAX_ATTEMPTS = "3";
    process.env.HOUSTON_GATEWAY_RETRY_BASE_DELAY_MS = "1";
    process.env.HOUSTON_GATEWAY_RETRY_MAX_DELAY_MS = "1";

    const scheduleId = "sched-retry-success";
    const dueAt = new Date("2026-01-01T06:30:00Z").toISOString();

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-1",
      template: {
        id: "tmpl-1",
        name: "Retry Test",
        defaultAgentId: "agent-1",
        instructions: "Do the thing",
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      routingKey: "test-agent",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-1",
      instructions: "Do the thing",
      defaultAgentId: "agent-1",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: "task-retry-success", status: "QUEUE" });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-retry-success", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.taskRun.update.mockResolvedValue({});

    mockGateway.request
      .mockRejectedValueOnce(new Error("Request timeout: agent"))
      .mockResolvedValueOnce({ runId: "gw-run-retry-success" });

    const service = new DispatchService(mockGateway as any);
    const pending = service.dispatch({ scheduleId, dueAt });

    await vi.advanceTimersByTimeAsync(1_000);
    await pending;

    expect(mockGateway.request).toHaveBeenCalledTimes(2);
    expect(mockDb.task.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );

    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it("does not retry non-retriable gateway errors", async () => {
    process.env.HOUSTON_GATEWAY_RETRY_MAX_ATTEMPTS = "3";
    process.env.HOUSTON_GATEWAY_RETRY_BASE_DELAY_MS = "1";
    process.env.HOUSTON_GATEWAY_RETRY_MAX_DELAY_MS = "1";

    const scheduleId = "sched-no-retry";
    const dueAt = new Date("2026-01-01T06:40:00Z").toISOString();

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-1",
      template: {
        id: "tmpl-1",
        name: "No Retry Test",
        defaultAgentId: "agent-1",
        instructions: "Do the thing",
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      routingKey: "test-agent",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-1",
      instructions: "Do the thing",
      defaultAgentId: "agent-1",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: "task-no-retry", status: "QUEUE" });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-no-retry", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.taskRun.update.mockResolvedValue({});
    mockDb.task.update.mockResolvedValue({});

    mockGateway.request.mockRejectedValue(new Error("Unauthorized"));

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    expect(mockGateway.request).toHaveBeenCalledTimes(1);
    expect(mockDb.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("idempotency: skips dispatch if TaskRun with same key already exists", async () => {
    const scheduleId = "sched-3";
    const dueAt = new Date("2026-01-01T07:00:00Z").toISOString();

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-1",
      template: {
        id: "tmpl-1",
        name: "Test",
        defaultAgentId: "agent-1",
        instructions: "Do the thing",
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({ id: "agent-1", routingKey: "test-agent" });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({ id: "tmpl-1", instructions: "x", defaultAgentId: "agent-1" });

    // Existing run with same idempotency key
    mockDb.taskRun.findFirst.mockResolvedValue({ id: "existing-run" });

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    // Should NOT create new task or taskRun
    expect(mockDb.task.create).not.toHaveBeenCalled();
    expect(mockGateway.request).not.toHaveBeenCalled();
  });

  it("auto-creates approval request and blocks dispatch for exec-assistant external-send", async () => {
    const scheduleId = "sched-approval-1";
    const dueAt = new Date("2026-01-01T08:00:00Z").toISOString();

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-approval-1",
      template: {
        id: "tmpl-approval-1",
        name: "Exec Assistant Send",
        defaultAgentId: "agent-exec",
        instructions: "Draft and send an email update to client",
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-exec",
      routingKey: "agent:exec-assistant:main",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-approval-1",
      instructions: "Draft and send an email update to client",
      defaultAgentId: "agent-exec",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: "task-approval-1", status: "QUEUE", projectId: null });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-approval-1", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.approvalRequest.create.mockResolvedValue({ id: "approval-1" });
    mockDb.taskRun.update.mockResolvedValue({ id: "run-approval-1" });

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    expect(mockDb.approvalRequest.create).toHaveBeenCalled();
    expect(mockGateway.request).not.toHaveBeenCalled();
    expect(mockDb.taskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining("Awaiting approval"),
        }),
      })
    );
  });

  it("auto-approves matching trust-ladder request and dispatches immediately", async () => {
    setTrustEnv("always", { "exec-assistant.external-send": "once-ever" });

    const scheduleId = "sched-trust-1";
    const dueAt = new Date("2026-01-01T08:30:00Z").toISOString();
    const instructions = "Draft and send an email update to client";
    const assembled = `=== TASK INSTRUCTIONS ===\n\n${instructions}`;
    const pattern = approvalPattern("exec-assistant", "external-send", assembled);

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-trust-1",
      template: {
        id: "tmpl-trust-1",
        name: "Trust Ladder Send",
        defaultAgentId: "agent-exec",
        instructions,
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-exec",
      routingKey: "agent:exec-assistant:main",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-trust-1",
      instructions,
      defaultAgentId: "agent-exec",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: "task-trust-1", status: "QUEUE", projectId: null });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-trust-1", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.approvalRequest.findMany.mockResolvedValue([
      {
        id: "approval-history-1",
        decision: "APPROVED",
        context: {
          approvalPattern: pattern,
          sessionId: "agent:exec-assistant:other",
        },
      },
    ]);
    mockDb.approvalRequest.create.mockResolvedValue({ id: "approval-auto-1" });
    mockDb.taskRun.update.mockResolvedValue({ id: "run-trust-1", status: "ACCEPTED" });
    mockGateway.request.mockResolvedValue({ runId: "gw-run-trust-1" });

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    expect(mockDb.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: "APPROVED",
          decider: "policy:trust-ladder",
        }),
      })
    );
    expect(mockGateway.request).toHaveBeenCalled();
    expect(mockDb.taskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: expect.stringContaining("Approval auto-satisfied"),
        }),
      })
    );
  });

  it("requires approval for once-per-session when prior approval is from another session", async () => {
    setTrustEnv("always", { "exec-assistant.external-send": "once-per-session" });

    const scheduleId = "sched-trust-session-mismatch";
    const dueAt = new Date("2026-01-01T08:45:00Z").toISOString();
    const instructions = "Draft and send an email update to client";
    const assembled = `=== TASK INSTRUCTIONS ===\n\n${instructions}`;
    const pattern = approvalPattern("exec-assistant", "external-send", assembled);

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-trust-session-mismatch",
      template: {
        id: "tmpl-trust-session-mismatch",
        name: "Trust Ladder Session Mismatch",
        defaultAgentId: "agent-exec",
        instructions,
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-exec",
      routingKey: "agent:exec-assistant:main",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-trust-session-mismatch",
      instructions,
      defaultAgentId: "agent-exec",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: "task-trust-session-mismatch", status: "QUEUE", projectId: null });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-trust-session-mismatch", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.approvalRequest.findMany.mockResolvedValue([
      {
        id: "approval-history-session-mismatch",
        decision: "APPROVED",
        context: {
          approvalPattern: pattern,
          sessionId: "agent:exec-assistant:other",
        },
      },
    ]);
    mockDb.approvalRequest.create.mockResolvedValue({ id: "approval-session-mismatch" });

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    expect(mockGateway.request).not.toHaveBeenCalled();
    expect(mockDb.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ decision: "APPROVED" }),
      })
    );
    expect(mockDb.taskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message: expect.stringContaining("Awaiting approval") }),
      })
    );
  });

  it("auto-approves for auto mode without history lookup", async () => {
    setTrustEnv("always", { "exec-assistant.external-send": "auto" });

    const scheduleId = "sched-trust-auto";
    const dueAt = new Date("2026-01-01T08:50:00Z").toISOString();
    const instructions = "Draft and send an email update to client";

    mockDb.schedule.findUnique.mockResolvedValue({
      id: scheduleId,
      templateId: "tmpl-trust-auto",
      template: {
        id: "tmpl-trust-auto",
        name: "Trust Ladder Auto",
        defaultAgentId: "agent-exec",
        instructions,
        tags: [],
        priority: 0,
      },
    });
    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-exec",
      routingKey: "agent:exec-assistant:main",
    });
    mockDb.preInstructionsVersion.findFirst.mockResolvedValue(null);
    mockDb.template.findUnique.mockResolvedValue({
      id: "tmpl-trust-auto",
      instructions,
      defaultAgentId: "agent-exec",
    });
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.task.create.mockResolvedValue({ id: "task-trust-auto", status: "QUEUE", projectId: null });
    mockDb.taskRun.create.mockResolvedValue({ id: "run-trust-auto", idempotencyKey: `dispatch:${scheduleId}:${dueAt}` });
    mockDb.approvalRequest.create.mockResolvedValue({ id: "approval-auto-mode" });
    mockDb.taskRun.update.mockResolvedValue({ id: "run-trust-auto", status: "ACCEPTED" });
    mockGateway.request.mockResolvedValue({ runId: "gw-run-trust-auto" });

    const service = new DispatchService(mockGateway as any);
    await service.dispatch({ scheduleId, dueAt });

    expect(mockDb.approvalRequest.findMany).not.toHaveBeenCalled();
    expect(mockDb.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ decision: "APPROVED", decider: "policy:trust-ladder" }),
      })
    );
    expect(mockGateway.request).toHaveBeenCalled();
  });

  it("resumes approved approval requests and dispatches blocked task run", async () => {
    mockDb.approvalRequest.findMany.mockResolvedValue([
      {
        id: "approval-1",
        taskRunId: "run-1",
      },
    ]);

    mockDb.taskRun.findUnique.mockResolvedValue({
      id: "run-1",
      idempotencyKey: "dispatch:sched-1:2026-01-01T05:00:00.000Z",
      gatewayRunId: null,
      task: {
        id: "task-1",
        scheduleId: "sched-1",
        agentId: "agent-1",
        templateId: "tmpl-1",
        assembledInstructionsSnapshot: "Draft email content",
      },
    });

    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      routingKey: "agent:exec-assistant:main",
    });

    mockGateway.request.mockResolvedValue({ runId: "gw-run-1" });
    mockDb.taskRun.update.mockResolvedValue({});
    mockDb.taskEvent.create.mockResolvedValue({});
    mockDb.approvalRequest.update.mockResolvedValue({});

    const service = new DispatchService(mockGateway as any);
    await service.resumeApprovedRequests();

    expect(mockGateway.request).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({ sessionKey: "agent:exec-assistant:main" }),
      "dispatch:sched-1:2026-01-01T05:00:00.000Z"
    );
    expect(mockDb.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "approval-1" },
        data: expect.objectContaining({ outcome: expect.stringContaining("dispatched") }),
      })
    );
  });

  it("marks task as BLOCKED semantics when approval is denied", async () => {
    mockDb.approvalRequest.findMany.mockResolvedValue([
      {
        id: "approval-denied-1",
        taskRunId: "run-denied-1",
        decision: "DENIED",
        reason: "Denied by reviewer",
      },
    ]);

    mockDb.taskRun.findUnique.mockResolvedValue({
      id: "run-denied-1",
      gatewayRunId: null,
      task: {
        id: "task-denied-1",
        scheduleId: "sched-denied-1",
        agentId: "agent-1",
        templateId: "tmpl-1",
        assembledInstructionsSnapshot: "Send email",
      },
    });

    const service = new DispatchService(mockGateway as any);
    await service.resumeApprovedRequests();

    expect(mockGateway.request).not.toHaveBeenCalled();
    expect(mockDb.taskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-denied-1" },
        data: expect.objectContaining({ status: "FAILED", errorText: expect.stringContaining("BLOCKED") }),
      })
    );
    expect(mockDb.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-denied-1" },
        data: expect.objectContaining({ status: "FAILED" }),
      })
    );
    expect(mockDb.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "approval-denied-1" },
        data: expect.objectContaining({ outcome: expect.stringContaining("blocked") }),
      })
    );
  });

  it("redispatches automatically when approval is revised", async () => {
    mockDb.approvalRequest.findMany.mockResolvedValue([
      {
        id: "approval-revised-1",
        taskRunId: "run-revised-1",
        decision: "REVISED",
        context: { revision: "Use concise wording and remove external recipients." },
      },
    ]);

    mockDb.taskRun.findUnique.mockResolvedValue({
      id: "run-revised-1",
      idempotencyKey: "dispatch:sched-rev:2026-01-01T09:00:00.000Z",
      gatewayRunId: null,
      task: {
        id: "task-revised-1",
        scheduleId: "sched-rev-1",
        agentId: "agent-1",
        templateId: "tmpl-1",
        assembledInstructionsSnapshot: "Draft and send a client update",
      },
    });

    mockDb.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      routingKey: "agent:exec-assistant:main",
    });
    mockGateway.request.mockResolvedValue({ runId: "gw-run-revised-1" });

    const service = new DispatchService(mockGateway as any);
    await service.resumeApprovedRequests();

    expect(mockDb.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-revised-1" },
        data: expect.objectContaining({
          instructionsOverride: "Use concise wording and remove external recipients.",
          assembledInstructionsSnapshot: expect.stringContaining("=== REVISION ==="),
        }),
      })
    );
    expect(mockGateway.request).toHaveBeenCalled();
    expect(mockDb.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "approval-revised-1" },
        data: expect.objectContaining({ outcome: expect.stringContaining("redispatched") }),
      })
    );
  });
});
