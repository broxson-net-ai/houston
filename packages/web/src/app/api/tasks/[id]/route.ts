import { NextRequest, NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const task = await db.task.findUnique({
    where: { id: params.id },
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
  { params }: { params: { id: string } }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const task = await db.task.findUnique({ where: { id: params.id } });
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { title, agentId, dueAt, archivedAt } = body;

  const updated = await db.task.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(agentId !== undefined && { agentId }),
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
      ...(archivedAt !== undefined && {
        archivedAt: archivedAt ? new Date(archivedAt) : null,
      }),
    },
    include: { agent: true, template: true },
  });

  if (archivedAt !== undefined) {
    await db.taskEvent.create({
      data: {
        taskId: params.id,
        type: archivedAt ? "ARCHIVED" : "STATUS_CHANGED",
        message: archivedAt ? "Task archived" : "Task unarchived",
      },
    });
  }

  return NextResponse.json(updated);
}
