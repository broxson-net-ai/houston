import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(agent);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, routingKey, avatarUrl, tags, enabled } = body;

  const updated = await db.agent.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(routingKey !== undefined && { routingKey }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(tags !== undefined && { tags }),
      ...(enabled !== undefined && { enabled }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.agent.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
