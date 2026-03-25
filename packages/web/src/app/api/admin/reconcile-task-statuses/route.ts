import { NextRequest, NextResponse } from "next/server";
import { db, TaskStatus, TaskEventType } from "@houston/shared";
import { requireAuth } from "@/lib/session";

/**
 * Reconcile task statuses based on dependency resolution.
 *
 * This endpoint checks all tasks with QUEUE or BLOCKED status and
 * ensures their status is consistent with their dependencies:
 * - If any dependency is not DONE: status should be BLOCKED
 * - If all dependencies are DONE or no dependencies: status should be QUEUE
 *
 * Usage:
 *   POST /api/admin/reconcile-task-statuses
 *
 * Response:
 *   {
 *     summary: { checked: 10, fixed: 2, unchanged: 8 },
 *     fixed: [{ id, title, oldStatus, newStatus }],
 *     unchanged: [{ id, title, status }]
 *   }
 */
export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dryRun") === "true";

  // Get all tasks with QUEUE or BLOCKED status
  const tasks = await db.task.findMany({
    where: {
      status: { in: [TaskStatus.QUEUE, TaskStatus.BLOCKED] },
      archivedAt: null,
    },
    include: {
      dependencies: {
        include: {
          dependsOnTask: {
            select: { id: true, status: true },
          },
        },
      },
    },
  });

  const results: {
    checked: number;
    fixed: number;
    unchanged: number;
  } = {
    checked: tasks.length,
    fixed: 0,
    unchanged: 0,
  };

  const fixedTasks: Array<{
    id: string;
    title: string;
    oldStatus: TaskStatus;
    newStatus: TaskStatus;
  }> = [];

  for (const task of tasks) {
    const deps = task.dependencies ?? [];

    // Check if any dependency is not DONE
    const hasUnresolvedDependency = deps.some((dep) => dep.dependsOnTask?.status !== TaskStatus.DONE);

    const expectedStatus = hasUnresolvedDependency ? TaskStatus.BLOCKED : TaskStatus.QUEUE;

    if (task.status !== expectedStatus) {
      if (!dryRun) {
        // Update task status
        await db.task.update({
          where: { id: task.id },
          data: { status: expectedStatus },
        });

        // Create task event for observability
        await db.taskEvent.create({
          data: {
            taskId: task.id,
            type: TaskEventType.STATUS_CHANGED,
            message: `Status reconciled: ${task.status} → ${expectedStatus}`,
            metadata: {
              semanticStatus: expectedStatus,
              oldStatus: task.status,
              newStatus: expectedStatus,
              source: "admin-reconcile",
              unresolvedDependencyCount: deps.length,
            },
          },
        });
      }

      results.fixed++;
      fixedTasks.push({
        id: task.id,
        title: task.title,
        oldStatus: task.status as TaskStatus,
        newStatus: expectedStatus,
      });
    } else {
      results.unchanged++;
    }
  }

  return NextResponse.json(
    {
      summary: results,
      fixed: fixedTasks,
      dryRun,
    },
    { status: dryRun ? 200 : 200 }
  );
}
