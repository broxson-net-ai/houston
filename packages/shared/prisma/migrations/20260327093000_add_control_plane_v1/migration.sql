-- Migration: add control-plane v1 canonical project-management tables

-- CreateEnum
CREATE TYPE "CpProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CpDocKind" AS ENUM ('PROJECT', 'ACTION_PLAN', 'NOTES', 'ARCHITECTURE', 'DECISIONS', 'STATUS', 'RUNBOOK');

-- CreateEnum
CREATE TYPE "CpDocMode" AS ENUM ('MANAGED', 'FROZEN', 'EXTERNAL_IMPORT');

-- CreateEnum
CREATE TYPE "CpTrustMode" AS ENUM ('STRICT', 'BALANCED', 'TRUSTED');

-- CreateEnum
CREATE TYPE "CpPhaseStatus" AS ENUM ('PLANNING', 'READY', 'ACTIVE', 'BLOCKED', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CpWorkItemType" AS ENUM ('PLANNING', 'EXECUTION', 'AUDIT', 'REVIEW', 'APPROVAL');

-- CreateEnum
CREATE TYPE "CpWorkItemStatus" AS ENUM ('PLANNING', 'READY', 'BLOCKED', 'IN_PROGRESS', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CpAutonomyLevel" AS ENUM ('MANUAL', 'DRAFT_ONLY', 'APPROVAL_GATED', 'TRUSTED_AUTO');

-- CreateEnum
CREATE TYPE "CpRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CpDependencySubjectType" AS ENUM ('PROJECT', 'PHASE', 'WORK_ITEM', 'APPROVAL_GATE', 'EXTERNAL_GATE');

-- CreateEnum
CREATE TYPE "CpDependencyEdgeType" AS ENUM ('BLOCKS', 'RELATES_TO', 'PARENT_OF', 'REQUIRES_APPROVAL', 'DEPENDS_ON_EXTERNAL', 'PHASE_GATE');

-- CreateEnum
CREATE TYPE "CpDependencyScope" AS ENUM ('INTRA_PROJECT', 'CROSS_PROJECT', 'PHASE_GATE', 'OPERATIONAL_GATE');

-- CreateEnum
CREATE TYPE "CpDependencyStrength" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "CpApprovalDomain" AS ENUM ('WORKFLOW', 'ACTION');

-- CreateEnum
CREATE TYPE "CpApprovalDecisionRule" AS ENUM ('ALLOW', 'DENY', 'APPROVAL_REQUIRED', 'AUTO_RESOLVE_IF_POLICY_MATCH');

-- CreateEnum
CREATE TYPE "CpApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVISED', 'EXPIRED', 'AUTO_RESOLVED');

-- CreateEnum
CREATE TYPE "CpApprovalBindingType" AS ENUM ('UNBLOCKS', 'ALLOWS_ACTION', 'PHASE_EXIT', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "CpExecutionRunStatus" AS ENUM ('ACCEPTED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CpAuditStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'NEEDS_REVIEW', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "CpAuditSourceType" AS ENUM ('LEGACY_MARKDOWN', 'MANUAL_REVIEW', 'HYBRID');

-- CreateEnum
CREATE TYPE "CpFindingResult" AS ENUM ('VERIFIED_TRUE', 'VERIFIED_FALSE', 'UNCLEAR', 'NEEDS_HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "CpExportTriggerType" AS ENUM ('MANUAL_UI', 'MANUAL_API', 'SCHEDULED', 'PRE_CHANGE_CHECKPOINT');

-- CreateEnum
CREATE TYPE "CpExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CpEventStreamType" AS ENUM ('PROJECT', 'PHASE', 'WORK_ITEM', 'DEPENDENCY', 'APPROVAL', 'EXECUTION', 'AUDIT', 'EXPORT', 'SYSTEM');

-- CreateTable
CREATE TABLE "cp_projects" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "CpProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "owner" TEXT,
  "defaultTrustMode" "CpTrustMode" NOT NULL DEFAULT 'STRICT',
  "docMode" "CpDocMode" NOT NULL DEFAULT 'MANAGED',
  "summary" TEXT,
  "metadata" JSONB,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_project_settings" (
  "projectId" TEXT NOT NULL,
  "trustModeOverride" "CpTrustMode",
  "planningRequiredByDefault" BOOLEAN NOT NULL DEFAULT false,
  "autoExportEnabled" BOOLEAN NOT NULL DEFAULT false,
  "defaultAutonomyLevel" "CpAutonomyLevel",
  "settingsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_project_settings_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "cp_project_docs" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" "CpDocKind" NOT NULL,
  "title" TEXT NOT NULL,
  "contentMarkdown" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastEditedBy" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_project_docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_project_doc_versions" (
  "id" TEXT NOT NULL,
  "projectDocId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "contentMarkdown" TEXT NOT NULL,
  "editedBy" TEXT,
  "editReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_project_doc_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_project_phases" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "phaseKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "status" "CpPhaseStatus" NOT NULL DEFAULT 'PLANNING',
  "planningRequired" BOOLEAN NOT NULL DEFAULT false,
  "entryCriteriaMarkdown" TEXT,
  "exitCriteriaMarkdown" TEXT,
  "summaryMarkdown" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_project_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_work_items" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "phaseId" TEXT,
  "type" "CpWorkItemType" NOT NULL,
  "title" TEXT NOT NULL,
  "descriptionMarkdown" TEXT,
  "status" "CpWorkItemStatus" NOT NULL DEFAULT 'PLANNING',
  "autonomyLevel" "CpAutonomyLevel" NOT NULL DEFAULT 'MANUAL',
  "riskLevel" "CpRiskLevel" NOT NULL DEFAULT 'MEDIUM',
  "dataClass" TEXT,
  "trustModeOverride" "CpTrustMode",
  "priority" INTEGER,
  "sourceKind" TEXT,
  "generatedFromAuditFindingId" TEXT,
  "generatedFromPlanWorkItemId" TEXT,
  "assignedAgentKey" TEXT,
  "readyComputedAt" TIMESTAMP(3),
  "blockedReasonCache" JSONB,
  "recommendedCapabilities" JSONB,
  "recommendedSkills" JSONB,
  "recommendedTools" JSONB,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_work_item_labels" (
  "id" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_work_item_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_dependency_edges" (
  "id" TEXT NOT NULL,
  "fromSubjectType" "CpDependencySubjectType" NOT NULL,
  "fromSubjectId" TEXT NOT NULL,
  "toSubjectType" "CpDependencySubjectType" NOT NULL,
  "toSubjectId" TEXT NOT NULL,
  "edgeType" "CpDependencyEdgeType" NOT NULL,
  "scope" "CpDependencyScope" NOT NULL,
  "strength" "CpDependencyStrength" NOT NULL DEFAULT 'HARD',
  "reason" TEXT,
  "createdBy" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_dependency_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_approval_policies" (
  "id" TEXT NOT NULL,
  "domain" "CpApprovalDomain" NOT NULL,
  "subjectType" TEXT,
  "projectId" TEXT,
  "phaseId" TEXT,
  "workItemType" "CpWorkItemType",
  "autonomyLevel" "CpAutonomyLevel",
  "riskLevel" "CpRiskLevel",
  "dataClass" TEXT,
  "capabilityKey" TEXT,
  "decisionRule" "CpApprovalDecisionRule" NOT NULL,
  "requiresRole" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "ruleJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_approval_requests" (
  "id" TEXT NOT NULL,
  "domain" "CpApprovalDomain" NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "CpApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requiredRole" TEXT,
  "requestedByRunId" TEXT,
  "requestedByActor" TEXT,
  "expiresAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "cp_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_approval_decisions" (
  "id" TEXT NOT NULL,
  "approvalRequestId" TEXT NOT NULL,
  "decision" "CpApprovalRequestStatus" NOT NULL,
  "decisionMode" TEXT NOT NULL,
  "decidedBy" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_approval_bindings" (
  "id" TEXT NOT NULL,
  "approvalRequestId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "bindingType" "CpApprovalBindingType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_approval_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_execution_runs" (
  "id" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "phaseId" TEXT,
  "status" "CpExecutionRunStatus" NOT NULL DEFAULT 'ACCEPTED',
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "assembledInstructionsSnapshot" TEXT NOT NULL,
  "gatewayRunId" TEXT,
  "idempotencyKey" TEXT,
  "errorText" TEXT,
  "responsePayload" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_execution_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_run_approval_envelopes" (
  "id" TEXT NOT NULL,
  "executionRunId" TEXT NOT NULL,
  "trustMode" "CpTrustMode" NOT NULL,
  "capabilityPolicyJson" JSONB NOT NULL,
  "effectivePolicyHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_run_approval_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_run_events" (
  "id" TEXT NOT NULL,
  "executionRunId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "message" TEXT,
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_reality_audits" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "CpAuditStatus" NOT NULL DEFAULT 'PENDING',
  "sourceType" "CpAuditSourceType" NOT NULL,
  "confidenceMode" "CpTrustMode" NOT NULL,
  "summary" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "acceptedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_reality_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_reality_findings" (
  "id" TEXT NOT NULL,
  "realityAuditId" TEXT NOT NULL,
  "claimType" TEXT NOT NULL,
  "claimText" TEXT NOT NULL,
  "result" "CpFindingResult" NOT NULL,
  "evidenceJson" JSONB,
  "proposedNextAction" TEXT,
  "resolutionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_reality_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_import_batches" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "sourceHash" TEXT,
  "status" TEXT NOT NULL,
  "summary" TEXT,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_export_snapshots" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "triggerType" "CpExportTriggerType" NOT NULL,
  "status" "CpExportStatus" NOT NULL DEFAULT 'QUEUED',
  "outputPath" TEXT NOT NULL,
  "manifestHash" TEXT,
  "requestedBy" TEXT,
  "errorText" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_export_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_system_events" (
  "id" TEXT NOT NULL,
  "streamType" "CpEventStreamType" NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "payload" JSONB,
  "actor" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cp_system_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cp_projects_slug_key" ON "cp_projects"("slug");
CREATE INDEX "cp_projects_status_archivedAt_idx" ON "cp_projects"("status", "archivedAt");

-- CreateIndex
CREATE INDEX "cp_project_docs_projectId_kind_idx" ON "cp_project_docs"("projectId", "kind");
CREATE UNIQUE INDEX "cp_project_doc_versions_projectDocId_version_key" ON "cp_project_doc_versions"("projectDocId", "version");
CREATE INDEX "cp_project_doc_versions_projectDocId_version_idx" ON "cp_project_doc_versions"("projectDocId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "cp_project_phases_projectId_phaseKey_key" ON "cp_project_phases"("projectId", "phaseKey");
CREATE UNIQUE INDEX "cp_project_phases_projectId_ordinal_key" ON "cp_project_phases"("projectId", "ordinal");
CREATE INDEX "cp_project_phases_projectId_status_archivedAt_idx" ON "cp_project_phases"("projectId", "status", "archivedAt");

-- CreateIndex
CREATE INDEX "cp_work_items_projectId_phaseId_status_archivedAt_idx" ON "cp_work_items"("projectId", "phaseId", "status", "archivedAt");
CREATE INDEX "cp_work_items_projectId_type_status_idx" ON "cp_work_items"("projectId", "type", "status");
CREATE UNIQUE INDEX "cp_work_item_labels_workItemId_label_key" ON "cp_work_item_labels"("workItemId", "label");

-- CreateIndex
CREATE INDEX "cp_dependency_edges_fromSubjectType_fromSubjectId_archivedAt_idx" ON "cp_dependency_edges"("fromSubjectType", "fromSubjectId", "archivedAt");
CREATE INDEX "cp_dependency_edges_toSubjectType_toSubjectId_archivedAt_idx" ON "cp_dependency_edges"("toSubjectType", "toSubjectId", "archivedAt");

-- CreateIndex
CREATE INDEX "cp_approval_policies_domain_isActive_priority_idx" ON "cp_approval_policies"("domain", "isActive", "priority");
CREATE INDEX "cp_approval_policies_projectId_phaseId_isActive_idx" ON "cp_approval_policies"("projectId", "phaseId", "isActive");
CREATE INDEX "cp_approval_requests_status_requestedAt_idx" ON "cp_approval_requests"("status", "requestedAt");
CREATE INDEX "cp_approval_requests_subjectType_subjectId_status_idx" ON "cp_approval_requests"("subjectType", "subjectId", "status");
CREATE INDEX "cp_approval_decisions_approvalRequestId_createdAt_idx" ON "cp_approval_decisions"("approvalRequestId", "createdAt");
CREATE INDEX "cp_approval_bindings_subjectType_subjectId_idx" ON "cp_approval_bindings"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "cp_execution_runs_gatewayRunId_key" ON "cp_execution_runs"("gatewayRunId");
CREATE UNIQUE INDEX "cp_execution_runs_idempotencyKey_key" ON "cp_execution_runs"("idempotencyKey");
CREATE INDEX "cp_execution_runs_workItemId_createdAt_idx" ON "cp_execution_runs"("workItemId", "createdAt");
CREATE INDEX "cp_execution_runs_projectId_status_idx" ON "cp_execution_runs"("projectId", "status");
CREATE UNIQUE INDEX "cp_run_approval_envelopes_executionRunId_key" ON "cp_run_approval_envelopes"("executionRunId");
CREATE INDEX "cp_run_events_executionRunId_occurredAt_idx" ON "cp_run_events"("executionRunId", "occurredAt");

-- CreateIndex
CREATE INDEX "cp_reality_audits_projectId_createdAt_idx" ON "cp_reality_audits"("projectId", "createdAt");
CREATE INDEX "cp_reality_audits_status_createdAt_idx" ON "cp_reality_audits"("status", "createdAt");
CREATE INDEX "cp_reality_findings_realityAuditId_result_idx" ON "cp_reality_findings"("realityAuditId", "result");
CREATE INDEX "cp_import_batches_projectId_createdAt_idx" ON "cp_import_batches"("projectId", "createdAt");
CREATE INDEX "cp_export_snapshots_projectId_createdAt_idx" ON "cp_export_snapshots"("projectId", "createdAt");
CREATE INDEX "cp_export_snapshots_status_createdAt_idx" ON "cp_export_snapshots"("status", "createdAt");
CREATE INDEX "cp_system_events_streamType_occurredAt_idx" ON "cp_system_events"("streamType", "occurredAt");
CREATE INDEX "cp_system_events_subjectType_subjectId_occurredAt_idx" ON "cp_system_events"("subjectType", "subjectId", "occurredAt");

-- AddForeignKey
ALTER TABLE "cp_project_settings" ADD CONSTRAINT "cp_project_settings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_project_docs" ADD CONSTRAINT "cp_project_docs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_project_doc_versions" ADD CONSTRAINT "cp_project_doc_versions_projectDocId_fkey" FOREIGN KEY ("projectDocId") REFERENCES "cp_project_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_project_phases" ADD CONSTRAINT "cp_project_phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_work_items" ADD CONSTRAINT "cp_work_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_work_items" ADD CONSTRAINT "cp_work_items_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "cp_project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_work_items" ADD CONSTRAINT "cp_work_items_generatedFromAuditFindingId_fkey" FOREIGN KEY ("generatedFromAuditFindingId") REFERENCES "cp_reality_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_work_items" ADD CONSTRAINT "cp_work_items_generatedFromPlanWorkItemId_fkey" FOREIGN KEY ("generatedFromPlanWorkItemId") REFERENCES "cp_work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_work_item_labels" ADD CONSTRAINT "cp_work_item_labels_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "cp_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_approval_policies" ADD CONSTRAINT "cp_approval_policies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_approval_policies" ADD CONSTRAINT "cp_approval_policies_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "cp_project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_approval_requests" ADD CONSTRAINT "cp_approval_requests_requestedByRunId_fkey" FOREIGN KEY ("requestedByRunId") REFERENCES "cp_execution_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_approval_decisions" ADD CONSTRAINT "cp_approval_decisions_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "cp_approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_approval_bindings" ADD CONSTRAINT "cp_approval_bindings_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "cp_approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_execution_runs" ADD CONSTRAINT "cp_execution_runs_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "cp_work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_execution_runs" ADD CONSTRAINT "cp_execution_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_execution_runs" ADD CONSTRAINT "cp_execution_runs_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "cp_project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_run_approval_envelopes" ADD CONSTRAINT "cp_run_approval_envelopes_executionRunId_fkey" FOREIGN KEY ("executionRunId") REFERENCES "cp_execution_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_run_events" ADD CONSTRAINT "cp_run_events_executionRunId_fkey" FOREIGN KEY ("executionRunId") REFERENCES "cp_execution_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_reality_audits" ADD CONSTRAINT "cp_reality_audits_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_reality_findings" ADD CONSTRAINT "cp_reality_findings_realityAuditId_fkey" FOREIGN KEY ("realityAuditId") REFERENCES "cp_reality_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_import_batches" ADD CONSTRAINT "cp_import_batches_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cp_export_snapshots" ADD CONSTRAINT "cp_export_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "cp_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
