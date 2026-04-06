import { NextRequest, NextResponse } from "next/server";
import { generateCpWorkItemsFromPhase } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, notFound } from "@/lib/control-plane";

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await context.params;
    const data = await generateCpWorkItemsFromPhase(id);
    if (!data) return notFound("Phase not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to generate work items from phase");
  }
}
