import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { readFile } from "fs/promises";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { name } = await params;
  const skill = await db.skillsCache.findUnique({
    where: { name },
  });
  if (!skill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const content = await readFile(skill.path, "utf-8");
    return NextResponse.json({ content, path: skill.path });
  } catch (error) {
    console.error(`[skills] Failed to read SKILL.md for ${name}:`, error);
    return NextResponse.json(
      { error: "Failed to read skill file" },
      { status: 500 }
    );
  }
}
