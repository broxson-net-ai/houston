import { NextRequest, NextResponse } from "next/server";
import { createCpApprovalRequest, listCpApprovalRequests } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
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
    const domain = req.nextUrl.searchParams.get("domain") ?? undefined;
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const subjectType = req.nextUrl.searchParams.get("subjectType") ?? undefined;
    const subjectId = req.nextUrl.searchParams.get("subjectId") ?? undefined;
    const data = await listCpApprovalRequests({ domain, status, subjectType, subjectId });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list approvals");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const domain = parseRequiredString(body.domain);
    const subjectType = parseRequiredString(body.subjectType);
    const subjectId = parseRequiredString(body.subjectId);
    const trigger = parseRequiredString(body.trigger);
    const reason = parseRequiredString(body.reason);
    if (!domain || !subjectType || !subjectId || !trigger || !reason) {
      return badRequest("domain, subjectType, subjectId, trigger, and reason are required");
    }

    const created = await createCpApprovalRequest({
      domain,
      subjectType,
      subjectId,
      trigger,
      reason,
      requiredRole: typeof body.requiredRole === "string" ? body.requiredRole.trim() : undefined,
      requestedByRunId: typeof body.requestedByRunId === "string" ? body.requestedByRunId.trim() : undefined,
      requestedByActor: typeof body.requestedByActor === "string" ? body.requestedByActor.trim() : undefined,
      metadata: body.metadata,
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create approval request");
  }
}
