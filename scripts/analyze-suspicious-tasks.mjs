import { db } from "@houston/shared";

const prisma = db;

async function analyzeSuspiciousDoneTasks() {
  console.log("=== Analyzing tasks marked DONE today ===\n");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`Analysis date: ${today.toISOString()}\n`);

  // Query 1: Tasks with no logs
  console.log("--- Query 1: Tasks marked DONE with no task logs ---");
  const noLogs = await prisma.$queryRaw`
    SELECT
      t.id,
      t.title,
      t."createdAt",
      t."updatedAt",
      tr.id as run_id,
      tr.status as run_status,
      tr."finishedAt",
      tr."gatewayRunId",
      tr."startedAt",
      tl.id as log_id
    FROM tasks t
    LEFT JOIN task_runs tr ON t.id = tr."taskId" AND tr."attemptNumber" = 1
    LEFT JOIN task_logs tl ON tr.id = tl."taskRunId"
    WHERE t.status = 'DONE'
      AND t."createdAt" >= ${today}
      AND tl.id IS NULL
    ORDER BY t."createdAt" DESC
  `;

  console.log(`Found ${noLogs.length} tasks with no logs`);
  if (noLogs.length > 0) {
    console.log("Tasks:", noLogs.map(t => `${t.id}: ${t.title}`).slice(0, 5));
  }
  console.log();

  // Query 2: Tasks with short runtime (< 3 seconds)
  console.log("--- Query 2: Tasks with runtime < 3 seconds ---");
  const shortRuntime = await prisma.$queryRaw`
    SELECT
      t.id,
      t.title,
      tr."finishedAt" - tr."startedAt" as runtime_seconds,
      EXTRACT(EPOCH FROM (tr."finishedAt" - tr."startedAt")) * 1000 as runtime_ms,
      tl."logText",
      LENGTH(tl."logText") as log_length,
      tl.truncated
    FROM tasks t
    JOIN task_runs tr ON t.id = tr."taskId"
    LEFT JOIN task_logs tl ON tr.id = tl."taskRunId"
    WHERE t.status = 'DONE'
      AND tr."finishedAt" IS NOT NULL
      AND tr."startedAt" IS NOT NULL
      AND EXTRACT(EPOCH FROM (tr."finishedAt" - tr."startedAt")) < 3
      AND t."createdAt" >= ${today}
    ORDER BY tr."finishedAt" - tr."startedAt" ASC
  `;

  console.log(`Found ${shortRuntime.length} tasks with short runtime`);
  if (shortRuntime.length > 0) {
    console.log("Tasks:", shortRuntime.slice(0, 5).map(t => `${t.id}: ${t.title} (${t.runtime_ms}ms)`));
  }
  console.log();

  // Query 3: Tasks with no activity markers
  console.log("--- Query 3: Tasks with logs but no activity evidence ---");
  const noActivity = await prisma.$queryRaw`
    SELECT
      t.id,
      t.title,
      tl."logText",
      tl.truncated,
      LENGTH(tl."logText") as log_length
    FROM tasks t
    JOIN task_runs tr ON t.id = tr."taskId"
    JOIN task_logs tl ON tr.id = tl."taskRunId"
    WHERE t.status = 'DONE'
      AND t."createdAt" >= ${today}
      AND NOT (tl."logText" ~* '(tool.*call|output|result|completed|finished|done)')
      AND LENGTH(tl."logText") >= 50
    ORDER BY t."createdAt" DESC
  `;

  console.log(`Found ${noActivity.length} tasks with no activity markers`);
  if (noActivity.length > 0) {
    console.log("Tasks:", noActivity.slice(0, 5).map(t => `${t.id}: ${t.title}`));
  }
  console.log();

  // Query 4: Tasks with short log length
  console.log("--- Query 4: Tasks with logs < 50 characters ---");
  const shortLog = await prisma.$queryRaw`
    SELECT
      t.id,
      t.title,
      tl."logText",
      LENGTH(tl."logText") as log_length,
      tl.truncated
    FROM tasks t
    JOIN task_runs tr ON t.id = tr."taskId"
    JOIN task_logs tl ON tr.id = tl."taskRunId"
    WHERE t.status = 'DONE'
      AND t."createdAt" >= ${today}
      AND LENGTH(tl."logText") < 50
    ORDER BY LENGTH(tl."logText") ASC
  `;

  console.log(`Found ${shortLog.length} tasks with short log length`);
  if (shortLog.length > 0) {
    console.log("Tasks:", shortLog.slice(0, 5).map(t => `${t.id}: ${t.title} (${t.log_length} chars)`));
  }
  console.log();

  // Consolidated query: Find all suspicious tasks
  console.log("=== Consolidated Analysis ===");
  const suspiciousTasks = await prisma.$queryRaw`
    WITH suspicious_tasks AS (
      SELECT
        t.id,
        t.title,
        t.status,
        t."createdAt",
        t."updatedAt",
        tr.id as run_id,
        tr.status as run_status,
        tr."finishedAt",
        tr."startedAt",
        tr."gatewayRunId",
        tl.id as log_id,
        tl."logText",
        LENGTH(tl."logText") as log_length,
        tl.truncated,
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
    )
    SELECT * FROM suspicious_tasks
    WHERE failure_reason != 'valid'
    ORDER BY
      CASE failure_reason
        WHEN 'no_logs' THEN 1
        WHEN 'short_log' THEN 2
        WHEN 'no_activity' THEN 3
        WHEN 'short_runtime' THEN 4
      END,
      "createdAt" DESC
  `;

  console.log(`Total suspicious tasks found: ${suspiciousTasks.length}\n`);

  // Group by failure reason
  const byReason = {};
  for (const task of suspiciousTasks) {
    if (!byReason[task.failure_reason]) {
      byReason[task.failure_reason] = [];
    }
    byReason[task.failure_reason].push(task);
  }

  console.log("Breakdown by failure reason:");
  for (const [reason, tasks] of Object.entries(byReason)) {
    console.log(`  ${reason}: ${tasks.length} tasks`);
    if (tasks.length > 0) {
      console.log("    Examples:", tasks.slice(0, 3).map(t => `${t.id}: ${t.title}`).join(", "));
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total suspicious tasks: ${suspiciousTasks.length}`);
  console.log("Breakdown:");
  for (const [reason, tasks] of Object.entries(byReason)) {
    console.log(`  ${reason}: ${tasks.length}`);
  }

  await prisma.$disconnect();
}

analyzeSuspiciousDoneTasks().catch(console.error);
