import { NextRequest, NextResponse } from "next/server";
import { createCpRealityAudit, listCpRealityAudits } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { badRequest, controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, parseRequiredString } from "@/lib/control-plane";

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const data = await listCpRealityAudits({
      projectId: req.nextUrl.searchParams.get("projectId") ?? undefined,
      status: req.nextUrl.searchParams.get("status") ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list reality audits");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const projectId = parseRequiredString(body.projectId);
    const sourceType = parseRequiredString(body.sourceType);
    const confidenceMode = parseRequiredString(body.confidenceMode);
    if (!projectId || !sourceType || !confidenceMode) {
      return badRequest("projectId, sourceType, and confidenceMode are required");
    }
    const data = await createCpRealityAudit({
      projectId,
      sourceType,
      confidenceMode,
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create reality audit");
  }
}
