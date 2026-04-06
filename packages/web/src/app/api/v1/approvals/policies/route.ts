import { NextRequest, NextResponse } from "next/server";
import { createCpApprovalPolicy, listCpApprovalPolicies } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseOptionalNumber,
  parseRequiredString,
} from "@/lib/control-plane";

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const data = await listCpApprovalPolicies({
      domain: req.nextUrl.searchParams.get("domain") ?? undefined,
      projectId: req.nextUrl.searchParams.get("projectId") ?? undefined,
      capabilityKey: req.nextUrl.searchParams.get("capabilityKey") ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list approval policies");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const domain = parseRequiredString(body.domain);
    const decisionRule = parseRequiredString(body.decisionRule);
    if (!domain || !decisionRule) {
      return badRequest("domain and decisionRule are required");
    }
    const data = await createCpApprovalPolicy({
      domain,
      decisionRule,
      subjectType: typeof body.subjectType === "string" ? body.subjectType.trim() : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId.trim() : undefined,
      phaseId: typeof body.phaseId === "string" ? body.phaseId.trim() : undefined,
      workItemType: typeof body.workItemType === "string" ? body.workItemType.trim() : undefined,
      autonomyLevel: typeof body.autonomyLevel === "string" ? body.autonomyLevel.trim() : undefined,
      riskLevel: typeof body.riskLevel === "string" ? body.riskLevel.trim() : undefined,
      dataClass: typeof body.dataClass === "string" ? body.dataClass.trim() : undefined,
      capabilityKey: typeof body.capabilityKey === "string" ? body.capabilityKey.trim() : undefined,
      requiresRole: typeof body.requiresRole === "string" ? body.requiresRole.trim() : undefined,
      priority: parseOptionalNumber(body.priority),
      ruleJson: body.ruleJson,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create approval policy");
  }
}
