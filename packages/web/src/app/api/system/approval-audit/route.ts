import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const windowDays = Math.max(1, Math.min(30, Number(searchParams.get("windowDays") || "7")));
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const weeklyEvents = await db.approvalAuditEvent.findMany({
    where: {
      createdAt: { gte: since },
    },
    select: {
      decision: true,
      decisionPath: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 10000,
  });

  const byDecision: Record<string, number> = {};
  const byPath: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const row of weeklyEvents) {
    byDecision[row.decision] = (byDecision[row.decision] ?? 0) + 1;
    byPath[row.decisionPath] = (byPath[row.decisionPath] ?? 0) + 1;
    const day = row.createdAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  const approvalsTotal = (byDecision.APPROVED ?? 0) + (byDecision.EXECUTED ?? 0);
  const autoRatio = approvalsTotal > 0 ? (byPath.POLICY_AUTO ?? 0) / approvalsTotal : 0;

  const [health, spike, rotation, lastWriteError, rotationError] = await Promise.all([
    db.systemStatus.findUnique({ where: { key: "approval_audit_health" } }),
    db.systemStatus.findUnique({ where: { key: "approval_audit_decision_path_spike" } }),
    db.systemStatus.findUnique({ where: { key: "approval_audit_rotation" } }),
    db.systemStatus.findUnique({ where: { key: "approval_audit_last_write_error" } }),
    db.systemStatus.findUnique({ where: { key: "approval_audit_rotation_error" } }),
  ]);

  return NextResponse.json({
    health: health?.value ?? null,
    spike: spike?.value ?? null,
    rotation: rotation?.value ?? null,
    lastWriteError: lastWriteError?.value ?? null,
    rotationError: rotationError?.value ?? null,
    weeklyReport: {
      windowDays,
      totalEvents: weeklyEvents.length,
      byDecision,
      byPath,
      byDay,
      autoRatio,
      generatedAt: new Date().toISOString(),
    },
  });
}
