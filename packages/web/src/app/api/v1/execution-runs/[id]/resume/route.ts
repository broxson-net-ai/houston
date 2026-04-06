import { NextRequest, NextResponse } from "next/server";
import { resumeCpExecutionRun } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, notFound } from "@/lib/control-plane";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const data = await resumeCpExecutionRun(id, {
      approvalRequestId: typeof body.approvalRequestId === "string" ? body.approvalRequestId.trim() : undefined,
      decision: typeof body.decision === "string" ? body.decision.trim() : undefined,
    });
    if (!data) return notFound("Execution run not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to resume execution run");
  }
}
