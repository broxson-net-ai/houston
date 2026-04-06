import { NextRequest, NextResponse } from "next/server";
import { pauseCpProject } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
} from "@/lib/control-plane";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const project = await pauseCpProject(id, typeof body.reason === "string" ? body.reason.trim() : undefined);
    if (!project) return notFound("Project not found");
    return NextResponse.json({ data: project });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to pause project");
  }
}
