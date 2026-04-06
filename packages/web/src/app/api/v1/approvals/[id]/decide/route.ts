import { NextRequest, NextResponse } from "next/server";
import { decideCpApprovalRequest } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
  parseRequiredString,
} from "@/lib/control-plane";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const decision = parseRequiredString(body.decision);
    const decisionMode = parseRequiredString(body.decisionMode) ?? "manual";
    if (!decision) return badRequest("decision is required");
    const { id } = await context.params;
    const updated = await decideCpApprovalRequest({
      approvalRequestId: id,
      decision,
      decisionMode,
      decidedBy: typeof body.decidedBy === "string" ? body.decidedBy.trim() : undefined,
      reason: typeof body.reason === "string" ? body.reason.trim() : undefined,
      metadata: body.metadata,
      bindingType: typeof body.bindingType === "string" ? body.bindingType.trim() : undefined,
    });
    if (!updated) return notFound("Approval request not found");
    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to decide approval request");
  }
}
