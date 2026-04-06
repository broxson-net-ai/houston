import { db } from "@houston/shared";

async function recoverSuspiciousTasks() {
  console.log("=== Starting Recovery Process ===\n");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`Recovery date: ${today.toISOString()}\n`);

  // Create temporary table for recovery tracking
  console.log("Step 1: Identifying suspicious tasks...");
  const suspiciousTasks = await db.$queryRaw`
    WITH suspicious_tasks AS (
      SELECT
        t.id as task_id,
        t."scheduleId",
        tr.id as run_id,
        CASE
          WHEN tl.id IS NULL THEN 'no_logs'
          WHEN LENGTH(tl."logText") < 50 THEN 'short_log'
          WHEN NOT (tl."logText" ~* '(tool.*call|output|result|completed|finished|done)') THEN 'no_activity'
          WHEN tr."startedAt" IS NOT NULL AND tr."finishedAt" IS NOT NULL
               AND EXTRACT(EPOCH FROM (tr."finishedAt" - tr."startedAt")) < 3 THEN 'short_runtime'
          ELSE 'valid'
        END as failure_reason
      FROM tasks t
      LEFT JOIN task_runs tr ON t.id = tr."taskId" AND tr."attemptNumber" = 1
      LEFT JOIN task_logs tl ON tr.id = tl."taskRunId"
      WHERE t.status = 'DONE'
        AND t."createdAt" >= ${today}
        AND (
          tl.id IS NULL
          OR LENGTH(tl."logText") < 50
          OR NOT (tl."logText" ~* '(tool.*call|output|result|completed|finished|done)')
          OR (tr."startedAt" IS NOT NULL AND tr."finishedAt" IS NOT NULL
              AND EXTRACT(EPOCH FROM (tr."finishedAt" - tr."startedAt")) < 3)
        )
    )
    SELECT task_id, run_id, "scheduleId", failure_reason
    FROM suspicious_tasks
    WHERE failure_reason != 'valid'
  `;

  console.log(`Found ${suspiciousTasks.length} suspicious tasks to recover`);

  if (suspiciousTasks.length === 0) {
    console.log("No tasks to recover. Exiting.");
    await db.$disconnect();
    return;
  }

  // Group by failure reason
  const byReason = {};
  for (const task of suspiciousTasks) {
    if (!byReason[task.failure_reason]) {
      byReason[task.failure_reason] = [];
    }
    byReason[task.failure_reason].push(task);
  }

  console.log("\nBreakdown by failure reason:");
  for (const [reason, tasks] of Object.entries(byReason)) {
    console.log(`  ${reason}: ${tasks.length} tasks`);
  }

  console.log("\nStep 2: Adding recovery events...");
  let eventsAdded = 0;
  for (const task of suspiciousTasks) {
    try {
      await db.taskEvent.create({
        data: {
          taskId: task.task_id,
          scheduleId: task.scheduleId,
          taskRunId: task.run_id,
          type: "STATUS_CHANGED",
          message: "Task marked DONE incorrectly - auto-recovering to QUEUE",
          metadata: {
            failureReason: task.failure_reason,
            recoveredAt: new Date().toISOString(),
            validationConfig: {
              minLogLength: 50,
              minRuntimeMs: 3000,
              activityMarkers: "tool.*call|output|result|completed|finished|done"
            }
          }
        }
      });
      eventsAdded++;
    } catch (error) {
      console.warn(`  Failed to add event for task ${task.task_id}: ${error.message}`);
    }
  }
  console.log(`  Added ${eventsAdded} recovery events`);

  console.log("\nStep 3: Resetting task run status...");
  let runsReset = 0;
  for (const task of suspiciousTasks) {
    if (!task.run_id) continue;

    try {
      await db.taskRun.update({
        where: { id: task.run_id },
        data: {
          status: "ACCEPTED",
          finishedAt: null,
          errorText: null,
          updatedAt: new Date()
        }
      });
      runsReset++;
    } catch (error) {
      console.warn(`  Failed to reset run ${task.run_id}: ${error.message}`);
    }
  }
  console.log(`  Reset ${runsReset} task runs to ACCEPTED`);

  console.log("\nStep 4: Resetting task status...");
  let tasksReset = 0;
  for (const task of suspiciousTasks) {
    try {
      await db.task.update({
        where: { id: task.task_id },
        data: {
          status: "QUEUE",
          updatedAt: new Date()
        }
      });
      tasksReset++;
    } catch (error) {
      console.warn(`  Failed to reset task ${task.task_id}: ${error.message}`);
      console.error(error);
    }
  }
  console.log(`  Reset ${tasksReset} tasks to QUEUE`);

  console.log("\n=== Recovery Summary ===");
  console.log(`Total suspicious tasks: ${suspiciousTasks.length}`);
  console.log(`Recovery events added: ${eventsAdded}`);
  console.log(`Task runs reset: ${runsReset}`);
  console.log(`Tasks reset to QUEUE: ${tasksReset}`);
  console.log("\nBreakdown by failure reason:");
  for (const [reason, tasks] of Object.entries(byReason)) {
    console.log(`  ${reason}: ${tasks.length} tasks`);
  }

  console.log("\n=== Recovery Complete ===");
  console.log("Tasks are now in QUEUE status and will be re-dispatched.");

  await db.$disconnect();
}

recoverSuspiciousTasks().catch(console.error);
