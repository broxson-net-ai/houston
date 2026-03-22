import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { enqueueTaskDispatch } from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const task = await db.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await enqueueTaskDispatch(id, "manual-dispatch");

  await db.taskEvent.create({
    data: {
      taskId: id,
      type: "QUEUED",
      message: "Manual dispatch requested and enqueued",
    },
  });

  return NextResponse.json({ message: "Dispatch queued" }, { status: 202 });
}
