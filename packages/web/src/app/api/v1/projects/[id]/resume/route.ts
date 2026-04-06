import { NextRequest, NextResponse } from "next/server";
import { resumeCpProject } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
} from "@/lib/control-plane";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const project = await resumeCpProject(id);
    if (!project) return notFound("Project not found");
    return NextResponse.json({ data: project });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to resume project");
  }
}
