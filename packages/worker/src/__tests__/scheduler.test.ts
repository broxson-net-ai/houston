import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted ensures these are available before vi.mock factory runs
const mockDb = vi.hoisted(() => ({
  schedule: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  taskRun: {
    findFirst: vi.fn(),
  },
  taskEvent: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  systemStatus: {
    upsert: vi.fn(),
  },
}));

vi.mock("@houston/shared", () => ({
  db: mockDb,
}));

import { getExpectedRunsInWindow, computeNextRunAt } from "../scheduler.js";

// Mock pg-boss
const mockBoss = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  work: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue("job-id"),
}));

vi.mock("pg-boss", () => ({
  default: vi.fn(() => mockBoss),
}));

const mockDispatchService = {
  dispatch: vi.fn().mockResolvedValue(undefined),
};

import { HoustonScheduler } from "../scheduler.js";

describe("getExpectedRunsInWindow", () => {
  it("returns expected run times within window", () => {
    // Daily at 5am: expect runs at 5am each day
    const now = new Date("2026-01-03T12:00:00Z");
    const windowStart = new Date("2026-01-01T00:00:00Z");
    const runs = getExpectedRunsInWindow("0 13 * * *", "UTC", windowStart, now);
    // Should get Jan 1 13:00 UTC and Jan 2 13:00 UTC and Jan 3 13:00 UTC
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for window with no runs", () => {
    const now = new Date("2026-01-01T04:00:00Z");
    const windowStart = new Date("2026-01-01T03:00:00Z");
    // Run at 5am, so nothing in 3am-4am window
    const runs = getExpectedRunsInWindow("0 5 * * *", "UTC", windowStart, now);
    expect(runs.length).toBe(0);
  });

  it("returns empty for invalid cron", () => {
    const runs = getExpectedRunsInWindow("invalid cron", "UTC", new Date(), new Date());
    expect(runs).toEqual([]);
  });
});

describe("computeNextRunAt", () => {
  it("computes next run after current time", () => {
    const now = new Date("2026-01-01T04:00:00Z");
    const next = computeNextRunAt("0 5 * * *", "UTC", now);
    expect(next.toISOString()).toBe("2026-01-01T05:00:00.000Z");
  });

  it("computes next run after specified date", () => {
    const after = new Date("2026-01-01T05:00:00Z");
    const next = computeNextRunAt("0 5 * * *", "UTC", after);
    expect(next.toISOString()).toBe("2026-01-02T05:00:00.000Z");
  });
});

describe("HoustonScheduler.detectMissedRuns", () => {
  let scheduler: HoustonScheduler;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DATABASE_URL = "postgres://test";
    process.env.HOUSTON_GRACE_WINDOW_SECONDS = "300";
    process.env.HOUSTON_LOOKBACK_WINDOW_HOURS = "48";
    mockDb.systemStatus.upsert.mockResolvedValue({});
    scheduler = new HoustonScheduler(mockDispatchService as any);
  });

  it("creates MISSED events for runs with no TaskRun and past grace window", async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // A cron that ran 2 hours ago
    const schedule = {
      id: "sched-1",
      cron: "0 * * * *", // every hour
      timezone: "UTC",
      enabled: true,
      nextRunAt: new Date(now.getTime() + 60 * 60 * 1000),
      lastRunAt: null,
    };

    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.taskEvent.findFirst.mockResolvedValue(null);
    mockDb.taskEvent.create.mockResolvedValue({ id: "event-1" });
    mockDb.schedule.update.mockResolvedValue({});

    await scheduler.detectMissedRuns(schedule);

    // Should have created at least 1 MISSED event
    const missedCalls = (mockDb.taskEvent.create as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0]?.data?.type === "MISSED"
    );
    expect(missedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT create MISSED events when TaskRun exists", async () => {
    const now = new Date();

    const schedule = {
      id: "sched-2",
      cron: "0 * * * *",
      timezone: "UTC",
      enabled: true,
      nextRunAt: new Date(now.getTime() + 60 * 60 * 1000),
      lastRunAt: null,
    };

    // TaskRun exists for each expected time
    mockDb.taskRun.findFirst.mockResolvedValue({ id: "run-1" });
    mockDb.taskEvent.findFirst.mockResolvedValue(null);

    await scheduler.detectMissedRuns(schedule);

    const missedCalls = (mockDb.taskEvent.create as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0]?.data?.type === "MISSED"
    );
    expect(missedCalls.length).toBe(0);
  });

  it("does NOT create MISSED events within grace window", async () => {
    // Use a very short lookback (10 minutes) so only the run from 1 minute ago is in window
    // Grace window is 300s (5 min), so a run from 1 minute ago is within grace
    process.env.HOUSTON_LOOKBACK_WINDOW_HOURS = "0.167"; // ~10 minutes
    process.env.HOUSTON_GRACE_WINDOW_SECONDS = "300"; // 5 minutes

    const now = new Date();
    // A run that was expected just 1 minute ago (within 5-minute grace window)
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    const schedule = {
      id: "sched-3",
      cron: "* * * * *", // every minute
      timezone: "UTC",
      enabled: true,
      nextRunAt: new Date(now.getTime() + 60 * 1000),
      lastRunAt: null,
    };

    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.taskEvent.findFirst.mockResolvedValue(null);

    await scheduler.detectMissedRuns(schedule);

    // All runs in the 10-min lookback window are within the 5-minute grace window
    // (runs from the last 5 mins) OR are being counted. The run from ~1 min ago
    // is within grace, but runs from 5-10 min ago are outside grace.
    // So there could be missed events for the older runs.
    // The test should verify that runs from 1 min ago are NOT missed (within grace).
    // Let's verify by checking that any MISSED events are for times > 5 min ago.
    const missedCalls = (mockDb.taskEvent.create as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0]?.data?.type === "MISSED"
    );
    // Verify no MISSED event for the run from 1 minute ago
    const missedForRecentRun = missedCalls.filter((call) => {
      const meta = call[0]?.data?.metadata;
      if (!meta?.expectedAt) return false;
      const expectedAt = new Date(meta.expectedAt);
      return now.getTime() - expectedAt.getTime() < 300_000; // within 5 min grace
    });
    expect(missedForRecentRun.length).toBe(0);

    // Reset to defaults
    process.env.HOUSTON_LOOKBACK_WINDOW_HOURS = "48";
    process.env.HOUSTON_GRACE_WINDOW_SECONDS = "300";
  });

  it("does NOT create MISSED events for already-recorded missed events", async () => {
    const schedule = {
      id: "sched-4",
      cron: "0 * * * *",
      timezone: "UTC",
      enabled: true,
      nextRunAt: new Date(),
      lastRunAt: null,
    };

    mockDb.taskRun.findFirst.mockResolvedValue(null);
    // Existing missed event already exists
    mockDb.taskEvent.findFirst.mockResolvedValue({ id: "existing-missed" });

    await scheduler.detectMissedRuns(schedule);

    const missedCalls = (mockDb.taskEvent.create as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0]?.data?.type === "MISSED"
    );
    expect(missedCalls.length).toBe(0);
  });
});

describe("HoustonScheduler.tick", () => {
  let scheduler: HoustonScheduler;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.DATABASE_URL = "postgres://test";
    process.env.HOUSTON_GRACE_WINDOW_SECONDS = "300";
    process.env.HOUSTON_LOOKBACK_WINDOW_HOURS = "48";
    mockDb.systemStatus.upsert.mockResolvedValue({});
    mockDb.taskRun.findFirst.mockResolvedValue(null);
    mockDb.taskEvent.findFirst.mockResolvedValue(null);
    mockDb.taskEvent.create.mockResolvedValue({ id: "event-1" });
    mockDb.schedule.update.mockResolvedValue({});
    scheduler = new HoustonScheduler(mockDispatchService as any);
    // Initialize boss manually for unit tests
    (scheduler as any).boss = mockBoss;
  });

  it("enqueues dispatch job for a due schedule", async () => {
    const dueAt = new Date(Date.now() - 1000); // 1 second ago (overdue)
    mockDb.schedule.findMany.mockResolvedValue([
      {
        id: "sched-due",
        cron: "0 * * * *",
        timezone: "UTC",
        enabled: true,
        nextRunAt: dueAt,
        lastRunAt: null,
      },
    ]);

    await scheduler.tick();

    expect(mockBoss.send).toHaveBeenCalledWith("dispatch", expect.objectContaining({ scheduleId: "sched-due" }));
  });

  it("does NOT enqueue for a schedule not yet due", async () => {
    mockDb.schedule.findMany.mockResolvedValue([
      {
        id: "sched-future",
        cron: "0 * * * *",
        timezone: "UTC",
        enabled: true,
        nextRunAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        lastRunAt: null,
      },
    ]);

    await scheduler.tick();

    expect(mockBoss.send).not.toHaveBeenCalled();
  });
});
