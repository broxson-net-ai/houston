import { NextRequest, NextResponse } from "next/server";
import { db, TaskStatus } from "@houston/shared";
import { requireAuth } from "@/lib/session";

function laneFromText(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(/\bLane:\s*([A-E])\b/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function normalize(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

async function selectAutoAgentId(args: {
  projectId?: string | null;
  title: string;
  instructionsOverride?: string | null;
}) {
  const [agents, project] = await Promise.all([
    db.agent.findMany({ where: { enabled: true }, select: { id: true, name: true, routingKey: true } }),
    args.projectId
      ? db.project.findUnique({ where: { id: args.projectId }, select: { slug: true } })
      : Promise.resolve(null),
  ]);

  const byName = new Map<string, string>();
  for (const agent of agents) {
    byName.set(normalize(agent.name), agent.id);
    byName.set(normalize(agent.routingKey), agent.id);
  }

  const lane = laneFromText(args.instructionsOverride);
  const slug = normalize(project?.slug);
  const title = normalize(args.title);

  const opsSlugs = new Set([
    "network-cleanup",
    "x-monitor",
    "backups-dr",
    "dynamic-dns",
    "external-network",
    "openclaw-docker-node",
  ]);

  const bizSlugs = new Set([
    "liyth-ops-automation",
    "andante-ops-automation",
    "creator-education-ops",
    "approval-audit-log",
  ]);

  if (lane === "B" || opsSlugs.has(slug) || title.includes("network") || title.includes("backup") || title.includes("monitor")) {
    return byName.get("ops-agent") ?? byName.get("agent:ops-agent:main") ?? null;
  }

  if (lane === "D" || bizSlugs.has(slug) || title.includes("liyth") || title.includes("andante") || title.includes("udemy") || title.includes("marketing")) {
    return byName.get("biz-ops-agent") ?? byName.get("agent:biz-ops-agent:main") ?? null;
  }

  if (title.includes("email") || title.includes("calendar") || title.includes("inbox")) {
    return byName.get("exec-assistant") ?? byName.get("agent:exec-assistant:main") ?? null;
  }

  return byName.get("main") ?? byName.get("agent:main:main") ?? null;
}

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

  const resolvedAgentId = agentId ?? (await selectAutoAgentId({
    projectId: projectId ?? null,
    title,
    instructionsOverride: instructionsOverride ?? null,
  }));

  const task = await db.task.create({
    data: {
      title,
      agentId: resolvedAgentId ?? null,
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
        message: resolvedAgentId
          ? (projectId ? "Task created with project (auto-assigned agent)" : "Ad hoc task created (auto-assigned agent)")
          : (projectId ? "Task created with project" : "Ad hoc task created"),
        metadata: resolvedAgentId ? { resolvedAgentId } : undefined,
      },
    });

  return NextResponse.json(task, { status: 201 });
}
