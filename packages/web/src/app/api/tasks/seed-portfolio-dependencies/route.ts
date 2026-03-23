import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

const deps: Record<string, string[]> = {
  "NOW A-02 Trust-ladder verification for external-send actions": ["NOW A-01 Guardrails sandbox verification matrix"],
  "NOW A-03 Trust-ladder verification for schedule mutation candidates": ["NOW A-01 Guardrails sandbox verification matrix"],
  "NOW A-04 Dashboard approval anomaly panel and filters": [
    "NOW A-02 Trust-ladder verification for external-send actions",
    "NOW A-03 Trust-ladder verification for schedule mutation candidates",
  ],
  "NOW A-05 Dashboard operator runbook completion for approvals incidents": ["NOW A-04 Dashboard approval anomaly panel and filters"],
  "NOW A-06 ClawOps schedule mutation policy matrix v0": [
    "NOW A-02 Trust-ladder verification for external-send actions",
    "NOW A-03 Trust-ladder verification for schedule mutation candidates",
    "NOW A-05 Dashboard operator runbook completion for approvals incidents",
  ],
  "NOW A-07 Self-evolve gate lock enforcement and validation": [
    "NOW A-01 Guardrails sandbox verification matrix",
    "NOW A-05 Dashboard operator runbook completion for approvals incidents",
  ],
  "NOW A-09 Retrieval threshold sensitivity and operating config recommendation": ["NOW A-08 Retrieval reranker A/B run and scoring report"],
  "NOW B-04 Network cleanup Checkpoint C authoritative DNS normalization execution": ["NOW B-03 Network cleanup Checkpoint C pre-change export bundle"],
  "NOW D-01 LIYTH workflow state model and schema definition": ["NOW A-06 ClawOps schedule mutation policy matrix v0"],
  "NOW D-02 LIYTH asset ID and manifest MVP internal only": ["NOW D-01 LIYTH workflow state model and schema definition"],
  "NOW D-03 Andante non-clinical launch checklist task graph": ["NOW A-06 ClawOps schedule mutation policy matrix v0"],
  "NOW D-04 Andante boundary controls and data-class validation": ["NOW D-03 Andante non-clinical launch checklist task graph"],
  "NOW D-05 Creator ops recurring Interview Kickstart workflow templates": ["NOW A-06 ClawOps schedule mutation policy matrix v0"],
  "NOW D-06 Creator ops Udemy pipeline draft board": ["NOW D-05 Creator ops recurring Interview Kickstart workflow templates"],
  "NOW D-07 Business KPI weekly snapshot spec": [
    "NOW D-01 LIYTH workflow state model and schema definition",
    "NOW D-03 Andante non-clinical launch checklist task graph",
    "NOW D-05 Creator ops recurring Interview Kickstart workflow templates",
  ],
  "NEXT AA-02 Approval audit ingestion mapping from approval_requests and task_events": ["NEXT AA-01 Approval audit schema and decision-path taxonomy"],
  "NEXT AA-03 Approval audit log rotation and archive policy": ["NEXT AA-01 Approval audit schema and decision-path taxonomy"],
};

type SeedResult = {
  foundTasks: number;
  autoDispatchTouched: number;
  dependencyEdges: number;
  missingTitles: string[];
};

async function runSeed(dryRun: boolean): Promise<SeedResult> {
  const allTitles = [...new Set(Object.keys(deps).concat(Object.values(deps).flat()))];
  const tasks = await db.task.findMany({
    where: { title: { in: allTitles } },
    select: { id: true, title: true, status: true },
  });

  const byTitle = new Map(tasks.map((task) => [task.title, task]));
  const missingTitles = allTitles.filter((title) => !byTitle.has(title));

  let autoDispatchTouched = 0;
  const edges: Array<{ taskId: string; dependsOnTaskId: string }> = [];
  for (const [title, requires] of Object.entries(deps)) {
    const task = byTitle.get(title);
    if (!task) continue;
    autoDispatchTouched += 1;
    for (const reqTitle of requires) {
      const dep = byTitle.get(reqTitle);
      if (dep) {
        edges.push({ taskId: task.id, dependsOnTaskId: dep.id });
      }
    }
  }

  if (!dryRun) {
    const touchedTaskIds = [...new Set(tasks.map((task) => task.id))];
    await db.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { id: { in: touchedTaskIds } },
        data: { autoDispatch: true },
      });
      for (const edge of edges) {
        await tx.taskDependency.upsert({
          where: {
            taskId_dependsOnTaskId: {
              taskId: edge.taskId,
              dependsOnTaskId: edge.dependsOnTaskId,
            },
          },
          create: edge,
          update: {},
        });
      }
    });
  }

  return {
    foundTasks: tasks.length,
    autoDispatchTouched,
    dependencyEdges: edges.length,
    missingTitles,
  };
}

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") !== "false";

  const result = await runSeed(dryRun);
  return NextResponse.json({
    dryRun,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun);

  const result = await runSeed(dryRun);
  return NextResponse.json({
    dryRun,
    ...result,
  });
}
