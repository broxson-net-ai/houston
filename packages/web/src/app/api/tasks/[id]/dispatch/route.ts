import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const task = await db.task.findUnique({ where: { id: params.id } });
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Enqueue a dispatch job via pg-boss would happen here
  // For now, create a QUEUED event
  await db.taskEvent.create({
    data: {
      taskId: params.id,
      type: "QUEUED",
      message: "Manual dispatch requested",
    },
  });

  return NextResponse.json({ message: "Dispatch queued" }, { status: 202 });
}
