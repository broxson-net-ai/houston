import { NextRequest, NextResponse } from "next/server";
import { getCpApprovalPolicy, updateCpApprovalPolicy } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
  parseOptionalNumber,
} from "@/lib/control-plane";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await context.params;
    const data = await getCpApprovalPolicy(id);
    if (!data) return notFound("Approval policy not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to load approval policy");
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const data = await updateCpApprovalPolicy(id, {
      subjectType: typeof body.subjectType === "string" ? body.subjectType.trim() : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId.trim() : undefined,
      phaseId: typeof body.phaseId === "string" ? body.phaseId.trim() : undefined,
      workItemType: typeof body.workItemType === "string" ? body.workItemType.trim() : undefined,
      autonomyLevel: typeof body.autonomyLevel === "string" ? body.autonomyLevel.trim() : undefined,
      riskLevel: typeof body.riskLevel === "string" ? body.riskLevel.trim() : undefined,
      dataClass: typeof body.dataClass === "string" ? body.dataClass.trim() : undefined,
      capabilityKey: typeof body.capabilityKey === "string" ? body.capabilityKey.trim() : undefined,
      decisionRule: typeof body.decisionRule === "string" ? body.decisionRule.trim() : undefined,
      requiresRole: typeof body.requiresRole === "string" ? body.requiresRole.trim() : undefined,
      priority: parseOptionalNumber(body.priority),
      ruleJson: body.ruleJson,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to update approval policy");
  }
}
