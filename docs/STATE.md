# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: `continue` in a **new session** → `stage: build P1`, wave 3 (P1-T6, T7, T8). Inputs:
`docs/04-plan.md` §3, `CONVENTIONS.md`, `docs/phases/P1/tasks/`. Alongside it the Founder runs the
spike test (`docs/phases/P1/spike.md` §1, on branch `spike/p1-oauth-mcp`); when the notes arrive,
`stage: build P1-T2` finishes the spike. T11 and T13 (wave 4) wait for its verdict.
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-01 | `docs/04-plan.md`, `docs/phases/P1/tasks/` |
| P1 | in-progress | | Waves 1–2 merged except T2 (waiting on the Founder) |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Wave 2: T3, T4, T5 merged (#7–#9). T2's spike is live at https://netnet-p1-spike.vercel.app; its
workflow (`spike.yml`, dispatch by API on that ref) has `report` and, at the end, `cleanup`. Raise
with the Founder before T11/T13/T15: Better Auth serves OAuth at `/api/auth/oauth2/*`, not §7.1's
`/oauth2/*`; remembered consent skips the approval page and the security email on reconnect;
calls after idle exceed §5.1's estimate; cron timing is unverifiable before production. Both Neon
projects run Postgres 18.6, so CI and the decision moved to 18. Per-PR Neon branches work.
Later: account deletion vs the insert-only analytics grant (P3 decision); Ledger.init creates
`ledger_state` (T10); `money.ts` → T6's ISO 4217 table; T18 bootstraps prod and builds as production.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB. When a task's status or this file
changes, update its database with ArtifactData: `tasks/<id> {status}`, `meta/state` (this block).
