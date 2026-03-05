import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { validateCron, computeNextRunAt, resolvePreset } from "@/lib/cron";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const template = await db.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const body = await req.json();
  let { cron, preset, timezone, enabled } = body;

  // Resolve preset to cron string
  if (preset && !cron) {
    const resolved = resolvePreset(preset);
    if (!resolved) {
      return NextResponse.json({ error: `Unknown preset: ${preset}` }, { status: 400 });
    }
    cron = resolved;
  }

  if (!cron || typeof cron !== "string") {
    return NextResponse.json({ error: "cron or preset is required" }, { status: 400 });
  }

  if (!validateCron(cron)) {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  const tz = timezone ?? process.env.DEFAULT_TIMEZONE ?? "America/Los_Angeles";
  const nextRunAt = computeNextRunAt(cron, tz);

  const schedule = await db.schedule.create({
    data: {
      templateId: id,
      cron,
      timezone: tz,
      nextRunAt,
      enabled: enabled !== false,
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const schedules = await db.schedule.findMany({
    where: { templateId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(schedules);
}
