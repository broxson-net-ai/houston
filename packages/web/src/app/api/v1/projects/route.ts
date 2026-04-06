import { NextRequest, NextResponse } from "next/server";
import {
  CpProjectStatus,
  createCpProject,
  listCpProjects,
} from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseDocMode,
  parseProjectStatus,
  parseRequiredString,
  parseTrustMode,
} from "@/lib/control-plane";

export async function GET() {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const projects = await listCpProjects();
    return NextResponse.json({ data: projects });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list control-plane projects");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const slug = parseRequiredString(body.slug);
    const title = parseRequiredString(body.title);
    const parsedStatus = parseProjectStatus(body.status);
    if (!slug || !title) {
      return badRequest("slug and title are required");
    }
    if (body.status !== undefined && parsedStatus === null) {
      return badRequest("Invalid project status", { allowed: Object.values(CpProjectStatus) });
    }

    const created = await createCpProject({
      slug,
      title,
      owner: typeof body.owner === "string" ? body.owner.trim() : undefined,
      status: parsedStatus ?? undefined,
      defaultTrustMode: parseTrustMode(body.defaultTrustMode) ?? undefined,
      docMode: parseDocMode(body.docMode) ?? undefined,
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
      idea: typeof body.idea === "string" ? body.idea.trim() : undefined,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create control-plane project");
  }
}
