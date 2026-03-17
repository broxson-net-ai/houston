import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { listTraces } from "@/lib/traces-db";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const result = await listTraces({
      limit,
      offset,
      startDate:  searchParams.get("startDate")  ?? undefined,
      endDate:    searchParams.get("endDate")    ?? undefined,
      projectId:  searchParams.get("projectId")  ?? undefined,
      traceId:    searchParams.get("traceId")    ?? undefined,
      eventType:  searchParams.get("eventType")  ?? undefined,
      hookName:   searchParams.get("hookName")   ?? undefined,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("GET /api/traces error:", e);
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
