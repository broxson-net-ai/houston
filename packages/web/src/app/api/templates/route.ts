import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const templates = await db.template.findMany({
    include: { defaultAgent: true, schedules: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { name, defaultAgentId, skillRef, instructions, tags, priority, enabled } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!instructions || typeof instructions !== "string") {
    return NextResponse.json({ error: "instructions are required" }, { status: 400 });
  }

  const template = await db.template.create({
    data: {
      name,
      defaultAgentId: defaultAgentId ?? null,
      skillRef: skillRef ?? null,
      instructions,
      tags: tags ?? [],
      priority: priority ?? 0,
      enabled: enabled !== false,
    },
    include: { defaultAgent: true },
  });

  return NextResponse.json(template, { status: 201 });
}
