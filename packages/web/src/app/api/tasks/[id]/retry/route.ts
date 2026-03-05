import { NextRequest, NextResponse } from "next/server";
import { db, TaskStatus } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const task = await db.task.findUnique({
    where: { id },
    include: { taskRuns: { orderBy: { attemptNumber: "desc" }, take: 1 } },
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status !== TaskStatus.FAILED) {
    return NextResponse.json(
      { error: "Task must be in FAILED status to retry" },
      { status: 400 }
    );
  }

  // Enqueue retry via pg-boss
  await db.taskEvent.create({
    data: {
      taskId: id,
      type: "QUEUED",
      message: "Retry requested",
    },
  });

  return NextResponse.json({ message: "Retry queued" }, { status: 202 });
}
