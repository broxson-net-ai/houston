# PRD v1.1 — **Houston** (BMHQ-like Agent Task HQ for OpenClaw)

> **Product name:** Houston  
> **Purpose:** A self-hosted “mission control” web app for scheduling, dispatching, and monitoring OpenClaw agent work with strong visibility, logs, and missed-run detection.

This PRD incorporates the confirmed decisions:

- **Dispatch is async**
- **Tasks are created at dispatch-time (no pre-generated instances)**
- **Missed runs must be flagged on the task card**
- **Separate Failed column**
- **Mostly system-driven statuses**
- **Single-user**
- **No Telegram; use OpenClaw’s primary channel behavior**
- **Logs stored locally in DB**
- **Local skills registry sourced from OpenClaw’s filesystem skill store**

OpenClaw references we build against:

- Gateway is a **single control plane**; operator clients connect over WebSocket (default `127.0.0.1:18789`).  
  Source: https://docs.openclaw.ai/concepts/architecture
- WS protocol uses a `connect` handshake and typed request/response/event framing; side-effecting methods (including `agent`) require idempotency keys.  
  Source: https://docs.openclaw.ai/concepts/architecture and https://docs.openclaw.ai/gateway/protocol
- Skills live in the workspace under `~/.openclaw/workspace/skills/<skill>/SKILL.md`.  
  Source: https://github.com/openclaw/openclaw

---

## 1) Summary

Houston is a self-hosted web app that schedules and dispatches work to OpenClaw agents through the **OpenClaw Gateway WebSocket protocol** (operator client), tracks runs asynchronously, and provides a Kanban UI to monitor work by **agent** or **status**.

Core capabilities:

- Kanban tasks board with two primary views:
  1. **Status view**: Scheduled → Queue → In Progress → Done → **Failed**
  2. **Agent view**: columns per agent showing their owned/recurring tasks
- **Task templates** + **recurring schedules** (cron/presets)
- **Pre-instructions** prepended to every dispatched task
- **Dispatching** to OpenClaw gateway at due time (async)
- **Task detail** page with:
  - activity timeline
  - captured dispatch payload snapshot
  - execution logs (for debugging)
- **Missed run detection** (flags on task/schedule cards)
- **Local skills registry** read from OpenClaw filesystem skill store

---

## 2) Goals & Success Criteria

### Goals

1. Provide a fast, reliable UI to **see what agents are responsible for** and what is due/missed/failed.
2. Make recurring automation easy: define template + schedule → Houston dispatches work automatically.
3. Ensure operational trust: every dispatched task has a complete history (status changes, dispatch attempts, logs, errors).
4. Make debugging OpenClaw workflows practical with captured **execution logs** and dispatch payload snapshots.

### Success criteria (measurable)

- Create a new task template + schedule in < 2 minutes.
- Due work is dispatched within **±30s** of scheduled time (when system is healthy).
- 100% of dispatched tasks have:
  - a stored dispatch payload snapshot
  - an activity timeline entry
  - stored logs or a stored log reference
- Mean time to diagnose a failed run < 5 minutes using timeline + logs + payload snapshot.

---

## 3) In-Scope Features (MVP)

### 3.1 Tasks board

**Views**

1. **Agent view**: columns are agents; cards show the recurring tasks and latest dispatch outcomes per agent.
2. **Status view**: columns are Scheduled, Queue, In Progress, Done, **Failed**.

**Board functionality**

- Search tasks (title + agent + template + status)
- Filter by agent
- Toggle view mode (agent vs status)
- “New Task” button (ad hoc task)
- “Archived” toggle/view

**Task card contents**

- Title
- Assigned agent (avatar + name)
- Scheduled time (next run time if recurring; due time if instance)
- Status badge (In Progress / Done / Failed)
- **Missed indicator**:
  - badge “MISSED” and/or “Missed: N” with tooltip of timestamps
- Quick actions:
  - open details
  - dispatch now
  - retry last run (if failed)
  - archive

### 3.2 Task detail page

- Header: title, agent, due time, current status
- Instructions preview (assembled result: pre-instructions + template/task instructions)
- Activity timeline:
  - task created
  - scheduled time arrived
  - queued
  - dispatched
  - started/running (if available)
  - completed/failed
  - missed run events (for schedule-derived items)
- Execution logs panel:
  - view logs (stored)
  - copy button
  - show dispatch payload snapshot (for reproducibility)
- Runs list (if multiple attempts): pick attempt to view logs/payload

### 3.3 Templates

- CRUD templates
- Fields:
  - name/title
  - default assigned agent
  - skill reference (string, optional; e.g., “content-development”)
  - template instructions (markdown/plain text)
  - default priority (optional)
  - default tags (optional)

### 3.4 Recurring schedules

- Each template can have **0..N schedules**
- Schedule types:
  - cron expression (preferred)
  - presets (daily, weekly, monthly, X times/day) that generate cron under the hood
- Timezone support: schedules run in a configurable timezone (system default + per schedule override optional)
- **Policy (locked):** “Create task when dispatching” (no pre-generated task instances).

### 3.5 Pre-instructions

- CRUD a global pre-instructions document
- Versioned history (store last N versions)
- Every dispatch stores which pre-instructions version/hash was used.

### 3.6 Agent management

- CRUD agents:
  - display name
  - avatar
  - OpenClaw routing ID / agent key
  - tags (e.g., marketer, engineer)
  - enabled/disabled
- Optional: “agent concurrency limit” hint for throttling dispatch.

### 3.7 Dispatching to OpenClaw gateway (async)

- When work becomes due, Houston assembles instructions and sends a dispatch payload to OpenClaw Gateway.
- Store:
  - request payload
  - response ack
  - gateway run id (if provided)
  - timestamps
- Houston updates status based on gateway events or follow-up queries.

### 3.8 Primary channel delivery (no Telegram)

- Houston defaults to OpenClaw’s **primary channel** delivery behavior.
- Provide fallback to “main session/WebChat” if primary channel is unavailable.

### 3.9 Execution logs

- Store logs per dispatch attempt in local Postgres (text) with:
  - max size cap
  - truncation flag if exceeded

### 3.10 Local skills registry (filesystem-backed)

- Scan OpenClaw skills path:
  - `~/.openclaw/workspace/skills/<skill>/SKILL.md`
- Display:
  - skill name
  - summary/description
  - path on disk
  - last modified time
- Cache parsed metadata in DB for fast UI.

---

## 4) Out of Scope (MVP)

- Multi-user, RBAC, or tenancy
- Editing skills inside Houston (read-only registry in MVP)
- Full analytics dashboards (basic counts OK; deeper later)
- Real-time collaboration/comments

---

## 5) Key Flows

### Flow A: Create a recurring task

1. Create template (“Daily synthesis”)
2. Assign agent (“Gumbo”)
3. Add schedule (“Daily at 05:00” or cron)
4. At due time, Houston dispatches to gateway (async) and creates a Task + TaskRun
5. Board shows status transitions and logs

### Flow B: Debug a failed task

1. Board shows task in **Failed**
2. Open task detail
3. Review timeline and dispatch payload snapshot
4. Read execution logs
5. Retry or dispatch now

### Flow C: Ad hoc task

1. Click “New Task”
2. Choose agent + due time + instructions
3. Dispatch now or schedule for later
4. Review logs

---

## 6) Functional Requirements (Detailed)

### 6.1 Task statuses

Minimum statuses:

- **Queue** (due and waiting to dispatch)
- **In Progress** (gateway accepted and running)
- **Done** (completed)
- **Failed** (explicitly failed)
- **Archived** (visibility state)

**Note on “Scheduled”:** because tasks are created at dispatch-time, “Scheduled” is a _board concept_ derived from schedules’ next run timestamps, not necessarily a Task row.

### 6.2 Logs

- Store logs per dispatch attempt (tasks can have multiple runs/retries)
- Support configurable caps (e.g., 5–20MB per run)
- If cap exceeded: truncate and set `truncated=true` (future: object storage)

### 6.3 Retries & idempotency

- If dispatch fails (gateway down), retry with exponential backoff up to N attempts.
- Use an idempotency key per side-effecting request as required by the gateway protocol.
- Prevent double-dispatch for the same schedule+due timestamp.

### 6.4 Search & filtering

- Search by:
  - task title
  - template name
  - agent name
  - tags
- Filters:
  - agent
  - status
  - archived yes/no

### 6.5 Audit trail

Track:

- who created/edited template/schedule/task (single-user, but still store `user_id`)
- pre-instructions version changes
- all dispatch attempts

---

## 7) Scheduling & Missed Run Semantics

### 7.1 Scheduler mechanics (Houston Scheduler)

Houston includes an internal scheduling subsystem called **Houston Scheduler** (replacing references to BullMQ or similar).

Responsibilities:

- Evaluate schedules on an interval
- Enqueue due dispatch jobs
- Track retries and failures
- Maintain missed-run detection

### 7.2 Dispatch-time task creation (locked)

At due time:

1. Create an internal due marker for the schedule occurrence
2. Enqueue dispatch job
3. When dispatch begins, create:
   - `Task` row (snapshot of what will be sent)
   - `TaskRun` row (attempt #)
4. Dispatch to gateway and await async completion events

### 7.3 Downtime handling window

Define constants:

- `GRACE_WINDOW` (default 5 minutes)
- `LOOKBACK_WINDOW` (default 48 hours)

On startup (and periodically), Houston Scheduler computes expected run times in the lookback window. For each expected time:

- If no `TaskRun` exists and `now > expected + GRACE_WINDOW` → mark as **missed**.

### 7.4 Missed run UX requirements (must-have)

- Board cards show:
  - badge “MISSED”
  - “Missed: N” counter
- Tooltip lists missed timestamps (up to last 10, with “+X more”)
- Schedule detail view shows missed history and last successful run.

---

## 8) OpenClaw Gateway Integration (WebSocket)

Houston acts as an **operator client** over OpenClaw’s WebSocket gateway protocol.

### 8.1 Protocol requirements

- Must `connect` first; token auth if enabled.
- Requests are `{type:"req", id, method, params}`
- Responses are `{type:"res", id, ok, payload|error}`
- Gateway may emit events for updates.
- Side-effecting methods (including `agent`) require **idempotency keys**.

Sources:

- https://docs.openclaw.ai/concepts/architecture
- https://docs.openclaw.ai/gateway/protocol

### 8.2 Dispatch method

- Use the gateway’s agent invocation method (`agent`) (or its equivalent surfaced by the protocol).
- Dispatch payload should include:
  - target agent routing identifier
  - assembled instructions
  - metadata (template id, schedule id, due time, tags, priority)
  - delivery hint (“primary channel”)

### 8.3 Async tracking

- On dispatch ACK: create Task + TaskRun
- Update TaskRun status via:
  - gateway events (preferred)
  - gateway follow-up queries (fallback)
- Capture:
  - WS request ID
  - gateway run ID (if present)

---

## 9) Skills Registry (Filesystem)

### 9.1 Source of truth

- `~/.openclaw/workspace/skills/<skill>/SKILL.md`

Source:

- https://github.com/openclaw/openclaw

### 9.2 Scan strategy

- On boot: scan directory tree
- Then:
  - periodic rescan (default 60s), and/or
  - filesystem watcher (optional; platform-dependent in Docker)

### 9.3 Caching

- Store parsed metadata in `skills_cache` with mtime/hash for change detection.

---

## 10) Non-Functional Requirements

### Performance

- Board loads < 1s on LAN for ~1,000 tasks and schedule cards.
- Task detail loads < 1s with logs up to 1MB.

### Reliability

- Houston Scheduler survives restarts without losing due work (persistent queue state).
- Missed-run detection works after downtime.

### Security

- Auth required (single-user):
  - username/password (MVP)
- Secrets via env vars (gateway token, etc.)
- Document reverse proxy recommendations (Caddy/Nginx) but not required in MVP.

### Observability

- Structured logs
- Health endpoints:
  - `/healthz` (process)
  - `/readyz` (db + redis + gateway connectivity optional)
- Admin diagnostics page:
  - last scheduler tick
  - last dispatch success
  - queue depth
  - gateway connection status

---

## 11) Suggested Architecture

### Services (docker-compose)

1. **web**: Next.js (UI + API routes)
2. **worker**: Houston Scheduler + dispatcher + gateway WS client
3. **postgres**
4. **redis**

Optional later:

- **caddy/nginx** reverse proxy
- **minio** for large log blobs (not required)

### Internal modules

- **Houston Scheduler**
  - ticks every X seconds
  - determines due schedule occurrences
  - marks missed occurrences
  - enqueues dispatch jobs
- **Dispatch service**
  - builds instruction payload (pre + template + task)
  - calls OpenClaw gateway over WS
  - records response + run id
- **Gateway event handler**
  - listens for completion/log events
  - updates TaskRun + Task statuses
- **Skills scanner**
  - scans filesystem path
  - caches metadata

---

## 12) Data Model (Proposed)

### tables

**users**

- id, email, password_hash, created_at

**agents**

- id, name, avatar_url, routing_key, enabled, tags(jsonb), created_at

**pre_instructions_versions**

- id, version, content, is_active, created_at

**templates**

- id, name, default_agent_id, skill_ref, instructions, tags(jsonb), priority, enabled

**schedules**

- id, template_id, cron, timezone, enabled
- next_run_at, last_run_at
- missed_count, last_missed_at
- created_at

**tasks** (created at dispatch-time)

- id, title, template_id, schedule_id
- agent_id, due_at, status
- instructions_override nullable
- assembled_instructions_snapshot (text)
- pre_instructions_version
- archived_at nullable
- created_at

**task_runs**

- id, task_id
- attempt_number
- dispatched_at, started_at, finished_at
- status (accepted/running/completed/failed)
- ws_request_id
- gateway_run_id nullable
- request_payload(jsonb)
- response_payload(jsonb)
- error_text nullable

**task_logs**

- id, task_run_id
- log_text (or chunks), truncated bool, created_at

**task_events**

- id, task_id nullable, schedule_id nullable, task_run_id nullable
- type (created/status_changed/dispatched/completed/failed/missed/etc)
- message
- metadata(jsonb)
- created_at

**skills_cache**

- id, name, path, mtime, hash, summary, last_scanned_at

---

## 13) API Endpoints (Representative)

### Auth

- POST `/api/auth/login`
- POST `/api/auth/logout`
- GET `/api/me`

### Agents

- GET/POST `/api/agents`
- PATCH/DELETE `/api/agents/:id`

### Templates & schedules

- GET/POST `/api/templates`
- PATCH/DELETE `/api/templates/:id`
- POST `/api/templates/:id/schedules`
- PATCH/DELETE `/api/schedules/:id`

### Tasks

- GET `/api/tasks?view=agent|status&agentId=&status=&q=&archived=`
- POST `/api/tasks` (ad hoc)
- GET `/api/tasks/:id`
- PATCH `/api/tasks/:id` (assign, due time, archive)
- POST `/api/tasks/:id/dispatch` (run now)
- POST `/api/tasks/:id/retry`

### Skills registry

- GET `/api/skills`
- GET `/api/skills/:name`

### Gateway callbacks / events

- WS handled in worker (preferred). If OpenClaw supports webhooks for events, add:
  - POST `/api/gateway/webhook` (signed)

---

## 14) Containerization & Stand-up Requirements

### Deliverables

- `docker-compose.yml` with: web, worker, postgres, redis
- `.env.example` with required vars
- Single command bring-up:
  - `docker compose up -d`
- Automatic DB migrations on startup (or a documented command)
- Optional seed data: a few agents + templates

### Config via env vars (examples)

- `DATABASE_URL=postgres://...`
- `REDIS_URL=redis://...`
- `APP_BASE_URL=http://localhost:3000`
- `OPENCLAW_GATEWAY_URL=ws://host.docker.internal:18789`
- `OPENCLAW_GATEWAY_TOKEN=...`
- `DEFAULT_TIMEZONE=America/Los_Angeles`
- `HOUSTON_DISPATCH_CONCURRENCY=5`
- `HOUSTON_GRACE_WINDOW_SECONDS=300`
- `HOUSTON_LOOKBACK_WINDOW_HOURS=48`
- `OPENCLAW_SKILLS_PATH=/home/openclaw/.openclaw/workspace/skills`

---

## 15) Acceptance Criteria (MVP)

1. Create agents, templates, schedules, and pre-instructions in UI.
2. Schedule becomes due → Houston dispatches to OpenClaw gateway (WS) and creates a Task + TaskRun.
3. Async completion updates status into Done or Failed.
4. Board includes a dedicated **Failed** column.
5. Missed schedule runs are detected (after downtime) and flagged on board cards.
6. Task detail shows timeline + stored logs + dispatch payload snapshot.
7. Skills registry populates from filesystem `.../skills/<skill>/SKILL.md` and displays skill metadata.
8. Entire system runs via docker-compose with local Postgres/Redis and a worker running Houston Scheduler.

---

## 16) Remaining Implementation Inputs (non-blocking)

To make “primary channel delivery” deterministic, Houston should expose one setting:

- **Default delivery target**
  - “Primary channel” (default)
  - “Main session/WebChat” (fallback)
  - (future) “Specific channel target”

Houston can determine availability by querying gateway state where supported by the OpenClaw protocol.

---

**End of PRD — Houston**
