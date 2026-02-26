import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { name: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const skill = await db.skillsCache.findUnique({
    where: { name: params.name },
  });
  if (!skill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(skill);
}
