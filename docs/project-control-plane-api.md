# Project Control Plane API

## Purpose

This document defines the external and internal HTTP API contract for Houston's project control plane. It is the implementation companion to:

- `docs/project-control-plane-rearchitecture.md`
- `docs/project-control-plane-schema.md`

The API is designed to support:

- Houston web UI
- OpenClaw runtime integration
- operator/admin tooling
- external automation services

## API Principles

- versioned under `/api/v1`
- JSON request/response format
- Postgres-backed canonical mutations only
- optimistic concurrency for mutable resources
- idempotency keys on side-effecting operations
- stable error contract
- audit/event emission on every meaningful state transition
- service-token auth for automation, session auth for UI

## Authentication

### Supported Auth Modes

- session auth for Houston UI users
- bearer service token for OpenClaw and external automation

### Bearer Token Rules

- `Authorization: Bearer <token>`
- tokens should be scopeable in a later phase
- all automation-facing endpoints must accept service tokens

### Recommended Future Token Scopes

- `projects:read`
- `projects:write`
- `docs:read`
- `docs:write`
- `phases:read`
- `phases:write`
- `work-items:read`
- `work-items:write`
- `dependencies:read`
- `dependencies:write`
- `approvals:read`
- `approvals:write`
- `execution:read`
- `execution:write`
- `audit:read`
- `audit:write`
- `exports:read`
- `exports:write`
- `events:read`

## Common Request Requirements

### Idempotency

Required for POST operations that create state or trigger side effects.

Header:

```http
Idempotency-Key: 01H...
```

Required on:

- create project
- create phase
- create work item
- create dependency
- request approval
- create execution run
- import trigger
- export trigger

### Optimistic Concurrency

Required for mutable document and work-item writes.

Supported via one of:

- `If-Match` header with resource ETag
- `version` field in request body

### Request Correlation

Recommended headers:

```http
X-Request-Id: req_...
X-Actor: houston-ui|openclaw|admin-script
```

## Common Response Envelope

For standard endpoints, prefer:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_123"
  }
}
```

For lists:

```json
{
  "data": [],
  "meta": {
    "requestId": "req_123",
    "nextCursor": null
  }
}
```

## Error Contract

Standard error shape:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Version mismatch",
    "details": {
      "resourceId": "doc_123",
      "expectedVersion": 3,
      "actualVersion": 4
    }
  },
  "meta": {
    "requestId": "req_123"
  }
}
```

### Standard Error Codes

- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONFLICT`
- `DEPENDENCY_CYCLE`
- `DEPENDENCY_BLOCKED`
- `APPROVAL_REQUIRED`
- `INVALID_STATE_TRANSITION`
- `IDEMPOTENCY_REPLAY`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## Resource APIs

### Projects

#### `GET /api/v1/projects`

List projects.

Query params:

- `status`
- `owner`
- `trustMode`
- `archived`
- `cursor`
- `limit`

Response data shape:

```json
{
  "data": [
    {
      "id": "proj_123",
      "slug": "openclaw-operating-model",
      "title": "OpenClaw Operating Model",
      "status": "ACTIVE",
      "owner": "Joe",
      "effectiveTrustMode": "STRICT",
      "docMode": "MANAGED",
      "currentPhase": {
        "id": "phase_2",
        "phaseKey": "phase-2",
        "title": "Phase 2",
        "status": "PLANNING"
      },
      "counts": {
        "planning": 2,
        "ready": 5,
        "blocked": 3,
        "inProgress": 1,
        "done": 7
      },
      "audit": {
        "latestStatus": "COMPLETED",
        "accepted": false
      },
      "latestExport": {
        "id": "exp_123",
        "createdAt": "2026-03-27T12:00:00Z"
      }
    }
  ],
  "meta": {
    "nextCursor": null
  }
}
```

#### `POST /api/v1/projects`

Create project.

Body:

```json
{
  "slug": "new-project",
  "title": "New Project",
  "owner": "Joe",
  "status": "DRAFT",
  "defaultTrustMode": "STRICT",
  "docMode": "MANAGED",
  "summary": "Short summary",
  "idea": "Rough initial thought captured from chat"
}
```

Returns `201` with created project.

Draft-project behavior:

- if `status` is omitted, the API may default to `DRAFT` for fast idea capture flows
- when `idea` is provided, the server may bootstrap a minimal `PROJECT` doc automatically
- draft creation should not create execution work items automatically

#### `GET /api/v1/projects/:id`

Get project detail.

Response should include:

- project core data
- effective trust/doc settings
- phase summaries
- audit summary
- latest export summary

#### `PATCH /api/v1/projects/:id`

Update project metadata/settings.

Patchable fields:

- `title`
- `status`
- `owner`
- `defaultTrustMode`
- `docMode`
- `summary`

Important lifecycle semantics:

- setting `status=PAUSED` pauses the project and blocks new execution starts
- setting `status=ACTIVE` resumes normal scheduling/readiness behavior
- setting `status=DRAFT` is only valid for projects not yet active or by explicit admin override

#### `POST /api/v1/projects/:id/pause`

Pause a project explicitly.

Body:

```json
{
  "reason": "Waiting on external dependency"
}
```

Response includes affected downstream summary counts.

#### `POST /api/v1/projects/:id/resume`

Resume a paused project.

Response includes recomputed readiness summary.

#### `GET /api/v1/projects/:id/overview`

Return fully assembled project overview for UI.

Includes:

- docs summary
- phases
- work-item counts
- blockers
- approvals summary
- latest run summary

### Project Docs

#### `GET /api/v1/project-docs`

Query params:

- `projectId` required
- `kind` optional
- `includeVersions=false|true`

#### `POST /api/v1/project-docs`

Create a canonical project doc.

Body:

```json
{
  "projectId": "proj_123",
  "kind": "ARCHITECTURE",
  "title": "Architecture",
  "contentMarkdown": "# Architecture\n"
}
```

#### `GET /api/v1/project-docs/:id`

Returns current doc plus ETag/version metadata.

#### `PATCH /api/v1/project-docs/:id`

Update doc with optimistic concurrency.

Body:

```json
{
  "version": 3,
  "title": "Architecture",
  "contentMarkdown": "# Updated Architecture\n",
  "editReason": "Refined phase boundaries"
}
```

Error conditions:

- `409 CONFLICT` for stale version
- `423 FORBIDDEN` or `409 INVALID_STATE_TRANSITION` when doc mode is `FROZEN`

#### `GET /api/v1/project-docs/:id/versions`

List version history.

#### `POST /api/v1/project-docs/:id/restore`

Restore a prior version by creating a new head version.

### Phases

#### `GET /api/v1/phases`

Query params:

- `projectId` required
- `status` optional

#### `POST /api/v1/phases`

Create a project phase.

Body:

```json
{
  "projectId": "proj_123",
  "phaseKey": "phase-2",
  "title": "Phase 2",
  "ordinal": 2,
  "planningRequired": true,
  "entryCriteriaMarkdown": "...",
  "exitCriteriaMarkdown": "..."
}
```

#### `GET /api/v1/phases/:id`

Get phase detail.

#### `PATCH /api/v1/phases/:id`

Patchable fields:

- `title`
- `status`
- `planningRequired`
- `entryCriteriaMarkdown`
- `exitCriteriaMarkdown`
- `summaryMarkdown`

If moving to a gated state/transition, resolver + approval policy checks apply.

#### `POST /api/v1/phases/:id/advance`

Request phase advancement.

Possible outcomes:

- success
- blocked by dependencies
- blocked by workflow approval
- blocked by missing planning

Example blocked response:

```json
{
  "error": {
    "code": "DEPENDENCY_BLOCKED",
    "message": "Phase exit criteria not satisfied",
    "details": {
      "blockedReasons": [
        {
          "type": "WORKFLOW_APPROVAL",
          "subjectId": "approval_req_123"
        }
      ]
    }
  }
}
```

### Work Items

#### `GET /api/v1/work-items`

List work items.

Query params:

- `projectId`
- `phaseId`
- `type`
- `status`
- `blockedReasonType`
- `approvalState`
- `includeReadiness=true|false`
- `cursor`
- `limit`

#### `POST /api/v1/work-items`

Create work item.

Body:

```json
{
  "projectId": "proj_123",
  "phaseId": "phase_2",
  "type": "PLANNING",
  "title": "Plan Phase 2 architecture",
  "descriptionMarkdown": "...",
  "autonomyLevel": "MANUAL",
  "riskLevel": "MEDIUM",
  "dataClass": "internal",
  "recommendedSkills": ["mermaid-diagrams"],
  "recommendedTools": ["Read", "Edit"],
  "recommendedCapabilities": ["filesystem.write_project"]
}
```

#### `GET /api/v1/work-items/:id`

Get work-item detail.

Response should include:

- work item core fields
- readiness projection
- blockers
- upstream/downstream dependency summaries
- approval summaries
- latest execution run
- recommended capabilities/skills/tools

#### `PATCH /api/v1/work-items/:id`

Patchable fields:

- `title`
- `descriptionMarkdown`
- `status` (subject to policy/resolver checks)
- `autonomyLevel`
- `riskLevel`
- `dataClass`
- `phaseId`
- `assignedAgentKey`
- `priority`
- `recommendedCapabilities`
- `recommendedSkills`
- `recommendedTools`

Rules:

- `DONE` is not a blind UI state; server validates transition policy
- direct status changes that violate dependencies return `409 DEPENDENCY_BLOCKED`
- direct status changes that require approval return `409 APPROVAL_REQUIRED`
- recommended capabilities/skills/tools are advisory in v1 and do not block on their own

#### `POST /api/v1/work-items/:id/recompute`

Recompute readiness/blockers for one item.

#### `GET /api/v1/work-items/:id/graph`

Return local dependency graph context.

Response shape:

```json
{
  "data": {
    "focus": { "id": "wi_123", "title": "Plan Phase 2 architecture" },
    "upstream": [],
    "downstream": [],
    "cycles": []
  }
}
```

### Dependencies

#### `GET /api/v1/dependencies`

Query params:

- `projectId`
- `phaseId`
- `subjectType`
- `subjectId`

#### `POST /api/v1/dependencies`

Create dependency edge.

Body:

```json
{
  "fromSubjectType": "WORK_ITEM",
  "fromSubjectId": "wi_456",
  "toSubjectType": "WORK_ITEM",
  "toSubjectId": "wi_123",
  "edgeType": "BLOCKS",
  "scope": "CROSS_PROJECT",
  "strength": "HARD",
  "reason": "Phase 2 planning must finish first"
}
```

Behavior:

- runs cycle detection for blocking edges
- returns `409 DEPENDENCY_CYCLE` if invalid

#### `PATCH /api/v1/dependencies/:id`

Patchable fields:

- `strength`
- `reason`
- `archivedAt`

#### `POST /api/v1/dependencies/validate`

Validate a proposed graph mutation without writing.

Body:

```json
{
  "proposedEdges": [
    {
      "fromSubjectType": "WORK_ITEM",
      "fromSubjectId": "wi_456",
      "toSubjectType": "WORK_ITEM",
      "toSubjectId": "wi_123",
      "edgeType": "BLOCKS",
      "scope": "INTRA_PROJECT",
      "strength": "HARD"
    }
  ]
}
```

### Approvals

#### `GET /api/v1/approvals`

List approval requests.

Query params:

- `status`
- `domain`
- `projectId`
- `subjectType`
- `subjectId`

#### `POST /api/v1/approvals`

Create approval request.

Used by:

- UI/admin flow
- OpenClaw approval-needed callback fallback
- internal services

Body:

```json
{
  "domain": "ACTION",
  "subjectType": "EXECUTION_RUN",
  "subjectId": "run_123",
  "trigger": "email.send_external",
  "reason": "Need to send customer-facing email",
  "requiredRole": "admin"
}
```

#### `GET /api/v1/approvals/:id`

Return request plus decisions and bindings.

#### `POST /api/v1/approvals/:id/decide`

Make approval decision.

Body:

```json
{
  "decision": "APPROVED",
  "reason": "Content reviewed",
  "decisionMode": "manual"
}
```

Allowed decisions:

- `APPROVED`
- `DENIED`
- `REVISED`

If `REVISED`, include revision details in `metadata`.

#### `GET /api/v1/approvals/policies`

List active approval policies.

#### `POST /api/v1/approvals/policies`

Create policy.

#### `PATCH /api/v1/approvals/policies/:id`

Update policy.

### Reality Audits

#### `GET /api/v1/reality-audits`

Query params:

- `projectId`
- `status`

#### `POST /api/v1/reality-audits`

Start a reality audit.

Body:

```json
{
  "projectId": "proj_123",
  "sourceType": "LEGACY_MARKDOWN",
  "confidenceMode": "STRICT"
}
```

#### `GET /api/v1/reality-audits/:id`

Return audit summary and findings counts.

#### `GET /api/v1/reality-audits/:id/findings`

List findings.

Query params:

- `result`
- `claimType`

#### `POST /api/v1/reality-audits/:id/accept`

Accept audit baseline for project truth.

May require workflow approval depending on policy.

### Imports

#### `POST /api/v1/imports`

Create import batch.

Body:

```json
{
  "projectId": "proj_123",
  "sourceType": "legacy_markdown",
  "sourceRef": "/Users/openclaw/.openclaw/workspace/memory/projects/openclaw-operating-model"
}
```

#### `GET /api/v1/imports/:id`

Return import batch status.

### Execution Runs

#### `GET /api/v1/execution-runs`

Query params:

- `projectId`
- `phaseId`
- `workItemId`
- `status`

#### `POST /api/v1/execution-runs`

Create/dispatch an execution run for a work item.

Body:

```json
{
  "workItemId": "wi_789",
  "reason": "manual-dispatch"
}
```

Behavior:

- validates readiness
- validates project is not paused
- resolves approval policy
- assembles instructions snapshot
- creates run + approval envelope
- dispatches to OpenClaw or queues dispatch

Possible errors:

- `409 DEPENDENCY_BLOCKED`
- `409 APPROVAL_REQUIRED`
- `409 INVALID_STATE_TRANSITION` for paused projects
- `409 INVALID_STATE_TRANSITION`

#### `GET /api/v1/execution-runs/:id`

Return run detail including approval envelope summary and event timeline.

#### `POST /api/v1/execution-runs/:id/approval-needed`

OpenClaw callback when gated action is encountered.

Body:

```json
{
  "capabilityKey": "email.send_external",
  "reason": "About to send customer-facing email",
  "payloadSummary": {
    "recipientDomain": "example.com",
    "subject": "Status update"
  }
}
```

Response options:

- immediate allow
- immediate deny
- pending approval request created

Example response:

```json
{
  "data": {
    "resolution": "PENDING_APPROVAL",
    "approvalRequestId": "approval_req_123"
  }
}
```

#### `POST /api/v1/execution-runs/:id/resume`

Houston-to-OpenClaw or admin-facing continuation endpoint.

Body:

```json
{
  "approvalRequestId": "approval_req_123",
  "decision": "APPROVED"
}
```

#### `GET /api/v1/execution-runs/:id/events`

List run timeline events.

### Exports

#### `POST /api/v1/exports`

Trigger markdown export snapshot.

Body:

```json
{
  "projectId": "proj_123",
  "triggerType": "MANUAL_API"
}
```

Response:

```json
{
  "data": {
    "id": "exp_123",
    "status": "QUEUED"
  }
}
```

#### `GET /api/v1/exports/:id`

Return export status, output path, and manifest summary.

### Events

#### `GET /api/v1/events`

SSE or websocket-backed event stream.

Supported query params:

- `projectId`
- `streamType`
- `cursor`

SSE event example:

```text
event: work_item.updated
data: {"id":"wi_123","status":"BLOCKED"}
```

## Specialized UI/Control Endpoints

These are optional convenience endpoints for Houston UI.

### `GET /api/v1/board`

Query params:

- `projectId`
- `phaseId`
- `includeBlockedReasons=true`

Returns pre-grouped board columns for:

- `PLANNING`
- `READY`
- `BLOCKED`
- `IN_PROGRESS`
- `DONE`

### `GET /api/v1/projects/:id/dependency-map`

Returns cross-project and intra-project dependency summary for graph views.

### `GET /api/v1/admin/settings`

Returns global system settings including default trust mode.

### `PATCH /api/v1/admin/settings`

Patchable fields:

- `defaultTrustMode`
- `defaultDocMode`
- `exportsRootPath`
- `autoExportSchedule`

### `GET /api/v1/capabilities`

Optional inventory endpoint summarizing what the connected OpenClaw runtime reports as available tools/skills/capabilities.

This endpoint should be used for advisory compatibility checks, not as canonical workflow truth.

## State Transition Rules Exposed Via API

### Work Item Status Transitions

Allowed examples:

- `PLANNING -> READY`
- `READY -> IN_PROGRESS`
- `IN_PROGRESS -> DONE`
- `BLOCKED -> READY` only via resolver-satisfied conditions

Forbidden or guarded examples:

- `BLOCKED -> DONE` without override/approval
- `READY -> DONE` without server-side validation
- any transition violating hard dependencies
- starting execution under a paused project

### Phase Transitions

Must validate:

- planning requirements
- unresolved hard blockers
- workflow approval gates
- exit criteria policy

### Approval Resolution Effects

Approval decisions may:

- unblock a work item
- allow a gated action
- authorize a phase exit
- record an override binding

## OpenClaw Integration Contract

The OpenClaw-facing subset of the API is:

- `POST /api/v1/execution-runs/:id/approval-needed`
- `POST /api/v1/execution-runs/:id/resume`
- `GET /api/v1/execution-runs/:id`
- `GET /api/v1/events`

OpenClaw should receive the effective capability policy in the dispatch payload and use API callbacks for approvals and event correlation.

## Example End-to-End Flow

### Planning Flow

1. UI creates project
2. UI creates Phase 1 with `planningRequired=true`
3. UI or generator creates planning work item
4. Planning work item gets completed
5. System generates execution candidates
6. Workflow approval may be requested before release

### Execution With Action Approval

1. External service creates execution run for `wi_789`
2. Houston validates dependencies and approval policy
3. Houston dispatches OpenClaw with capability envelope
4. OpenClaw attempts `email.send_external`
5. OpenClaw calls `POST /api/v1/execution-runs/:id/approval-needed`
6. Houston creates approval request
7. Admin approves via `POST /api/v1/approvals/:id/decide`
8. Houston/OpenClaw resume run

### Draft Project Capture

1. User or external service creates project with `status=DRAFT`
2. API stores summary/idea and bootstraps minimum project doc scaffolding
3. Project appears in Draft state in UI
4. Planning work is created when the draft is matured toward active execution

## Suggested Initial Implementation Order

1. projects
2. project docs with versioning
3. phases
4. work items
5. dependencies + validation
6. reality audits
7. approval policies/requests/decisions
8. execution runs + approval-needed flow
9. exports
10. board and event convenience endpoints

## Compatibility Notes

- legacy Houston endpoints should remain isolated from these APIs during buildout
- no endpoint in this API should depend on filesystem-backed project truth
- markdown exports are generated artifacts only and must not be writable via canonical doc APIs

## Companion Documents

- `docs/project-control-plane-rearchitecture.md`
- `docs/project-control-plane-schema.md`
- `docs/project-control-plane-cutover.md` (planned)
