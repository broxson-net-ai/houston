import { NextRequest, NextResponse } from "next/server";
import { createCpPhase, listCpPhases } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseOptionalBoolean,
  parsePhaseStatus,
  parseRequiredString,
} from "@/lib/control-plane";

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return badRequest("projectId is required");
    const phases = await listCpPhases(projectId);
    return NextResponse.json({ data: phases });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list phases");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = parseRequiredString(body.projectId);
    const phaseKey = parseRequiredString(body.phaseKey);
    const title = parseRequiredString(body.title);
    const ordinal = typeof body.ordinal === "number" ? body.ordinal : null;
    if (!projectId || !phaseKey || !title || ordinal === null) {
      return badRequest("projectId, phaseKey, title, and ordinal are required");
    }

    const created = await createCpPhase({
      projectId,
      phaseKey,
      title,
      ordinal,
      planningRequired: parseOptionalBoolean(body.planningRequired),
      status: parsePhaseStatus(body.status) ?? undefined,
      entryCriteriaMarkdown: typeof body.entryCriteriaMarkdown === "string" ? body.entryCriteriaMarkdown : undefined,
      exitCriteriaMarkdown: typeof body.exitCriteriaMarkdown === "string" ? body.exitCriteriaMarkdown : undefined,
      summaryMarkdown: typeof body.summaryMarkdown === "string" ? body.summaryMarkdown : undefined,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create phase");
  }
}
