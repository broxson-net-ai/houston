import { NextRequest, NextResponse } from "next/server";
import { db, TaskStatus } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import { enqueueTaskDispatch } from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const task = await db.task.findUnique({
    where: { id },
    include: {
      dependencies: {
        include: {
          dependsOnTask: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const unresolvedDependencyCount = (task.dependencies ?? []).filter(
    (dep) => dep.dependsOnTask?.status !== TaskStatus.DONE
  ).length;
  if (unresolvedDependencyCount > 0) {
    if (task.status !== TaskStatus.BLOCKED) {
      await db.task.update({
        where: { id },
        data: { status: TaskStatus.BLOCKED },
      });
      await db.taskEvent.create({
        data: {
          taskId: id,
          type: "STATUS_CHANGED",
          message: "Task blocked: waiting on dependencies",
          metadata: {
            semanticStatus: "BLOCKED",
            unresolvedDependencyCount,
          },
        },
      });
    }
    return NextResponse.json(
      { error: "Task is blocked by dependencies", unresolvedDependencyCount },
      { status: 409 }
    );
  }

  if (task.status === TaskStatus.BLOCKED) {
    await db.task.update({ where: { id }, data: { status: TaskStatus.QUEUE } });
    await db.taskEvent.create({
      data: {
        taskId: id,
        type: "STATUS_CHANGED",
        message: "Task unblocked manually for dispatch",
        metadata: { semanticStatus: "UNBLOCKED" },
      },
    });
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
