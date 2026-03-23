#!/usr/bin/env node

import pg from "pg";
import { randomUUID } from "crypto";

const { Client } = pg;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const deps = {
  "NOW A-02 Trust-ladder verification for external-send actions": [
    "NOW A-01 Guardrails sandbox verification matrix",
  ],
  "NOW A-03 Trust-ladder verification for schedule mutation candidates": [
    "NOW A-01 Guardrails sandbox verification matrix",
  ],
  "NOW A-04 Dashboard approval anomaly panel and filters": [
    "NOW A-02 Trust-ladder verification for external-send actions",
    "NOW A-03 Trust-ladder verification for schedule mutation candidates",
  ],
  "NOW A-05 Dashboard operator runbook completion for approvals incidents": [
    "NOW A-04 Dashboard approval anomaly panel and filters",
  ],
  "NOW A-06 ClawOps schedule mutation policy matrix v0": [
    "NOW A-02 Trust-ladder verification for external-send actions",
    "NOW A-03 Trust-ladder verification for schedule mutation candidates",
    "NOW A-05 Dashboard operator runbook completion for approvals incidents",
  ],
  "NOW A-07 Self-evolve gate lock enforcement and validation": [
    "NOW A-01 Guardrails sandbox verification matrix",
    "NOW A-05 Dashboard operator runbook completion for approvals incidents",
  ],
  "NOW A-09 Retrieval threshold sensitivity and operating config recommendation": [
    "NOW A-08 Retrieval reranker A/B run and scoring report",
  ],
  "NOW B-04 Network cleanup Checkpoint C authoritative DNS normalization execution": [
    "NOW B-03 Network cleanup Checkpoint C pre-change export bundle",
  ],
  "NOW D-01 LIYTH workflow state model and schema definition": [
    "NOW A-06 ClawOps schedule mutation policy matrix v0",
  ],
  "NOW D-02 LIYTH asset ID and manifest MVP internal only": [
    "NOW D-01 LIYTH workflow state model and schema definition",
  ],
  "NOW D-03 Andante non-clinical launch checklist task graph": [
    "NOW A-06 ClawOps schedule mutation policy matrix v0",
  ],
  "NOW D-04 Andante boundary controls and data-class validation": [
    "NOW D-03 Andante non-clinical launch checklist task graph",
  ],
  "NOW D-05 Creator ops recurring Interview Kickstart workflow templates": [
    "NOW A-06 ClawOps schedule mutation policy matrix v0",
  ],
  "NOW D-06 Creator ops Udemy pipeline draft board": [
    "NOW D-05 Creator ops recurring Interview Kickstart workflow templates",
  ],
  "NOW D-07 Business KPI weekly snapshot spec": [
    "NOW D-01 LIYTH workflow state model and schema definition",
    "NOW D-03 Andante non-clinical launch checklist task graph",
    "NOW D-05 Creator ops recurring Interview Kickstart workflow templates",
  ],
  "NEXT AA-02 Approval audit ingestion mapping from approval_requests and task_events": [
    "NEXT AA-01 Approval audit schema and decision-path taxonomy",
  ],
  "NEXT AA-03 Approval audit log rotation and archive policy": [
    "NEXT AA-01 Approval audit schema and decision-path taxonomy",
  ],
};

async function main() {
  const c = new Client({ connectionString: dbUrl });
  await c.connect();

  const allTitles = [...new Set(Object.keys(deps).concat(Object.values(deps).flat()))];
  const rows = await c.query(
    `select id,title,status from tasks where title = any($1::text[])`,
    [allTitles]
  );
  const byTitle = new Map(rows.rows.map((row) => [row.title, row]));

  const touched = await c.query(
    `update tasks set "autoDispatch"=true, "updatedAt"=now() where id = any($1::text[])`,
    [rows.rows.map((task) => task.id)]
  );

  let createdDeps = 0;
  for (const [title, requires] of Object.entries(deps)) {
    const task = byTitle.get(title);
    if (!task) continue;

    for (const depTitle of requires) {
      const depTask = byTitle.get(depTitle);
      if (!depTask) continue;
      const inserted = await c.query(
        `insert into task_dependencies (id,"taskId","dependsOnTaskId","createdAt")
         values ($1, $2, $3, now())
         on conflict ("taskId","dependsOnTaskId") do nothing`,
        [`c${randomUUID().replace(/-/g, "").slice(0, 24)}`, task.id, depTask.id]
      );
      createdDeps += inserted.rowCount || 0;
    }
  }

  await c.end();
  console.log(JSON.stringify({ touchedTasks: touched.rowCount || 0, createdDeps }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
