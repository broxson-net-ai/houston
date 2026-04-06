import { NextRequest, NextResponse } from "next/server";
import { evaluateCpGuardrail } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, notFound } from "@/lib/control-plane";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const data = await evaluateCpGuardrail(id, {
      capabilityKey: typeof body.capabilityKey === "string" ? body.capabilityKey.trim() : undefined,
      operation: typeof body.operation === "string" ? body.operation.trim() : undefined,
      resourcePath: typeof body.resourcePath === "string" ? body.resourcePath.trim() : undefined,
    });
    if (!data) return notFound("Execution run not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to evaluate execution guardrail");
  }
}
