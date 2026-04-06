# Remaining Unaudited Projects - Draft Verification

Date: 2026-03-28
Owner: Joe

## Purpose

Record the current state of the remaining imported projects that have not yet received a reality-audit decision.

## Verification result

All currently unaudited imported projects are still in `DRAFT` state in the control plane, and their imported `PROJECT` docs also show draft status. None of them has yet been promoted to an active or archived post-audit state.

This means the remaining unaudited set should be treated as low-confidence planning placeholders until each project receives a full reality audit.

## Remaining unaudited projects

| Slug | Control-plane status | Imported project status evidence | Latest audit |
|---|---|---|---|
| `authentik-configure` | `DRAFT` | `status: draft` | `PENDING` |
| `desktop-control` | `DRAFT` | `status: draft` | `PENDING` |
| `docker-management` | `DRAFT` | `status: draft` | `PENDING` |
| `dynamic-dns` | `DRAFT` | `status: draft` | `PENDING` |
| `external-network` | `DRAFT` | `status: draft` | `PENDING` |
| `minio-object-storage` | `DRAFT` | `status: draft` | `PENDING` |
| `openclaw-docker-node` | `DRAFT` | `status: draft` | `PENDING` |
| `openclaw-ios` | `DRAFT` | `status: draft` | `PENDING` |
| `ssh-targets-and-sudo` | `DRAFT` | frontmatter `status: draft` | `PENDING` |

## Implication for ongoing audit work

- Do not assume any of these projects are active just because they were imported.
- Do not preserve old draft claims as truth without evidence.
- Treat each one as a draft candidate that still needs a reality-audit decision: keep active, archive, or reframe.
- Until audited, their current `DRAFT` status is the correct canonical representation.

## Evidence basis

The verification was performed by checking:

1. `cpProject.status`
2. the current active imported `PROJECT` doc header/frontmatter
3. the latest `cpRealityAudit.status`

using the current Houston control-plane database in `~/projects/houston-fork`.
