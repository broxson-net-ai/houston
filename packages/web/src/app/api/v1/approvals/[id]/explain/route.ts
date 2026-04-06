import { NextRequest, NextResponse } from "next/server";
import { explainCpApprovalRequest } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, notFound } from "@/lib/control-plane";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await context.params;
    const data = await explainCpApprovalRequest(id);
    if (!data) return notFound("Approval request not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to explain approval request");
  }
}
