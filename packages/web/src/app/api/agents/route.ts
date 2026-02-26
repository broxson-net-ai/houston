import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const agents = await db.agent.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(agents);
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json();
  const { name, routingKey, avatarUrl, tags, enabled } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!routingKey || typeof routingKey !== "string") {
    return NextResponse.json({ error: "routingKey is required" }, { status: 400 });
  }

  const agent = await db.agent.create({
    data: {
      name,
      routingKey,
      avatarUrl: avatarUrl ?? null,
      tags: tags ?? [],
      enabled: enabled !== false,
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
