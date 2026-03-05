import { NextRequest, NextResponse } from "next/server";
import { db, TaskStatus } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "status";
  const agentId = searchParams.get("agentId");
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status") as TaskStatus | null;
  const q = searchParams.get("q");
  const archived = searchParams.get("archived") === "true";

  const where: Record<string, unknown> = {
    archivedAt: archived ? { not: null } : null,
    ...(agentId && { agentId }),
    ...(projectId && { projectId }),
    ...(status && { status }),
    ...(q && {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { template: { name: { contains: q, mode: "insensitive" } } },
        { agent: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
  };

  const tasks = await db.task.findMany({
    where,
    include: {
      agent: true,
      project: true,
      template: {
        include: {
          schedules: {
            where: { enabled: true },
            take: 1,
          },
        },
      },
      schedule: true,
      taskRuns: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (view === "status") {
    // Group tasks by status
    const grouped: Record<string, typeof tasks> = {
      QUEUE: [],
      IN_PROGRESS: [],
      DONE: [],
      FAILED: [],
    };
    for (const task of tasks) {
      grouped[task.status]?.push(task);
    }

    // Add scheduled (derived from enabled schedules with nextRunAt in the future, no pending task)
    if (!agentId && !status && !q) {
      const scheduledItems = await db.schedule.findMany({
        where: { enabled: true, nextRunAt: { not: null } },
        include: { template: { include: { defaultAgent: true } } },
        orderBy: { nextRunAt: "asc" },
      });
      return NextResponse.json({ view: "status", grouped, scheduled: scheduledItems });
    }

    return NextResponse.json({ view: "status", grouped, scheduled: [] });
  }

  if (view === "agent") {
    // Group tasks by agentId
    const grouped: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const key = task.agentId ?? "unassigned";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(task);
    }
    return NextResponse.json({ view: "agent", grouped });
  }

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { title, agentId, templateId, dueAt, instructionsOverride, projectId } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const task = await db.task.create({
    data: {
      title,
      agentId: agentId ?? null,
      templateId: templateId ?? null,
      dueAt: dueAt ? new Date(dueAt) : null,
      instructionsOverride: instructionsOverride ?? null,
      projectId: projectId ?? null,
      status: TaskStatus.QUEUE,
    },
    include: { agent: true, template: true, project: true },
  });

  // Create CREATED event
  await db.taskEvent.create({
    data: {
      taskId: task.id,
      type: "CREATED",
      message: projectId ? "Task created with project" : "Ad hoc task created",
    },
  });

  return NextResponse.json(task, { status: 201 });
}
