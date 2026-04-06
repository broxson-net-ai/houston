import { NextRequest, NextResponse } from "next/server";
import { createCpExecutionRun, listCpExecutionRuns } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  badRequest,
  conflict,
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
  parseRequiredString,
} from "@/lib/control-plane";

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const workItemId = parseRequiredString(body.workItemId);
    if (!workItemId) return badRequest("workItemId is required");

    const created = await createCpExecutionRun({
      workItemId,
      reason: typeof body.reason === "string" ? body.reason.trim() : undefined,
    });

    if (!created) return NextResponse.json({ error: "Work item not found" }, { status: 404 });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "PROJECT_PAUSED") {
      return conflict("Project is paused; execution cannot start");
    }
    return handleControlPlaneError(error, "Failed to create execution run");
  }
}

export async function GET(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const data = await listCpExecutionRuns({
      projectId: req.nextUrl.searchParams.get("projectId") ?? undefined,
      workItemId: req.nextUrl.searchParams.get("workItemId") ?? undefined,
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      pilotOnly: req.nextUrl.searchParams.get("pilotOnly") === "true",
      autonomousOnly: req.nextUrl.searchParams.get("autonomousOnly") === "true",
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list execution runs");
  }
}
