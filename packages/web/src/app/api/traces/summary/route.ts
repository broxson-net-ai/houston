import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getTracesSummary } from "@/lib/traces-db";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);

  try {
    const summary = await getTracesSummary({
      startDate: searchParams.get("startDate") ?? undefined,
      endDate:   searchParams.get("endDate")   ?? undefined,
    });
    return NextResponse.json(summary);
  } catch (e: any) {
    console.error("GET /api/traces/summary error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
