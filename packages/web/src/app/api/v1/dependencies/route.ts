import { NextRequest, NextResponse } from "next/server";
import { createCpDependency, deleteCpDependency, listCpDependencies } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  conflict,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseRequiredString,
} from "@/lib/control-plane";

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const subjectType = req.nextUrl.searchParams.get("subjectType") ?? undefined;
    const subjectId = req.nextUrl.searchParams.get("subjectId") ?? undefined;
    const data = await listCpDependencies({ subjectType, subjectId });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list dependencies");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const fromSubjectType = parseRequiredString(body.fromSubjectType);
    const fromSubjectId = parseRequiredString(body.fromSubjectId);
    const toSubjectType = parseRequiredString(body.toSubjectType);
    const toSubjectId = parseRequiredString(body.toSubjectId);
    const edgeType = parseRequiredString(body.edgeType);
    const scope = parseRequiredString(body.scope);
    if (!fromSubjectType || !fromSubjectId || !toSubjectType || !toSubjectId || !edgeType || !scope) {
      return badRequest("from/to subject fields, edgeType, and scope are required");
    }

    const created = await createCpDependency({
      fromSubjectType,
      fromSubjectId,
      toSubjectType,
      toSubjectId,
      edgeType,
      scope,
      strength: typeof body.strength === "string" ? body.strength.trim().toUpperCase() : undefined,
      reason: typeof body.reason === "string" ? body.reason.trim() : undefined,
      createdBy: typeof body.createdBy === "string" ? body.createdBy.trim() : undefined,
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "DEPENDENCY_CYCLE") return conflict("Dependency cycle detected");
    return handleControlPlaneError(error, "Failed to create dependency");
  }
}

export async function DELETE(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return badRequest("id is required");
    const data = await deleteCpDependency(id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to archive dependency");
  }
}
