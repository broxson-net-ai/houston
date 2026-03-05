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
  const task = await db.task.findUnique({
    where: { id },
    include: {
      agent: true,
      template: true,
      schedule: true,
      taskRuns: {
        include: {
          taskLogs: true,
          taskEvents: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { attemptNumber: "asc" },
      },
      taskEvents: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PATCH(
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

  const body = await req.json();
  const { title, agentId, dueAt, archivedAt, status } = body;

  const VALID_STATUSES = ["QUEUE", "IN_PROGRESS", "DONE", "FAILED"];
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await db.task.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(agentId !== undefined && { agentId }),
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
      ...(archivedAt !== undefined && {
        archivedAt: archivedAt ? new Date(archivedAt) : null,
      }),
      ...(status !== undefined && { status }),
    },
    include: { agent: true, template: true },
  });

  if (archivedAt !== undefined) {
    await db.taskEvent.create({
      data: {
        taskId: id,
        type: archivedAt ? "ARCHIVED" : "STATUS_CHANGED",
        message: archivedAt ? "Task archived" : "Task unarchived",
      },
    });
  } else if (status !== undefined && status !== task.status) {
    await db.taskEvent.create({
      data: {
        taskId: id,
        type: "STATUS_CHANGED",
        message: `Status changed from ${task.status} to ${status}`,
      },
    });
  }

  return NextResponse.json(updated);
}
