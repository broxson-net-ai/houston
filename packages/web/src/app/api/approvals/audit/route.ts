import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const decision = searchParams.get("decision") || "ALL";
  const decisionPath = searchParams.get("decisionPath") || "ALL";
  const trigger = searchParams.get("trigger") || "ALL";
  const take = Math.min(500, Math.max(10, Number(searchParams.get("take") || "100")));
  const format = (searchParams.get("format") || "json").toLowerCase();

  const where: Record<string, unknown> = {};
  if (decision !== "ALL") where.decision = decision;
  if (decisionPath !== "ALL") where.decisionPath = decisionPath;
  if (trigger !== "ALL") where.trigger = trigger;

  const events = await db.approvalAuditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });

  if (format === "jsonl") {
    const body = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
    return new NextResponse(body, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="approval-audit-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      },
    });
  }

  if (format === "csv") {
    const headers = [
      "id",
      "requestId",
      "taskRunId",
      "taskId",
      "projectId",
      "lane",
      "role",
      "trigger",
      "severity",
      "decision",
      "decisionPath",
      "deciderType",
      "deciderId",
      "summary",
      "createdAt",
      "decidedAt",
      "latencyMs",
    ];
    const esc = (value: unknown) => {
      const raw = value == null ? "" : String(value);
      return `"${raw.replace(/"/g, '""')}"`;
    };
    const rows = events.map((event) =>
      [
        event.id,
        event.requestId,
        event.taskRunId,
        event.taskId,
        event.projectId,
        event.lane,
        event.role,
        event.trigger,
        event.severity,
        event.decision,
        event.decisionPath,
        event.deciderType,
        event.deciderId,
        event.summary,
        event.createdAt.toISOString(),
        event.decidedAt?.toISOString() ?? "",
        event.latencyMs ?? "",
      ]
        .map(esc)
        .join(",")
    );
    const csv = `${headers.join(",")}\n${rows.join("\n")}\n`;
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="approval-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ events });
}
