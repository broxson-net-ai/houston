import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const versions = await db.preInstructionsVersion.findMany({
    orderBy: { version: "desc" },
  });
  return NextResponse.json(versions);
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { content } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Get next version number
  const latest = await db.preInstructionsVersion.findFirst({
    orderBy: { version: "desc" },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  // Deactivate all existing versions
  await db.preInstructionsVersion.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // Create new version as active
  const version = await db.preInstructionsVersion.create({
    data: {
      version: nextVersion,
      content,
      isActive: true,
    },
  });

  return NextResponse.json(version, { status: 201 });
}
