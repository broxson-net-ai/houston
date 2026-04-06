# Project Ingestion Runbook

## Purpose

This runbook covers the one-time ingestion of project artifacts from the retired project directory into Houston's project control plane before the retired system is purged.

## Scope

The ingestion flow imports project documents from the configured project root into canonical control-plane records.

Imported artifacts:

- `PROJECT.md`
- `ACTION_PLAN.md`
- `NOTES.md`

Imported defaults:

- project status -> `DRAFT`
- trust mode -> `STRICT`
- doc mode -> `MANAGED`

## Script

Use:

```bash
npm run projects:ingest
```

Optional source override:

```bash
OPENCLAW_PROJECTS_DIR=/path/to/projects npm run projects:ingest
```

The script lives at `scripts/import-projects-into-control-plane.mjs`.

## What The Script Does

For each project directory containing at least one recognized project doc:

1. derives the slug from the directory name
2. derives the title from the first markdown heading in `PROJECT.md`, if present
3. creates or updates the canonical project row
4. creates or updates canonical project docs in the control plane
5. prints a JSON summary of imported projects

## Recommended Procedure

1. Ensure the database is reachable.
2. Run `npm run db:generate` if schema/client changes were made recently.
3. Run `npm run projects:ingest`.
4. Review imported projects in `/projects`.
5. Run a reality audit on imported projects before generating work items.
6. Once satisfied, purge the retired project/task artifacts.

## Notes

- The script is idempotent for existing slugs.
- Imported docs update canonical content if the source markdown changed.
- The ingestion step does not import retired task rows.
- Work-item generation should happen from audits and planning, not from retired task data.

## Recovery Mode (After Control-Plane Drift)

If control-plane projects were imported as bare skeletons and lost historical context, use:

```bash
npm run projects:recover
```

Apply mode:

```bash
npm run projects:recover -- --apply
```

The recovery script (`scripts/recover-control-plane-from-markdown.mjs`):

1. pulls current projects from Houston API
2. reads high-level project purpose from `memory/projects/PROJECTS.md`
3. merges context from:
   - local markdown under `memory/projects/<slug>`
   - latest export snapshot under `~/openclaw-exports/projects`
   - state docs under `workspace/state`
   - historical session logs (`~/session-ses_2d06.md`, `~/session-ses_2d2f.md`)
4. upserts richer control-plane docs (`PROJECT`, `ACTION_PLAN`, `NOTES`, `STATUS`, `DECISIONS`)
5. reconstructs active-project work items from checklist/session signals
6. writes a JSON recovery report to `workspace/state/HOUSTON_MD_RECOVERY_REPORT_*.json`

Safety defaults:

- dry-run by default
- skips invalid slug records (`slug = "0"`)
- only creates recovered work items for ACTIVE projects with non-export signals
