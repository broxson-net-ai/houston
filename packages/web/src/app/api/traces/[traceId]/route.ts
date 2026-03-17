import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getTraceDetail } from "@/lib/traces-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { traceId } = await params;
  if (!traceId) {
    return NextResponse.json({ error: "traceId is required" }, { status: 400 });
  }

  try {
    const detail = await getTraceDetail(traceId);
    if (!detail) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e: any) {
    console.error(`GET /api/traces/${traceId} error:`, e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
