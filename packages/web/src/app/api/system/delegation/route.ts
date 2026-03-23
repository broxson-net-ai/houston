import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const windowHours = Math.max(1, Math.min(168, Number(searchParams.get("windowHours") || "24")));
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const runs = await db.taskRun.findMany({
    where: { createdAt: { gte: since } },
    include: {
      task: {
        include: {
          agent: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const byAgent: Record<string, { runs: number; completed: number; failed: number }> = {};
  let queueToStartSamples = 0;
  let queueToStartTotalMs = 0;
  for (const run of runs) {
    const name = run.task?.agent?.name ?? "unassigned";
    if (!byAgent[name]) byAgent[name] = { runs: 0, completed: 0, failed: 0 };
    byAgent[name].runs += 1;
    if (run.status === "COMPLETED") byAgent[name].completed += 1;
    if (run.status === "FAILED") byAgent[name].failed += 1;

    if (run.dispatchedAt && run.startedAt) {
      queueToStartSamples += 1;
      queueToStartTotalMs += Math.max(0, run.startedAt.getTime() - run.dispatchedAt.getTime());
    }
  }

  const totalRuns = runs.length;
  const mainRuns = byAgent.main?.runs ?? 0;
  const specialistRuns = Math.max(0, totalRuns - mainRuns);
  const specialistShare = totalRuns > 0 ? specialistRuns / totalRuns : 0;

  const queue = await db.task.count({ where: { status: "QUEUE", archivedAt: null } });
  const inProgress = await db.task.count({ where: { status: "IN_PROGRESS", archivedAt: null } });
  const staleAccepted = await db.taskRun.count({
    where: {
      status: "ACCEPTED",
      startedAt: null,
      createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
    },
  });

  return NextResponse.json({
    windowHours,
    totalRuns,
    mainRuns,
    specialistRuns,
    specialistShare,
    queue,
    inProgress,
    staleAccepted,
    avgQueueToStartMs: queueToStartSamples > 0 ? Math.round(queueToStartTotalMs / queueToStartSamples) : 0,
    byAgent,
  });
}
