import { NextRequest, NextResponse } from "next/server";
import { db, TaskStatus, TaskEventType } from "@houston/shared";
import { requireAuth } from "@/lib/session";

interface BulkTaskSpec {
  title: string;
  agentId?: string | null;
  templateId?: string | null;
  dueAt?: string | null;
  instructionsOverride?: string | null;
  projectId?: string | null;
  autoDispatch?: boolean;
  dependencyTaskIds?: string[];
}

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

async function createTaskWithDependencies(
  spec: BulkTaskSpec,
  taskCache: Map<string, { id: string; status: TaskStatus }>
): Promise<{ id: string; status: TaskStatus } | null> {
  const { title, agentId, templateId, dueAt, instructionsOverride, projectId, autoDispatch, dependencyTaskIds = [] } = spec;

  if (!title || typeof title !== "string") {
    return null; // Skip invalid specs
  }

  // Resolve dependencies from cache
  const resolvedDependencies = dependencyTaskIds
    .map((depCode) => {
      // Try to find dependency by exact title match in cache
      for (const [title, task] of taskCache) {
        if (title.includes(depCode) || depCode.includes(title)) {
          return task.id;
        }
      }
      return null;
    })
    .filter((id): id is string => id !== null);

  // Resolve agent
  const resolvedAgentId = agentId ?? (await selectAutoAgentId({
    projectId: projectId ?? null,
    title,
    instructionsOverride: instructionsOverride ?? null,
  }));

  const task = await db.$transaction(async (tx) => {
    let nextStatus: TaskStatus = TaskStatus.QUEUE;
    if (resolvedDependencies.length > 0) {
      const unresolvedDependencies = await tx.task.count({
        where: {
          id: { in: resolvedDependencies },
          status: { not: TaskStatus.DONE },
        },
      });
      if (unresolvedDependencies > 0) nextStatus = TaskStatus.BLOCKED;
    }

    const created = await tx.task.create({
      data: {
        title,
        agentId: resolvedAgentId ?? null,
        templateId: templateId ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
        instructionsOverride: instructionsOverride ?? null,
        projectId: projectId ?? null,
        status: nextStatus,
        autoDispatch: autoDispatch === true,
      },
      include: { agent: true, template: true, project: true },
    });

    if (resolvedDependencies.length > 0) {
      await tx.taskDependency.createMany({
        data: resolvedDependencies.map((dependsOnTaskId: string) => ({
          taskId: created.id,
          dependsOnTaskId,
        })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  // Add to cache for subsequent tasks
  taskCache.set(task.title, { id: task.id, status: task.status as TaskStatus });

  // Create CREATED event
  await db.taskEvent.create({
    data: {
      taskId: task.id,
      type: TaskEventType.CREATED,
      message: "Created via bulk task API",
      metadata: {
        source: "bulk-api",
        ...(resolvedAgentId ? { resolvedAgentId } : {}),
        ...(autoDispatch === true ? { autoDispatch: true } : {}),
        ...(resolvedDependencies.length > 0 ? { dependencyTaskIds: resolvedDependencies } : {}),
        ...(task.status === TaskStatus.BLOCKED ? { semanticStatus: "BLOCKED" } : {}),
      },
    },
  });

  return { id: task.id, status: task.status as TaskStatus };
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const tasks: BulkTaskSpec[] = Array.isArray(body.tasks) ? body.tasks : [];

  if (tasks.length === 0) {
    return NextResponse.json({ error: "tasks array is required and must not be empty" }, { status: 400 });
  }

  const taskCache = new Map<string, { id: string; status: TaskStatus }>();

  // Pre-populate cache with existing tasks (by title)
  const existingTasks = await db.task.findMany({
    select: { id: true, title: true, status: true },
    where: {
      title: { in: tasks.map((t) => t.title).filter(Boolean) },
    },
  });

  for (const task of existingTasks) {
    taskCache.set(task.title, { id: task.id, status: task.status as TaskStatus });
  }

  const results: {
    created: { id: string; title: string; status: TaskStatus }[];
    skipped: { title: string; reason: string }[];
    failed: { title: string; error: string }[];
  } = {
    created: [],
    skipped: [],
    failed: [],
  };

  for (const spec of tasks) {
    const existing = taskCache.get(spec.title);

    if (existing) {
      results.skipped.push({ title: spec.title, reason: "Task already exists" });
      continue;
    }

    try {
      const result = await createTaskWithDependencies(spec, taskCache);
      if (result) {
        results.created.push({
          id: result.id,
          title: spec.title,
          status: result.status,
        });
      } else {
        results.failed.push({ title: spec.title, error: "Invalid task spec" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      results.failed.push({ title: spec.title, error: errorMessage });
    }
  }

  return NextResponse.json({
    summary: {
      total: tasks.length,
      created: results.created.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
    },
    created: results.created,
    skipped: results.skipped,
    failed: results.failed,
  }, { status: 201 });
}
