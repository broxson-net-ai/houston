import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

const mockDb = vi.hoisted(() => ({
  taskRun: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  task: {
    update: vi.fn(),
  },
  taskEvent: {
    create: vi.fn(),
  },
  taskLog: {
    findFirst: vi.fn(),
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

import { GatewayEventHandler } from "../events.js";

class MockGatewayClient extends EventEmitter {
  isConnected() { return true; }
}

const TASK_RUN = {
  id: "run-1",
  taskId: "task-1",
  status: "RUNNING",
  responsePayload: null,
};

describe("GatewayEventHandler", () => {
  let handler: GatewayEventHandler;
  let mockClient: MockGatewayClient;

  beforeEach(() => {
    vi.resetAllMocks();
    mockClient = new MockGatewayClient();
    handler = new GatewayEventHandler(mockClient as any);
    handler.start();

    mockDb.taskRun.findFirst.mockResolvedValue(TASK_RUN);
    mockDb.taskRun.update.mockResolvedValue({});
    mockDb.task.update.mockResolvedValue({});
    mockDb.taskEvent.create.mockResolvedValue({});
    mockDb.taskLog.findFirst.mockResolvedValue(null);
    mockDb.taskLog.create.mockResolvedValue({ id: "log-1", logText: "" });
    mockDb.taskLog.update.mockResolvedValue({});
    process.env.MAX_LOG_BYTES = "10485760";
  });

  it("run_completed → TaskRun.status = COMPLETED, Task.status = DONE", async () => {
    mockClient.emit("event", { type: "run_completed", run_id: "gw-123" });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDb.taskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) })
    );
    expect(mockDb.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DONE" }) })
    );
  });

  it("run_failed → TaskRun.status = FAILED, Task.status = FAILED", async () => {
    mockClient.emit("event", { type: "run_failed", run_id: "gw-123", error: "Something went wrong" });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDb.taskRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
    expect(mockDb.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("log_chunk events → accumulated in TaskLog", async () => {
    mockDb.taskLog.findFirst.mockResolvedValue(null);
    mockDb.taskLog.create.mockResolvedValue({ id: "log-1", logText: "" });
    mockDb.taskLog.update.mockResolvedValue({ id: "log-1", logText: "Hello " });

    mockClient.emit("event", { type: "log_chunk", run_id: "gw-123", chunk: "Hello " });
    await new Promise((r) => setTimeout(r, 50));

    mockDb.taskLog.findFirst.mockResolvedValue({ id: "log-1", logText: "Hello " });
    mockClient.emit("event", { type: "log_chunk", run_id: "gw-123", chunk: "World" });
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDb.taskLog.update).toHaveBeenCalled();
  });

  it("log truncation: chunks exceeding cap → truncated = true, no further appending", async () => {
    process.env.MAX_LOG_BYTES = "10"; // 10 byte limit

    // First chunk fills the log
    mockDb.taskLog.create.mockResolvedValue({ id: "log-1", logText: "" });
    mockDb.taskLog.findFirst.mockResolvedValue(null);
    mockClient.emit("event", { type: "log_chunk", run_id: "gw-123", chunk: "1234567890" }); // exactly 10 bytes
    await new Promise((r) => setTimeout(r, 50));

    // Check truncated was set
    const updateCall = (mockDb.taskLog.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[0].data.truncated).toBe(true);

    // Reset and try to add more
    vi.clearAllMocks();
    // Size is already at 10 (cap), findFirst returns log with current size tracked
    mockDb.taskLog.findFirst.mockResolvedValue({ id: "log-1", logText: "1234567890" });

    mockClient.emit("event", { type: "log_chunk", run_id: "gw-123", chunk: "more data" });
    await new Promise((r) => setTimeout(r, 50));

    // Should not update when at cap
    expect(mockDb.taskLog.update).not.toHaveBeenCalled();

    process.env.MAX_LOG_BYTES = "10485760";
  });
});
