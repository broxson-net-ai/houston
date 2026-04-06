import { NextRequest, NextResponse } from "next/server";
import { updateCpRealityFinding } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
} from "@/lib/control-plane";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const data = await updateCpRealityFinding(id, {
      result: typeof body.result === "string" ? body.result.trim() : undefined,
      resolutionNotes: typeof body.resolutionNotes === "string" ? body.resolutionNotes : undefined,
      proposedNextAction: typeof body.proposedNextAction === "string" ? body.proposedNextAction : undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to update reality finding");
  }
}
