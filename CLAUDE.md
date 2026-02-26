# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Houston** is a self-hosted "mission control" web app for scheduling, dispatching, and monitoring work sent to **OpenClaw agents** via the OpenClaw Gateway WebSocket protocol. It tracks runs asynchronously and provides a Kanban board UI. The full spec is in `HoustonPRD.md`.

## Intended Stack

- **web**: Next.js (UI + API routes)
- **worker**: Houston Scheduler + dispatcher + gateway WS client (Node.js service)
- **postgres**: persistent storage
- **redis**: async job queue
- Deployed via `docker-compose`; single command: `docker compose up -d`

## Architecture

### Services

The system is split into two containers beyond postgres/redis:

1. **web** — Next.js app serving the UI and all `/api/*` REST endpoints
2. **worker** — background service running three internal modules:
   - **Houston Scheduler**: ticks every N seconds, evaluates cron schedules, marks missed runs, enqueues dispatch jobs
   - **Dispatch service**: assembles instructions (pre-instructions + template + task), sends to OpenClaw gateway over WS, records request/response/run ID
   - **Gateway event handler**: listens for async completion/log events, updates `TaskRun` + `Task` statuses
   - **Skills scanner**: scans `OPENCLAW_SKILLS_PATH` on boot and periodically (default 60s), caches metadata in `skills_cache` table

### Key Design Decisions (locked in PRD)

- **Tasks are created at dispatch-time** — no pre-generated task instances; the board's "Scheduled" column is derived from schedule `next_run_at`, not Task rows
- **Dispatch is async** — ACK from gateway creates `Task` + `TaskRun`; status updates come via gateway events or follow-up queries
- **"Scheduled" is a board concept** derived from schedules, not a task status in the DB
- **Task statuses**: `queue` → `in_progress` → `done` / `failed`; `archived` is a separate visibility flag
- **Missed run detection**: on startup and periodically, look back `HOUSTON_LOOKBACK_WINDOW_HOURS` (default 48h); if expected run has no `TaskRun` and `now > expected + HOUSTON_GRACE_WINDOW_SECONDS` (default 300s), mark missed
- **Idempotency keys** required on all side-effecting WS requests to gateway (per OpenClaw protocol)
- **Pre-instructions** are versioned; each dispatch stores the version/hash used
- **Single-user** auth (username/password); no RBAC

### Data Model (key tables)

```
agents              — OpenClaw routing_key, avatar, tags, enabled
pre_instructions_versions — versioned global pre-instructions, is_active flag
templates           — name, default_agent_id, skill_ref, instructions, tags, priority
schedules           — template_id, cron, timezone, next_run_at, last_run_at, missed_count
tasks               — created at dispatch-time; assembled_instructions_snapshot, pre_instructions_version
task_runs           — attempt_number, ws_request_id, gateway_run_id, request_payload, response_payload
task_logs           — log_text per run, truncated bool (cap: 5–20MB)
task_events         — audit trail: created/status_changed/dispatched/completed/failed/missed
skills_cache        — skill name, path, mtime, hash, summary
```

### OpenClaw Gateway WS Protocol

Houston acts as an **operator client**:
- `connect` handshake with token auth
- Requests: `{type:"req", id, method, params}`
- Responses: `{type:"res", id, ok, payload|error}`
- Side-effecting methods (including `agent`) require idempotency keys
- Dispatch payload includes: target agent `routing_key`, assembled instructions, metadata (template_id, schedule_id, due_at, tags, priority), delivery hint (`"primary channel"`)

## Environment Variables

See `.env.example` (to be created). Key vars:

```
DATABASE_URL=postgres://...
REDIS_URL=redis://...
APP_BASE_URL=http://localhost:3000
OPENCLAW_GATEWAY_URL=ws://host.docker.internal:18789
OPENCLAW_GATEWAY_TOKEN=...
DEFAULT_TIMEZONE=America/Los_Angeles
HOUSTON_DISPATCH_CONCURRENCY=5
HOUSTON_GRACE_WINDOW_SECONDS=300
HOUSTON_LOOKBACK_WINDOW_HOURS=48
OPENCLAW_SKILLS_PATH=/home/openclaw/.openclaw/workspace/skills
```

## Skills Registry

Skills are read from the filesystem: `OPENCLAW_SKILLS_PATH/<skill>/SKILL.md`. Houston scans on boot and re-scans every 60s (change detection via mtime/hash). Registry is read-only in UI.

## Health Endpoints

- `GET /healthz` — process health
- `GET /readyz` — db + redis + gateway connectivity

## Board Views

1. **Agent view** — columns per agent; shows recurring tasks and latest dispatch outcomes
2. **Status view** — columns: Scheduled (derived) → Queue → In Progress → Done → **Failed**

Task cards show: title, agent avatar, scheduled time, status badge, **MISSED badge + count** (tooltip lists last 10 missed timestamps).
