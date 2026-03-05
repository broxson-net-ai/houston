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
  const template = await db.template.findUnique({
    where: { id },
    include: { defaultAgent: true, schedules: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const template = await db.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, defaultAgentId, skillRef, instructions, tags, priority, enabled } = body;

  const updated = await db.template.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(defaultAgentId !== undefined && { defaultAgentId }),
      ...(skillRef !== undefined && { skillRef }),
      ...(instructions !== undefined && { instructions }),
      ...(tags !== undefined && { tags }),
      ...(priority !== undefined && { priority }),
      ...(enabled !== undefined && { enabled }),
    },
    include: { defaultAgent: true },
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
  const template = await db.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.template.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
