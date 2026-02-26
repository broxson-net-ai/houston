import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { validateCron, computeNextRunAt } from "@/lib/cron";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const schedule = await db.schedule.findUnique({ where: { id: params.id } });
  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(schedule);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const schedule = await db.schedule.findUnique({ where: { id: params.id } });
  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { cron, timezone, enabled } = body;

  if (cron !== undefined && !validateCron(cron)) {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  const newCron = cron ?? schedule.cron;
  const newTz = timezone ?? schedule.timezone;
  const nextRunAt = cron || timezone ? computeNextRunAt(newCron, newTz) : undefined;

  const updated = await db.schedule.update({
    where: { id: params.id },
    data: {
      ...(cron !== undefined && { cron }),
      ...(timezone !== undefined && { timezone }),
      ...(enabled !== undefined && { enabled }),
      ...(nextRunAt && { nextRunAt }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const schedule = await db.schedule.findUnique({ where: { id: params.id } });
  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.schedule.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
