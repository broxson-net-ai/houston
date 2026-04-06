import { NextRequest, NextResponse } from "next/server";
import { updateCpPhase } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseOptionalBoolean,
  parsePhaseStatus,
} from "@/lib/control-plane";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const phase = await updateCpPhase(id, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      status: parsePhaseStatus(body.status) ?? undefined,
      planningRequired: parseOptionalBoolean(body.planningRequired),
      entryCriteriaMarkdown: typeof body.entryCriteriaMarkdown === "string" ? body.entryCriteriaMarkdown : undefined,
      exitCriteriaMarkdown: typeof body.exitCriteriaMarkdown === "string" ? body.exitCriteriaMarkdown : undefined,
      summaryMarkdown: typeof body.summaryMarkdown === "string" ? body.summaryMarkdown : undefined,
    });
    return NextResponse.json({ data: phase });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to update phase");
  }
}
