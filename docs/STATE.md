# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: `continue` in a **new session** → `stage: build P1`, wave 6 (P1-T15, T16, T17).
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
| P1 | in-progress | | Waves 1–5 done (T1–T14) |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Wave 5 merged and done (#23 T12, #24 T14, #27 T13; reports in the briefs). The Founder's decisions
this wave (`docs/decisions.md`): the snapshot's ETag covers the pack chain; another country moves
the ledger (`Ledger.changeCountry`: over again while it has no holding, else the new pack's types
added); no totals-currency change in P1's onboarding (P3's settings); agents that ask for OpenID
scopes (OpenAI's Codex) connect, with no name or email released. For wave 6: P1-T15 lists `/mcp` in
`test/http/isolation.test.ts`'s route registry, calls `markAttemptLive` and `touchConnection` after a
successful tool call, and serves `/mcp` with CORS; P1-T16 sends back the snapshot's `ETag` as it came;
P1-T17 puts the approval page under `RequireSignedIn` and shows only the ledger scopes. The Founder
connects the real Codex once `/mcp` is served. Founder setup: F10 (`BETTER_AUTH_SECRET`,
`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_PREVIEW_ALLOW`, and `PUBLIC_ORIGIN`, the final domain, before
agents connect) and `CRON_SECRET` (the fx and daily crons). Carried: FX backfill; web `money.ts` →
contracts' currency table and `core.fromMinor`; deletion vs insert-only analytics (P3); the purge of
unused DCR clients and sweeps of expired OAuth rows. Renovate's #25 and #26 are open.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
