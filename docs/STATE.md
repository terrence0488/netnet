# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: `continue` in a **new session** → `stage: build P1`, wave 3 (P1-T6, T7, T8). Inputs:
`docs/04-plan.md` §3, `CONVENTIONS.md`, `docs/phases/P1/tasks/`. The spike's verdict
(`docs/phases/P1/spike.md` §5) is in, so wave 4 (T11, T13, T15) has nothing left to wait for.
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-01 | `docs/04-plan.md`, `docs/phases/P1/tasks/` |
| P1 | in-progress | | Waves 1–2 done (T1, T3, T4, T5 merged; T2's write-up in its PR) |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
T2 done: the architecture holds for Claude (computer and phone, CIMD, protocol 2026-07-28). The
Founder settled the spike's deviations (`docs/decisions.md`): ChatGPT unlisted until OpenAI's
directory (P1 offers Claude and Other agent); OAuth at the library's `/api/auth/oauth2/*` and
`/api/auth/jwks`; remembered consent off; the first call after idle (~1 s server-side) accepted;
cron timing checked in T18. T13's brief carries the rest (JSON redirect → 302, browser E2E, client
ids). The spike server and its Neon branch are deleted; `spike/p1-oauth-mcp` stays unmerged. Both
Neon projects run Postgres 18.6. Per-PR Neon branches work.
Later: account deletion vs the insert-only analytics grant (P3 decision); Ledger.init creates
`ledger_state` (T10); `money.ts` → T6's ISO 4217 table; T18 bootstraps prod and builds as production.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB. When a task's status or this file
changes, update its database with ArtifactData: `tasks/<id> {status}`, `meta/state` (this block).
