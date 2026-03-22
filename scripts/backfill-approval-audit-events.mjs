#!/usr/bin/env node

import { randomUUID } from "crypto";
import pg from "pg";

const { Client } = pg;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function mapDecision(decision) {
  if (decision === "PENDING") return "REQUESTED";
  if (decision === "APPROVED") return "APPROVED";
  if (decision === "DENIED") return "DENIED";
  if (decision === "REVISED") return "REVISED";
  return "REQUESTED";
}

function mapDecisionPath(decision, decider) {
  if (decision === "APPROVED" && decider === "policy:trust-ladder") return "POLICY_AUTO";
  if (decision === "PENDING") return "SYSTEM";
  return "MANUAL";
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const approvals = await client.query(`
    select
      id,
      "requestId" as "requestId",
      "taskRunId" as "taskRunId",
      role,
      trigger,
      severity,
      decision,
      decider,
      reason,
      outcome,
      "createdAt" as "createdAt",
      "decidedAt" as "decidedAt"
    from approval_requests
    order by "createdAt" asc
  `);

  let created = 0;
  let skipped = 0;

  for (const row of approvals.rows) {
    const existing = await client.query(
      `select count(*)::int as n from approval_audit_events where "requestId" = $1`,
      [row.requestId]
    );
    if ((existing.rows[0]?.n ?? 0) > 0) {
      skipped += 1;
      continue;
    }

    const decision = mapDecision(row.decision);
    const decisionPath = mapDecisionPath(row.decision, row.decider);
    const latencyMs = row.decidedAt
      ? Math.max(0, new Date(row.decidedAt).getTime() - new Date(row.createdAt).getTime())
      : null;

    const summary =
      decision === "REQUESTED"
        ? `Backfilled requested approval for ${row.role}.${row.trigger}`
        : `Backfilled ${decision.toLowerCase()} approval for ${row.role}.${row.trigger}`;

    await client.query(
      `insert into approval_audit_events (
        id, "eventId", "eventVersion", "requestId", "taskRunId", role, trigger, severity,
        decision, "decisionPath", "deciderType", "deciderId", summary, "evidenceRefs",
        "createdAt", "decidedAt", "latencyMs", meta
      ) values (
        $1,$2,1,$3,$4,$5,$6,$7::"ApprovalSeverity",
        $8::"ApprovalAuditDecision",$9::"ApprovalDecisionPath",$10,$11,$12,$13::jsonb,
        $14,$15,$16,$17::jsonb
      )`,
      [
        `c${randomUUID().replace(/-/g, "").slice(0, 24)}`,
        randomUUID(),
        row.requestId,
        row.taskRunId,
        row.role,
        row.trigger,
        row.severity,
        decision,
        decisionPath,
        row.decider || (decisionPath === "POLICY_AUTO" ? "policy:trust-ladder" : "system:backfill"),
        row.decider || null,
        summary,
        JSON.stringify({ reason: row.reason, outcome: row.outcome }),
        row.createdAt,
        row.decidedAt,
        latencyMs,
        JSON.stringify({ source: "scripts/backfill-approval-audit-events.mjs" }),
      ]
    );
    created += 1;
  }

  await client.end();
  console.log(JSON.stringify({ approvals: approvals.rows.length, created, skipped }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
