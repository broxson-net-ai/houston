import { NextRequest, NextResponse } from "next/server";
import { createCpImportBatch } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { badRequest, controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, parseRequiredString } from "@/lib/control-plane";

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const sourceType = parseRequiredString(body.sourceType);
    const sourceRef = parseRequiredString(body.sourceRef);
    if (!sourceType || !sourceRef) return badRequest("sourceType and sourceRef are required");
    const data = await createCpImportBatch({
      projectId: typeof body.projectId === "string" ? body.projectId.trim() : undefined,
      sourceType,
      sourceRef,
      sourceHash: typeof body.sourceHash === "string" ? body.sourceHash.trim() : undefined,
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
      metadata: body.metadata,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create import batch");
  }
}
