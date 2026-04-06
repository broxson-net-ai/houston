import { NextRequest, NextResponse } from "next/server";
import { getCpProject, updateCpProject } from "@houston/shared";
import { CpProjectStatus } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
  parseDocMode,
  parseProjectStatus,
  parseTrustMode,
} from "@/lib/control-plane";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const project = await getCpProject(id);
    if (!project) return notFound("Project not found");
    return NextResponse.json({ data: project });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to load control-plane project");
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const parsedStatus = parseProjectStatus(body.status);
    if (body.status !== undefined && parsedStatus === null) {
      return badRequest("Invalid project status", { allowed: Object.values(CpProjectStatus) });
    }
    const project = await updateCpProject(id, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      owner: typeof body.owner === "string" ? body.owner.trim() : undefined,
      status: parsedStatus ?? undefined,
      defaultTrustMode: parseTrustMode(body.defaultTrustMode) ?? undefined,
      docMode: parseDocMode(body.docMode) ?? undefined,
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
    });

    return NextResponse.json({ data: project });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to update control-plane project");
  }
}
