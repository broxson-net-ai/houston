import { NextRequest, NextResponse } from "next/server";
import { listCpRealityFindings } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled } from "@/lib/control-plane";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await context.params;
    const data = await listCpRealityFindings(id, {
      result: req.nextUrl.searchParams.get("result") ?? undefined,
      claimType: req.nextUrl.searchParams.get("claimType") ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to list reality findings");
  }
}
