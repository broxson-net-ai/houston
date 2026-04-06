import { NextRequest, NextResponse } from "next/server";
import { createCpWorkItem, listCpWorkItems } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseAutonomyLevel,
  parseOptionalBoolean,
  parseOptionalNumber,
  parseOptionalStringArray,
  parseRequiredString,
  parseRiskLevel,
  parseWorkItemStatus,
  parseWorkItemType,
} from "@/lib/control-plane";

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
    const phaseId = req.nextUrl.searchParams.get("phaseId") ?? undefined;
    const type = parseWorkItemType(req.nextUrl.searchParams.get("type"));
    const status = parseWorkItemStatus(req.nextUrl.searchParams.get("status"));
    const autonomousEligibleParam = req.nextUrl.searchParams.get("autonomousEligible");
    const autonomousEligible = autonomousEligibleParam === null ? undefined : parseOptionalBoolean(autonomousEligibleParam === "true");
    const workItems = await listCpWorkItems({ projectId, phaseId, type: type ?? undefined, status: status ?? undefined, autonomousEligible });
    return NextResponse.json({ data: workItems });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list work items");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = parseRequiredString(body.projectId);
    const type = parseWorkItemType(body.type);
    const title = parseRequiredString(body.title);
    if (!projectId || !type || !title) {
      return badRequest("projectId, type, and title are required");
    }

    const created = await createCpWorkItem({
      projectId,
      phaseId: typeof body.phaseId === "string" ? body.phaseId.trim() : undefined,
      type,
      title,
      descriptionMarkdown: typeof body.descriptionMarkdown === "string" ? body.descriptionMarkdown : undefined,
      status: parseWorkItemStatus(body.status) ?? undefined,
      autonomyLevel: parseAutonomyLevel(body.autonomyLevel) ?? undefined,
      riskLevel: parseRiskLevel(body.riskLevel) ?? undefined,
      dataClass: typeof body.dataClass === "string" ? body.dataClass.trim() : undefined,
      assignedAgentKey: typeof body.assignedAgentKey === "string" ? body.assignedAgentKey.trim() : undefined,
      autonomousEligible: parseOptionalBoolean(body.autonomousEligible),
      priority: parseOptionalNumber(body.priority),
      recommendedCapabilities: parseOptionalStringArray(body.recommendedCapabilities),
      recommendedSkills: parseOptionalStringArray(body.recommendedSkills),
      recommendedTools: parseOptionalStringArray(body.recommendedTools),
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to create work item");
  }
}
