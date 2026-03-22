import "server-only";

import { db } from "@houston/shared";

export type PortfolioTaskBucketProgress = {
  prefix: "V2NOW" | "V2NEXT" | "V2LATER";
  total: number;
  queue: number;
  inProgress: number;
  done: number;
  failed: number;
};

export type PortfolioLaneProgress = {
  lane: string;
  total: number;
  queue: number;
  inProgress: number;
  done: number;
  failed: number;
};

export type PortfolioGateProgress = {
  gateTitle: string;
  lane: string | null;
  total: number;
  done: number;
};

export type PortfolioExecutionProgress = {
  buckets: PortfolioTaskBucketProgress[];
  lanes: PortfolioLaneProgress[];
  gates: PortfolioGateProgress[];
};

type TaskRow = {
  title: string;
  status: "QUEUE" | "IN_PROGRESS" | "DONE" | "FAILED";
};

function emptyBucket(prefix: "V2NOW" | "V2NEXT" | "V2LATER"): PortfolioTaskBucketProgress {
  return { prefix, total: 0, queue: 0, inProgress: 0, done: 0, failed: 0 };
}

function applyStatus(target: { total: number; queue: number; inProgress: number; done: number; failed: number }, status: TaskRow["status"]) {
  target.total += 1;
  if (status === "QUEUE") target.queue += 1;
  if (status === "IN_PROGRESS") target.inProgress += 1;
  if (status === "DONE") target.done += 1;
  if (status === "FAILED") target.failed += 1;
}

export async function getPortfolioExecutionProgress(gateTitles: string[]): Promise<PortfolioExecutionProgress> {
  const rows = await db.task.findMany({
    where: {
      archivedAt: null,
      OR: [
        { title: { startsWith: "V2NOW " } },
        { title: { startsWith: "V2NEXT " } },
        { title: { startsWith: "V2LATER " } },
      ],
    },
    select: { title: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  const buckets = {
    V2NOW: emptyBucket("V2NOW"),
    V2NEXT: emptyBucket("V2NEXT"),
    V2LATER: emptyBucket("V2LATER"),
  };

  const lanes: Record<string, PortfolioLaneProgress> = {
    A: { lane: "A", total: 0, queue: 0, inProgress: 0, done: 0, failed: 0 },
    B: { lane: "B", total: 0, queue: 0, inProgress: 0, done: 0, failed: 0 },
    C: { lane: "C", total: 0, queue: 0, inProgress: 0, done: 0, failed: 0 },
    D: { lane: "D", total: 0, queue: 0, inProgress: 0, done: 0, failed: 0 },
    E: { lane: "E", total: 0, queue: 0, inProgress: 0, done: 0, failed: 0 },
  };

  for (const row of rows as TaskRow[]) {
    const prefix = row.title.startsWith("V2NOW ")
      ? "V2NOW"
      : row.title.startsWith("V2NEXT ")
        ? "V2NEXT"
        : row.title.startsWith("V2LATER ")
          ? "V2LATER"
          : null;
    if (!prefix) continue;

    applyStatus(buckets[prefix], row.status);

    const laneMatch = row.title.match(/\b([A-E])-\d+\b/i);
    const lane = laneMatch?.[1]?.toUpperCase();
    if (lane && lanes[lane]) {
      applyStatus(lanes[lane], row.status);
    }
  }

  const gateProgress: PortfolioGateProgress[] = gateTitles.map((gateTitle) => {
    const lane = gateTitle.match(/Gate\s+([A-E])/i)?.[1]?.toUpperCase() ?? null;
    if (!lane || !lanes[lane]) {
      return { gateTitle, lane: null, total: 0, done: 0 };
    }
    return {
      gateTitle,
      lane,
      total: lanes[lane].total,
      done: lanes[lane].done,
    };
  });

  return {
    buckets: [buckets.V2NOW, buckets.V2NEXT, buckets.V2LATER],
    lanes: Object.values(lanes),
    gates: gateProgress,
  };
}
