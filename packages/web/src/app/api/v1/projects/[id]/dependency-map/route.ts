import { NextRequest, NextResponse } from "next/server";
import { getCpProjectDependencyMap } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled } from "@/lib/control-plane";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await context.params;
    const data = await getCpProjectDependencyMap(id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to load project dependency map");
  }
}
