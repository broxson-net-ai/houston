import { NextRequest, NextResponse } from "next/server";
import { handleCpApprovalNeeded } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { badRequest, controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, notFound, parseRequiredString } from "@/lib/control-plane";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const capabilityKey = parseRequiredString(body.capabilityKey);
    const reason = parseRequiredString(body.reason);
    if (!capabilityKey || !reason) return badRequest("capabilityKey and reason are required");
    const { id } = await context.params;
    const data = await handleCpApprovalNeeded(id, { capabilityKey, reason, payloadSummary: body.payloadSummary });
    if (!data) return notFound("Execution run not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to handle approval-needed callback");
  }
}
