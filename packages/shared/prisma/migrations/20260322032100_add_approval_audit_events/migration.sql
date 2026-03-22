-- CreateEnum
CREATE TYPE "ApprovalDecisionPath" AS ENUM ('MANUAL', 'POLICY_AUTO', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ApprovalAuditDecision" AS ENUM ('REQUESTED', 'APPROVED', 'DENIED', 'REVISED', 'EXPIRED', 'CANCELLED', 'EXECUTED');

-- CreateTable
CREATE TABLE "approval_audit_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "requestId" TEXT NOT NULL,
    "taskRunId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "lane" TEXT,
    "role" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "severity" "ApprovalSeverity" NOT NULL,
    "decision" "ApprovalAuditDecision" NOT NULL,
    "decisionPath" "ApprovalDecisionPath" NOT NULL,
    "deciderType" TEXT NOT NULL,
    "deciderId" TEXT,
    "autonomyTier" TEXT,
    "dataClass" TEXT,
    "summary" TEXT NOT NULL,
    "evidenceRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "meta" JSONB,

    CONSTRAINT "approval_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_audit_events_eventId_key" ON "approval_audit_events"("eventId");

-- CreateIndex
CREATE INDEX "approval_audit_events_requestId_idx" ON "approval_audit_events"("requestId");

-- CreateIndex
CREATE INDEX "approval_audit_events_trigger_idx" ON "approval_audit_events"("trigger");

-- CreateIndex
CREATE INDEX "approval_audit_events_decision_idx" ON "approval_audit_events"("decision");

-- CreateIndex
CREATE INDEX "approval_audit_events_createdAt_idx" ON "approval_audit_events"("createdAt");
