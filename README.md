# Houston

Self-hosted mission control for [OpenClaw](https://openclaw.ai) agents. Schedule recurring tasks, dispatch instructions via the OpenClaw Gateway, and monitor runs on a Kanban board with missed-run detection and execution logs.

## Quick Start

### Prerequisites
- Docker + Docker Compose
- An OpenClaw Gateway running and accessible (default: `ws://host.docker.internal:18789`)

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
NEXTAUTH_SECRET=your-random-secret-here   # generate: openssl rand -base64 32
OPENCLAW_GATEWAY_URL=ws://host.docker.internal:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
APP_BASE_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

### 2. Start

```bash
docker compose up -d
```

This starts Postgres, the web UI, and the worker. On first boot, database migrations run automatically.

### 3. Seed initial data

```bash
docker compose run --rm web npm run db:seed
```

### 4. Log in

Open `http://localhost:3000` and sign in with:

- **Email:** `admin@houston.local`
- **Password:** `admin`

> Change the password after first login by updating the user record directly in the database, or add a change-password UI.

---

## Architecture

```
┌─────────────┐     REST API      ┌──────────────┐
│  Browser    │ ◄───────────────► │  web (Next)  │
└─────────────┘                   └──────┬───────┘
                                         │ Postgres
                                   ┌─────▼───────┐
                                   │   worker    │
                                   │  scheduler  │ ◄── cron tick (30s)
                                   │  dispatcher │ ──► OpenClaw Gateway (WS)
                                   │  events     │ ◄── gateway events
                                   │  skills     │ ──► filesystem scan
                                   └─────────────┘
```

**web** — Next.js 14 App Router serving the UI and all `/api/*` REST endpoints.

**worker** — Long-running Node.js process with four internal modules:
- **Scheduler** — ticks every 30s, enqueues dispatch jobs for due schedules via pg-boss, detects missed runs
- **Dispatcher** — assembles instructions (pre-instructions + template + override), calls the OpenClaw Gateway over WebSocket
- **Event handler** — listens for `run_started/completed/failed/log_chunk` events, updates task status and stores logs
- **Skills scanner** — scans `OPENCLAW_SKILLS_PATH` on boot and every 60s for `SKILL.md` files

## Key Concepts

**Tasks** are created at dispatch time — the board's Scheduled column is derived from schedule `next_run_at`, not pre-created Task rows.

**Missed run detection** — on each scheduler tick, Houston looks back `HOUSTON_LOOKBACK_WINDOW_HOURS` (default 48h). If an expected run has no corresponding TaskRun and `now > expected_time + HOUSTON_GRACE_WINDOW_SECONDS` (default 5 min), it's flagged as MISSED on the task card.

**Pre-instructions** are versioned. Each dispatch snapshot records the pre-instructions version used.

---

## Development

### Requirements
- Node.js 20+
- Docker (for Postgres)

### Setup

```bash
# Start Postgres
docker compose up -d postgres

# Install dependencies
npm install

# Generate Prisma client + run migrations
npm run db:migrate

# Seed the database
npm run db:seed

# Start everything in dev mode
npm run dev
```

Dev server runs at `http://localhost:3000`.

### Running tests

```bash
# Unit + integration tests (all packages)
DATABASE_URL=postgres://houston:houston@localhost:5434/houston npm run test

# E2E tests (requires dev server running on port 3002)
DATABASE_URL=... NEXTAUTH_URL=http://localhost:3002 NEXTAUTH_SECRET=any-secret \
  PORT=3002 npx next dev -p 3002 &

PLAYWRIGHT_BASE_URL=http://localhost:3002 PLAYWRIGHT_NO_SERVER=true \
  npx playwright test
```

### Project structure

```
houston/
├── packages/
│   ├── shared/          # Prisma schema, DB client, shared types
│   ├── web/             # Next.js app (UI + API routes)
│   └── worker/          # Scheduler, dispatcher, gateway client, skills scanner
├── docker-compose.yml
└── .env.example
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string |
| `NEXTAUTH_URL` | `http://localhost:3000` | Public URL of the web app |
| `NEXTAUTH_SECRET` | — | Secret for signing JWTs (required) |
| `APP_BASE_URL` | `http://localhost:3000` | Used in links/redirects |
| `OPENCLAW_GATEWAY_URL` | `ws://host.docker.internal:18789` | OpenClaw Gateway WebSocket URL |
| `OPENCLAW_GATEWAY_TOKEN` | — | Gateway auth token |
| `OPENCLAW_SKILLS_PATH` | `/home/openclaw/.openclaw/workspace/skills` | Path to skills directory |
| `DEFAULT_TIMEZONE` | `America/Los_Angeles` | Default timezone for schedules |
| `HOUSTON_SCHEDULER_TICK_SECONDS` | `30` | How often the scheduler ticks |
| `HOUSTON_GRACE_WINDOW_SECONDS` | `300` | Grace period before flagging a missed run |
| `HOUSTON_LOOKBACK_WINDOW_HOURS` | `48` | How far back to check for missed runs |
| `HOUSTON_DISPATCH_CONCURRENCY` | `5` | Max concurrent dispatch jobs |
| `MAX_LOG_BYTES` | `10485760` (10MB) | Max log storage per task run |
