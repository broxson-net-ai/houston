import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

afterAll(async () => {
  await db.$disconnect();
});

afterEach(async () => {
  // Clean up test data (in dependency order)
  await db.taskEvent.deleteMany({ where: { task: { title: { startsWith: "test-" } } } });
  await db.taskLog.deleteMany({});
  await db.taskRun.deleteMany({ where: { task: { title: { startsWith: "test-" } } } });
  await db.task.deleteMany({ where: { title: { startsWith: "test-" } } });
  await db.schedule.deleteMany({ where: { template: { name: { startsWith: "test-" } } } });
  await db.template.deleteMany({ where: { name: { startsWith: "test-" } } });
  await db.agent.deleteMany({ where: { routingKey: { startsWith: "test-" } } });
});

describe("Agent CRUD", () => {
  it("creates and reads back an Agent row", async () => {
    const agent = await db.agent.create({
      data: {
        name: "Test Agent",
        routingKey: "test-agent-db-test",
        tags: ["test"],
        enabled: true,
      },
    });

    expect(agent.id).toBeTruthy();
    expect(agent.name).toBe("Test Agent");
    expect(agent.routingKey).toBe("test-agent-db-test");

    const found = await db.agent.findUnique({ where: { id: agent.id } });
    expect(found).not.toBeNull();
    expect(found!.routingKey).toBe("test-agent-db-test");
  });
});

describe("Schedule CRUD", () => {
  it("creates and reads back a Schedule row with correct nextRunAt", async () => {
    const template = await db.template.create({
      data: {
        name: "test-schedule-template",
        instructions: "Test instructions",
        tags: [],
      },
    });

    const nextRunAt = new Date("2026-01-01T05:00:00Z");
    const schedule = await db.schedule.create({
      data: {
        templateId: template.id,
        cron: "0 5 * * *",
        timezone: "America/Los_Angeles",
        nextRunAt,
        enabled: true,
      },
    });

    expect(schedule.id).toBeTruthy();
    expect(schedule.cron).toBe("0 5 * * *");
    expect(schedule.nextRunAt?.toISOString()).toBe(nextRunAt.toISOString());

    const found = await db.schedule.findUnique({ where: { id: schedule.id } });
    expect(found).not.toBeNull();
    expect(found!.timezone).toBe("America/Los_Angeles");
    expect(found!.nextRunAt?.getTime()).toBe(nextRunAt.getTime());
  });
});
