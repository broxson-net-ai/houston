import { describe, it, expect, vi, beforeEach } from "vitest";

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
  },
  taskEvent: {
    create: vi.fn(),
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
});
