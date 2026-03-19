import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const decision = searchParams.get("decision") || "PENDING";
  const severity = searchParams.get("severity");

  const where: Record<string, unknown> = {};
  if (decision !== "ALL") {
    where.decision = decision;
  }
  if (severity) {
    where.severity = severity;
  }

  const requests = await db.approvalRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(requests);
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

  return NextResponse.json(request, { status: 201 });
}
