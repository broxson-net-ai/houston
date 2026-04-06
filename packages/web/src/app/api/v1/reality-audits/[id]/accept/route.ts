import { NextRequest, NextResponse } from "next/server";
import { acceptCpRealityAudit } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { controlPlaneDisabledResponse, handleControlPlaneError, isControlPlaneEnabled, notFound } from "@/lib/control-plane";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const { id } = await context.params;
    const data = await acceptCpRealityAudit(id, typeof body.acceptedBy === "string" ? body.acceptedBy.trim() : undefined);
    if (!data) return notFound("Reality audit not found");
    return NextResponse.json({ data });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to accept reality audit");
  }
}
