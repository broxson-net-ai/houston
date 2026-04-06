import { NextRequest, NextResponse } from "next/server";
import { getCpProjectDoc, updateCpProjectDoc } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  conflict,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
} from "@/lib/control-plane";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const doc = await getCpProjectDoc(id);
    if (!doc) return notFound("Project doc not found");
    return NextResponse.json({ data: doc }, { headers: { ETag: `W/\"${doc.version}\"` } });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to load project doc");
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.version !== "number") {
      return badRequest("version is required");
    }
    const { id } = await context.params;
    const updated = await updateCpProjectDoc(id, {
      version: body.version,
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      contentMarkdown: typeof body.contentMarkdown === "string" ? body.contentMarkdown : undefined,
      editedBy: typeof body.editedBy === "string" ? body.editedBy.trim() : undefined,
      editReason: typeof body.editReason === "string" ? body.editReason.trim() : undefined,
    });

    if (!updated) return notFound("Project doc not found");
    return NextResponse.json({ data: updated }, { headers: { ETag: `W/\"${updated.version}\"` } });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "VERSION_CONFLICT") return conflict("Version mismatch");
    return handleControlPlaneError(error, "Failed to update project doc");
  }
}
