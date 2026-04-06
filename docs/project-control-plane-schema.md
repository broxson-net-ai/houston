# Project Control Plane Schema

## Purpose

This document defines the canonical data model for Houston's project control plane. It is the implementation companion to `docs/project-control-plane-rearchitecture.md` and is intended to guide Prisma schema work, migration sequencing, service design, and query behavior.

## Schema Principles

- Postgres is the canonical store for all project-control-plane state.
- Every mutable user-facing object must have durable IDs, timestamps, and auditability.
- Planning, execution, approval, and audit are distinct concepts in the schema.
- Dependencies are modeled explicitly as graph edges.
- Read models and projections may denormalize state, but canonical writes happen against normalized tables.
- Legacy Houston task tables remain outside this model and are not reused for canonical project-control-plane behavior.

## Conventions

### IDs

- Primary keys use ULID or UUID string identifiers.
- Externally visible IDs must be opaque and stable.
- `slug` and `phaseKey` are human-friendly identifiers, not primary keys.

### Timestamps

Every canonical table should include:

- `createdAt`
- `updatedAt`

Event-like tables may also include:

- `occurredAt`
- `startedAt`
- `finishedAt`
- `resolvedAt`

### Soft Delete

Primary workflow tables should support soft archival where appropriate instead of hard delete.

- `archivedAt` nullable for project, phase, and work-item style entities
- hard deletes reserved for admin maintenance or invalid staging data

### Metadata

- Structured metadata belongs in JSON columns only for clearly variable data.
- Domain-critical fields should not be hidden in metadata blobs.

## Core Enumerations

### ProjectStatus

- `DRAFT`
- `ACTIVE`
- `PAUSED`
- `ARCHIVED`

### DocKind

- `PROJECT`
- `ACTION_PLAN`
- `NOTES`
- `ARCHITECTURE`
- `DECISIONS`
- `STATUS`
- `RUNBOOK`

### DocMode

- `MANAGED`
- `FROZEN`
- `EXTERNAL_IMPORT`

### TrustMode

- `STRICT`
- `BALANCED`
- `TRUSTED`

### PhaseStatus

- `PLANNING`
- `READY`
- `ACTIVE`
- `BLOCKED`
- `DONE`
- `ARCHIVED`

### WorkItemType

- `PLANNING`
- `EXECUTION`
- `AUDIT`
- `REVIEW`
- `APPROVAL`

### WorkItemStatus

- `PLANNING`
- `READY`
- `BLOCKED`
- `IN_PROGRESS`
- `DONE`
- `ARCHIVED`

### AutonomyLevel

- `MANUAL`
- `DRAFT_ONLY`
- `APPROVAL_GATED`
- `TRUSTED_AUTO`

### RiskLevel

- `LOW`
- `MEDIUM`
- `HIGH`

### DependencySubjectType

- `PROJECT`
- `PHASE`
- `WORK_ITEM`
- `APPROVAL_GATE`
- `EXTERNAL_GATE`

### DependencyEdgeType

- `BLOCKS`
- `RELATES_TO`
- `PARENT_OF`
- `REQUIRES_APPROVAL`
- `DEPENDS_ON_EXTERNAL`
- `PHASE_GATE`

### DependencyScope

- `INTRA_PROJECT`
- `CROSS_PROJECT`
- `PHASE_GATE`
- `OPERATIONAL_GATE`

### DependencyStrength

- `HARD`
- `SOFT`

### ApprovalDomain

- `WORKFLOW`
- `ACTION`

### ApprovalDecisionRule

- `ALLOW`
- `DENY`
- `APPROVAL_REQUIRED`
- `AUTO_RESOLVE_IF_POLICY_MATCH`

### ApprovalRequestStatus

- `PENDING`
- `APPROVED`
- `DENIED`
- `REVISED`
- `EXPIRED`
- `AUTO_RESOLVED`

### ApprovalBindingType

- `UNBLOCKS`
- `ALLOWS_ACTION`
- `PHASE_EXIT`
- `OVERRIDE`

### ExecutionRunStatus

- `ACCEPTED`
- `RUNNING`
- `WAITING_APPROVAL`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

### AuditStatus

- `PENDING`
- `RUNNING`
- `COMPLETED`
- `NEEDS_REVIEW`
- `ACCEPTED`

### AuditSourceType

- `LEGACY_MARKDOWN`
- `MANUAL_REVIEW`
- `HYBRID`

### FindingResult

- `VERIFIED_TRUE`
- `VERIFIED_FALSE`
- `UNCLEAR`
- `NEEDS_HUMAN_REVIEW`

### ExportTriggerType

- `MANUAL_UI`
- `MANUAL_API`
- `SCHEDULED`
- `PRE_CHANGE_CHECKPOINT`

### ExportStatus

- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `FAILED`

### EventStreamType

- `PROJECT`
- `PHASE`
- `WORK_ITEM`
- `DEPENDENCY`
- `APPROVAL`
- `EXECUTION`
- `AUDIT`
- `EXPORT`
- `SYSTEM`

## Canonical Tables

### `projects`

Purpose:

- canonical project container

Fields:

- `id` PK
- `slug` unique
- `title`
- `status` ProjectStatus
- `owner` nullable
- `default_trust_mode` TrustMode
- `doc_mode` DocMode
- `summary` nullable
- `metadata` JSONB nullable
- `archived_at` nullable
- `created_at`
- `updated_at`

Behavior notes:

- `DRAFT` projects may exist with minimal scaffolding
- `PAUSED` projects remain canonical but should block new execution starts and propagate pause blockers through readiness projections

Indexes:

- unique `slug`
- `status, archived_at`

### `project_settings`

Purpose:

- store project-specific operational and policy settings separately from the core project row

Fields:

- `project_id` PK/FK
- `trust_mode_override` nullable TrustMode
- `planning_required_by_default` boolean
- `auto_export_enabled` boolean
- `default_autonomy_level` nullable AutonomyLevel
- `settings_json` JSONB nullable
- `created_at`
- `updated_at`

### `project_docs`

Purpose:

- current active canonical project documents

Fields:

- `id` PK
- `project_id` FK
- `kind` DocKind
- `title`
- `content_markdown`
- `version` integer
- `is_active` boolean
- `last_edited_by` nullable
- `archived_at` nullable
- `created_at`
- `updated_at`

Constraints:

- one active doc per `project_id + kind`

Draft-project note:

- draft projects may initially have only a single `PROJECT` doc

Indexes:

- unique partial index on active `project_id + kind`
- `project_id, kind`

### `project_doc_versions`

Purpose:

- append-only version history for docs

Fields:

- `id` PK
- `project_doc_id` FK
- `version` integer
- `title`
- `content_markdown`
- `edited_by` nullable
- `edit_reason` nullable
- `created_at`

Indexes:

- `project_doc_id, version desc`

### `project_phases`

Purpose:

- canonical project phases

Fields:

- `id` PK
- `project_id` FK
- `phase_key`
- `title`
- `ordinal`
- `status` PhaseStatus
- `planning_required` boolean
- `entry_criteria_markdown` nullable
- `exit_criteria_markdown` nullable
- `summary_markdown` nullable
- `started_at` nullable
- `completed_at` nullable
- `archived_at` nullable
- `created_at`
- `updated_at`

Constraints:

- unique `project_id + phase_key`
- unique `project_id + ordinal`

Indexes:

- `project_id, status, archived_at`
- `project_id, ordinal`

### `work_items`

Purpose:

- canonical board/workflow entity

Fields:

- `id` PK
- `project_id` FK
- `phase_id` nullable FK
- `type` WorkItemType
- `title`
- `description_markdown` nullable
- `status` WorkItemStatus
- `autonomy_level` AutonomyLevel
- `risk_level` RiskLevel
- `data_class` nullable text
- `trust_mode_override` nullable TrustMode
- `priority` nullable integer
- `source_kind` nullable text
- `generated_from_audit_finding_id` nullable FK
- `generated_from_plan_work_item_id` nullable self-FK
- `assigned_agent_key` nullable text
- `ready_computed_at` nullable timestamp
- `blocked_reason_cache` JSONB nullable
- `recommended_capabilities` JSONB nullable
- `recommended_skills` JSONB nullable
- `recommended_tools` JSONB nullable
- `archived_at` nullable
- `created_at`
- `updated_at`

Indexes:

- `project_id, phase_id, status, archived_at`
- `project_id, type, status`
- `status, archived_at`
- `generated_from_audit_finding_id`

### `work_item_labels`

Purpose:

- normalized labels/tags for work items

Fields:

- `id` PK
- `work_item_id` FK
- `label`
- `created_at`

Constraints:

- unique `work_item_id + label`

### `dependency_edges`

Purpose:

- explicit graph relationships between subjects

Pause behavior note:

- a paused project may be represented in readiness computation as an implicit hard blocker rather than requiring persisted synthetic edges for every descendant

Fields:

- `id` PK
- `from_subject_type` DependencySubjectType
- `from_subject_id`
- `to_subject_type` DependencySubjectType
- `to_subject_id`
- `edge_type` DependencyEdgeType
- `scope` DependencyScope
- `strength` DependencyStrength
- `reason` nullable
- `created_by` nullable
- `archived_at` nullable
- `created_at`
- `updated_at`

Constraints:

- unique active edge on `(from_subject_type, from_subject_id, to_subject_type, to_subject_id, edge_type)`
- check to prevent self-edge for same subject type/id unless explicitly supported later

Indexes:

- `from_subject_type, from_subject_id, archived_at`
- `to_subject_type, to_subject_id, archived_at`
- `scope, strength, archived_at`

### `approval_policies`

Purpose:

- declarative approval rules

Fields:

- `id` PK
- `domain` ApprovalDomain
- `subject_type` nullable text
- `project_id` nullable FK
- `phase_id` nullable FK
- `work_item_type` nullable WorkItemType
- `autonomy_level` nullable AutonomyLevel
- `risk_level` nullable RiskLevel
- `data_class` nullable text
- `capability_key` nullable text
- `decision_rule` ApprovalDecisionRule
- `requires_role` nullable text
- `priority` integer
- `is_active` boolean
- `rule_json` JSONB nullable
- `created_at`
- `updated_at`

Indexes:

- `domain, is_active, priority`
- `project_id, phase_id, is_active`
- `capability_key, is_active`

### `approval_requests`

Purpose:

- runtime and workflow approval asks

Fields:

- `id` PK
- `domain` ApprovalDomain
- `subject_type` text
- `subject_id` text
- `trigger` text
- `reason` text
- `status` ApprovalRequestStatus
- `required_role` nullable text
- `requested_by_run_id` nullable FK
- `requested_by_actor` nullable text
- `expires_at` nullable timestamp
- `requested_at`
- `resolved_at` nullable timestamp
- `metadata` JSONB nullable

Indexes:

- `status, requested_at`
- `subject_type, subject_id, status`
- `requested_by_run_id`

### `approval_decisions`

Purpose:

- immutable decision records attached to approval requests

Fields:

- `id` PK
- `approval_request_id` FK
- `decision` ApprovalRequestStatus
- `decision_mode` text
- `decided_by` nullable text
- `reason` nullable text
- `metadata` JSONB nullable
- `created_at`

Indexes:

- `approval_request_id, created_at`

### `approval_bindings`

Purpose:

- binds approval outcomes to workflow or action unlocks

Fields:

- `id` PK
- `approval_request_id` FK
- `subject_type` text
- `subject_id` text
- `binding_type` ApprovalBindingType
- `created_at`

Indexes:

- `subject_type, subject_id`
- `approval_request_id`

### `execution_runs`

Purpose:

- actual execution attempts tied to work items

Fields:

- `id` PK
- `work_item_id` FK
- `project_id` FK
- `phase_id` nullable FK
- `status` ExecutionRunStatus
- `attempt_number` integer
- `assembled_instructions_snapshot` text
- `gateway_run_id` nullable text
- `idempotency_key` nullable text
- `error_text` nullable text
- `response_payload` JSONB nullable
- `started_at` nullable timestamp
- `finished_at` nullable timestamp
- `created_at`
- `updated_at`

Constraints:

- unique nullable `gateway_run_id`

Behavior notes:

- new execution runs must not start for paused projects unless an explicit override policy is later introduced

Indexes:

- `work_item_id, created_at desc`
- `project_id, status`
- `status, created_at`

### `run_approval_envelopes`

Purpose:

- snapshot of effective approval/capability policy for a run

Fields:

- `id` PK
- `execution_run_id` unique FK
- `trust_mode` TrustMode
- `capability_policy_json` JSONB
- `effective_policy_hash` text
- `created_at`

### `run_events`

Purpose:

- timeline of execution-run lifecycle and runtime actions

Fields:

- `id` PK
- `execution_run_id` FK
- `event_type` text
- `message` nullable text
- `payload` JSONB nullable
- `occurred_at`

Indexes:

- `execution_run_id, occurred_at`

### `reality_audits`

Purpose:

- track project truth-rebuild passes

Fields:

- `id` PK
- `project_id` FK
- `status` AuditStatus
- `source_type` AuditSourceType
- `confidence_mode` TrustMode
- `summary` nullable text
- `started_at` nullable
- `finished_at` nullable
- `accepted_at` nullable
- `accepted_by` nullable
- `created_at`
- `updated_at`

Indexes:

- `project_id, created_at desc`
- `status, created_at`

### `reality_findings`

Purpose:

- atomic audited findings from a reality-audit pass

Fields:

- `id` PK
- `reality_audit_id` FK
- `claim_type` text
- `claim_text` text
- `result` FindingResult
- `evidence_json` JSONB nullable
- `proposed_next_action` nullable text
- `resolution_notes` nullable text
- `created_at`
- `updated_at`

Indexes:

- `reality_audit_id, result`

### `import_batches`

Purpose:

- track inbound import jobs and their source material

Fields:

- `id` PK
- `project_id` nullable FK
- `source_type` text
- `source_ref` text
- `source_hash` nullable text
- `status` text
- `summary` nullable text
- `metadata` JSONB nullable
- `started_at` nullable
- `finished_at` nullable
- `created_at`

Indexes:

- `project_id, created_at desc`

### `export_snapshots`

Purpose:

- record read-only markdown exports

Fields:

- `id` PK
- `project_id` nullable FK
- `trigger_type` ExportTriggerType
- `status` ExportStatus
- `output_path` text
- `manifest_hash` nullable text
- `requested_by` nullable text
- `error_text` nullable text
- `started_at` nullable
- `finished_at` nullable
- `created_at`

Indexes:

- `project_id, created_at desc`
- `status, created_at`

### `system_events`

Purpose:

- durable event/audit stream for state changes and external consumers

Fields:

- `id` PK
- `stream_type` EventStreamType
- `subject_type` text
- `subject_id` text
- `event_name` text
- `payload` JSONB nullable
- `actor` nullable text
- `occurred_at`

Indexes:

- `stream_type, occurred_at`
- `subject_type, subject_id, occurred_at`

## Derived / Projection Tables

These are optional but recommended once the core model is stable.

### `work_item_readiness`

Purpose:

- cached readiness and blocker projection for board performance

Fields:

- `work_item_id` PK/FK
- `effective_status` WorkItemStatus
- `is_ready` boolean
- `blocked_reason_json` JSONB
- `hard_blocker_count` integer
- `soft_blocker_count` integer
- `computed_at`

### `project_health_projections`

Purpose:

- aggregated project/phase/work metrics for dashboard views

## Relationship Rules

- a project has many docs
- a project has many phases
- a project has many work items
- a phase belongs to one project
- a work item belongs to one project and optionally one phase
- a work item may generate later work items
- a reality audit belongs to one project
- a finding belongs to one reality audit
- an execution run belongs to one work item and one project
- a run approval envelope belongs to exactly one execution run
- an approval request may be linked to a run but is not required to be
- dependency edges may reference multiple subject kinds, so they use typed references instead of strict FK-only columns

## Integrity Rules

### Project Docs

- only one active doc per project/kind
- update requires current `version`
- new version row must be appended on every successful write

### Phases

- phase ordinal unique within project
- archived phases may not accept new active execution work items without explicit override

### Work Items

- execution work items must belong to a project
- planning requirement for a phase should be enforced through dependency/approval gates, not only via UI validation
- `DONE` cannot be set directly by arbitrary UI drag/drop without satisfying policy and resolver checks
- recommended capabilities/skills/tools are advisory fields only in v1 and do not independently block readiness

### Projects

- `DRAFT` projects may omit phases and most docs initially
- transitioning `DRAFT -> ACTIVE` should require at least minimum planning baseline checks in service logic
- `PAUSED` projects should surface a pause reason in metadata or settings so blocked descendants can show a human-readable reason

### Dependencies

- no duplicate active edges of the same semantic type
- hard self-blocking edges are prohibited
- cycle detection occurs at write time for hard `BLOCKS` and `PHASE_GATE` edges

### Approvals

- approval requests are immutable in intent after creation; decisions append history rather than mutate rationale away
- approval bindings are append-only and auditable

### Execution Runs

- execution runs are never reused for a different work item
- every run gets a capability-policy snapshot
- external gateway IDs must remain unique

## Suggested Prisma Modeling Notes

- use enums for the stable categorical fields listed above
- use explicit model names matching table names where possible
- use `Json` for metadata/evidence/payload blobs
- use relation names consistently for project/phase/work-item hierarchies
- typed dependency references may require a polymorphic pattern rather than direct Prisma relations for every subject type
- keep projection tables and event tables separate from write models

## Query Patterns To Support

The schema should be optimized for these primary queries:

- list projects with aggregate health and current phase
- list draft projects separately from active projects
- fetch a project with docs, phases, planning items, execution items, and audit status
- fetch board columns for a project/phase with blocked reasons
- fetch upstream/downstream dependency graph for a work item
- fetch pending approvals scoped by domain and project
- fetch latest execution run and approval state for a work item
- fetch current trust mode and policy resolution inputs for a project
- fetch latest export snapshot and audit history for a project

## Migration Strategy Notes

- add new models alongside legacy models
- do not overload legacy `tasks` or `task_runs` for new control-plane meaning
- isolate new services behind feature flags until cutover
- keep import/audit data independent from legacy task mutation paths
- promote new schema to primary only after docs, planning, dependency, and approval flows are proven

## Open Questions Reserved For Implementation Docs

- exact Prisma polymorphic pattern for `dependency_edges`
- whether project health projections are materialized or computed on demand first
- whether `system_events` doubles as the external event-stream cursor source or whether a dedicated outbox table is preferable
- whether Neo4j projection metadata should be tracked in this schema or in a separate sync-state table

## Companion Documents

- `docs/project-control-plane-rearchitecture.md`
- `docs/project-control-plane-api.md`
- `docs/project-control-plane-cutover.md` (planned)
- `docs/opencode-approval-envelope.md` (planned)
