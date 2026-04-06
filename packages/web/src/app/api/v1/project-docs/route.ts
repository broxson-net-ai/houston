import { NextRequest, NextResponse } from "next/server";
import { createCpProjectDoc, listCpProjectDocs } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseDocKind,
  parseRequiredString,
} from "@/lib/control-plane";

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return badRequest("projectId is required");
    const docs = await listCpProjectDocs(projectId);
    return NextResponse.json({ data: docs });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list project docs");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = parseRequiredString(body.projectId);
    const kind = parseDocKind(body.kind);
    const title = parseRequiredString(body.title);
    const contentMarkdown = parseRequiredString(body.contentMarkdown);
    if (!projectId || !kind || !title || !contentMarkdown) {
      return badRequest("projectId, kind, title, and contentMarkdown are required");
    }

    const created = await createCpProjectDoc({
      projectId,
      kind,
      title,
      contentMarkdown,
      editedBy: typeof body.editedBy === "string" ? body.editedBy.trim() : undefined,
      editReason: typeof body.editReason === "string" ? body.editReason.trim() : undefined,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create project doc");
  }
}
