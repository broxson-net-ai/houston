import { NextRequest, NextResponse } from "next/server";
import { getCpWorkItem, updateCpWorkItem } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  notFound,
  parseAutonomyLevel,
  parseOptionalBoolean,
  parseOptionalNumber,
  parseOptionalStringArray,
  parseRiskLevel,
  parseWorkItemStatus,
} from "@/lib/control-plane";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const workItem = await getCpWorkItem(id);
    if (!workItem) return notFound("Work item not found");
    return NextResponse.json({ data: workItem });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to load work item");
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const workItem = await updateCpWorkItem(id, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      descriptionMarkdown: typeof body.descriptionMarkdown === "string" ? body.descriptionMarkdown : undefined,
      status: parseWorkItemStatus(body.status) ?? undefined,
      autonomyLevel: parseAutonomyLevel(body.autonomyLevel) ?? undefined,
      riskLevel: parseRiskLevel(body.riskLevel) ?? undefined,
      dataClass: typeof body.dataClass === "string" ? body.dataClass.trim() : undefined,
      phaseId: typeof body.phaseId === "string" ? body.phaseId.trim() : undefined,
      assignedAgentKey: typeof body.assignedAgentKey === "string" ? body.assignedAgentKey.trim() : undefined,
      autonomousEligible: parseOptionalBoolean(body.autonomousEligible),
      priority: parseOptionalNumber(body.priority),
      recommendedCapabilities: parseOptionalStringArray(body.recommendedCapabilities),
      recommendedSkills: parseOptionalStringArray(body.recommendedSkills),
      recommendedTools: parseOptionalStringArray(body.recommendedTools),
    });
    return NextResponse.json({ data: workItem });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to update work item");
  }
}
