import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const skills = await db.skillsCache.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(skills);
}
