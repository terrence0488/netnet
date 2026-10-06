# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: Founder: 6 Claude screenshots (or say placeholders) → `continue` → first deploy + F15 walkthrough, then `stage: test P1`.
Inputs: `docs/04-plan.md` §3, `CONVENTIONS.md`, `docs/phases/P1/tasks/`.
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-01 | `docs/04-plan.md`, `docs/phases/P1/tasks/` |
| P1 | in-progress | | Waves 1–7 code merged (T1–T18); T18 proofs need production |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Domain is netnetapp.io (apex canonical, `PUBLIC_ORIGIN` set, `DATABASE_URL` repo secret moved).
Deploy prep fixes merged green: #34 (prod secret name, `Production` env case), #35 (strict image
check skips unlisted guides + test), #36 (deploy gate is manual dispatch — required reviewers need
a paid plan for a private repo; recorded in decisions.md). T18 in-progress: first deploy blocked
only on F11 Claude screenshots (6 exact names in `content/images/connect/`) or a Founder call for
1px placeholders; then F15's 8 steps from `ops/probe.md` (probe account + `PROBE_*` secrets).
Pre-existing flakes left for triage: `mcp/events` order race, one E2E 401 on `/api/snapshot`.
Founder still owes: F11 (or placeholders call), F15 walkthrough, F16 monitor. Carried: FX
backfill; deletion vs insert-only analytics (P3); DCR/expired-row sweeps. Renovate #26 open.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
