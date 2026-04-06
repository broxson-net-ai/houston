import { NextRequest, NextResponse } from "next/server";
import { getCpApprovalRequest } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
} from "@/lib/control-plane";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const request = await getCpApprovalRequest(id);
    if (!request) return notFound("Approval request not found");
    return NextResponse.json({ data: request });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to load approval request");
  }
}
