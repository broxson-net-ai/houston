import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const active = await db.preInstructionsVersion.findFirst({
    where: { isActive: true },
  });

  if (!active) {
    return NextResponse.json({ error: "No active pre-instructions" }, { status: 404 });
  }

  return NextResponse.json(active);
}
