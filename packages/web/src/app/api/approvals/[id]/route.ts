import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const request = await db.approvalRequest.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(request);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const request = await db.approvalRequest.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { decision, decider, reason, outcome, revision } = body;

  if (!["APPROVED", "DENIED", "REVISED"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  if (decision === "REVISED" && (!revision || typeof revision !== "string" || !revision.trim())) {
    return NextResponse.json({ error: "revision is required for REVISED decisions" }, { status: 400 });
  }

  const existingContext =
    request.context && typeof request.context === "object" && !Array.isArray(request.context)
      ? (request.context as Record<string, unknown>)
      : {};

  const nextContext: Record<string, unknown> = { ...existingContext };
  if (decision === "REVISED" && typeof revision === "string") {
    nextContext.revision = revision;
  }

  const defaultOutcome =
    decision === "DENIED"
      ? "pending blocked apply"
      : decision === "REVISED"
        ? "revision captured; pending redispatch"
        : null;

  const updated = await db.approvalRequest.update({
    where: { id },
    data: {
      decision,
      decider: decider || "admin",
      reason: reason || null,
      outcome: outcome || defaultOutcome,
      context: nextContext as any,
      decidedAt: new Date(),
    },
  });

  return NextResponse.json(updated);
}
