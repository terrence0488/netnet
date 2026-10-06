# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: `continue` in a **new session** → `stage: build P1`, wave 7 (P1-T18).
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
| P1 | in-progress | | Waves 1–6 done (T1–T17) |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Wave 6 done, green and merged: #29 T15 (MCP; N1 warm p95 98 ms, post-idle 114 ms, budget
1.5 s), #30 T16 (Home/Add/holding), #31 T17 (Agent tab/connect); reports in the briefs. Merged in
order with PR CI green throughout; #31 needed a one-hunk `e2e/support.ts` resolution (main's helper
side — identical behavior) with CI re-run green before merge. F10 done on Preview (Resend test
sender; full domain setup still waits for production). Never dashboard-redeploy a preview (it drops
`DATABASE_URL`) — re-run its Preview job (plan §3.5). Finishers salvaged all three first attempts
(T15 silence, T16 crash, T17 no commit). F13/F14 done. Founder setup still: F11, `CRON_SECRET`,
the real Codex connection. Carried: FX backfill (preview seeding needed explicit `fx_rate`); deletion vs
insert-only analytics (P3); purge of unused DCR clients and sweeps of expired OAuth rows. Renovate's
#25 and #26 are open.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
