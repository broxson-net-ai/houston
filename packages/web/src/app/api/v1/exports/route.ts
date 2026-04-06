import { NextRequest, NextResponse } from "next/server";
import { createCpExportSnapshot, listCpExportSnapshots } from "@houston/shared";
import { enqueueControlPlaneExport } from "@/lib/queue";
import { requireAuth } from "@/lib/session";
import { badRequest, controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled } from "@/lib/control-plane";

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
    const data = await listCpExportSnapshots(projectId);
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list export snapshots");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const triggerType = typeof body.triggerType === "string" ? body.triggerType.trim() : "MANUAL_UI";
    if (!triggerType) return badRequest("triggerType is required");
    const data = await createCpExportSnapshot({
      projectId: typeof body.projectId === "string" ? body.projectId.trim() : undefined,
      triggerType,
      requestedBy: typeof body.requestedBy === "string" ? body.requestedBy.trim() : "houston-ui",
    });
    await enqueueControlPlaneExport(data.id);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create export snapshot");
  }
}
