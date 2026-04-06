import { NextRequest, NextResponse } from "next/server";
import { reportCpExecutionRun } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { badRequest, controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, notFound, parseRequiredString } from "@/lib/control-plane";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const status = parseRequiredString(body.status);
    if (!status) return badRequest("status is required");

    const { id } = await context.params;
    const data = await reportCpExecutionRun(id, {
      status,
      message: typeof body.message === "string" ? body.message : undefined,
      payload: body.payload,
      errorText: typeof body.errorText === "string" ? body.errorText : undefined,
    });
    if (!data) return notFound("Execution run not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to report execution run status");
  }
}
