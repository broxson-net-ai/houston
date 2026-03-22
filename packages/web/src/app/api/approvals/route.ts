import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const decision = searchParams.get("decision") || "PENDING";
  const severity = searchParams.get("severity");
  const trust = searchParams.get("trust") || "ALL";
  const trigger = searchParams.get("trigger") || "ALL";
  const includeSummary = searchParams.get("includeSummary") === "1";
  const windowHours = Math.max(1, Number(searchParams.get("windowHours") || "48"));

  const where: Record<string, unknown> = {};
  if (decision !== "ALL") {
    where.decision = decision;
  }
  if (severity) {
    where.severity = severity;
  }
  if (trigger !== "ALL") {
    where.trigger = trigger;
  }
  if (trust === "AUTO_ONLY") {
    where.decider = "policy:trust-ladder";
  } else if (trust === "MANUAL_ONLY") {
    where.NOT = { decider: "policy:trust-ladder" };
  }

  const requests = await db.approvalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (!includeSummary) {
    return NextResponse.json(requests);
  }

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const recent = await db.approvalRequest.findMany({
    where: {
      createdAt: { gte: since },
    },
    select: {
      trigger: true,
      decision: true,
      decider: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const totals = {
    total: recent.length,
    pending: 0,
    denied: 0,
    revised: 0,
    autoApproved: 0,
    manualApproved: 0,
  };

  const byTrigger = new Map<string, {
    total: number;
    pending: number;
    denied: number;
    revised: number;
    autoApproved: number;
    manualApproved: number;
  }>();

  for (const item of recent) {
    const trigger = item.trigger || "unknown";
    if (!byTrigger.has(trigger)) {
      byTrigger.set(trigger, {
        total: 0,
        pending: 0,
        denied: 0,
        revised: 0,
        autoApproved: 0,
        manualApproved: 0,
      });
    }

    const bucket = byTrigger.get(trigger)!;
    bucket.total += 1;

    if (item.decision === "PENDING") {
      bucket.pending += 1;
      totals.pending += 1;
      continue;
    }
    if (item.decision === "DENIED") {
      bucket.denied += 1;
      totals.denied += 1;
      continue;
    }
    if (item.decision === "REVISED") {
      bucket.revised += 1;
      totals.revised += 1;
      continue;
    }
    if (item.decision === "APPROVED") {
      if (item.decider === "policy:trust-ladder") {
        bucket.autoApproved += 1;
        totals.autoApproved += 1;
      } else {
        bucket.manualApproved += 1;
        totals.manualApproved += 1;
      }
    }
  }

  const triggerSummary = Array.from(byTrigger.entries())
    .map(([trigger, bucket]) => ({ trigger, ...bucket }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    requests,
    summary: {
      windowHours,
      ...totals,
      byTrigger: triggerSummary,
    },
  });
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const {
    requestId,
    role,
    trigger,
    severity,
    intent,
    target,
    risk,
    rollback,
    budget,
    context,
    taskRunId,
  } = body;

  if (!requestId || typeof requestId !== "string") {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }
  if (!role || typeof role !== "string") {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  if (!trigger || typeof trigger !== "string") {
    return NextResponse.json({ error: "trigger is required" }, { status: 400 });
  }
  if (!intent || typeof intent !== "string") {
    return NextResponse.json({ error: "intent is required" }, { status: 400 });
  }

  const existing = await db.approvalRequest.findUnique({
    where: { requestId },
  });

  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const request = await db.approvalRequest.create({
    data: {
      requestId,
      role,
      trigger,
      severity: severity || "MEDIUM",
      intent,
      target: target || "",
      risk: risk || "",
      rollback: rollback || "",
      budget: budget || null,
      context: context || null,
      taskRunId: taskRunId || null,
    },
  });

  await db.approvalAuditEvent.create({
    data: {
      eventId: randomUUID(),
      requestId: request.requestId,
      taskRunId: request.taskRunId,
      role: request.role,
      trigger: request.trigger,
      severity: request.severity,
      decision: "REQUESTED",
      decisionPath: "SYSTEM",
      deciderType: "api:approvals",
      summary: `Approval requested via API for role '${request.role}' trigger '${request.trigger}'`,
      evidenceRefs: {
        source: "api/approvals",
      },
    },
  }).catch(() => null);

  return NextResponse.json(request, { status: 201 });
}
