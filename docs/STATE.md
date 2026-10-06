# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: Founder setup first (F12, F15, F16; still F11, F9 `CRON_SECRET`) → `continue` in a **new session** → finish T18 (first deploy + proofs), then `stage: test P1`.
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
Wave 7 code merged: #33 T18 (deploy/sentry/CSP/backup/probe; Checks + Preview green). Manager
fixed two real issues: schedules use repo-level secrets (a `production`-env reviewer would hold
every scheduled run), and `VERCEL_PREVIEW_FEEDBACK_ENABLED=0` (strict CSP blocked Vercel's
preview-only feedback.js, 16 Preview E2E red; allowlisting it would break arch §8). T18 stays
in-progress: first deploy, rollback proof, Sentry receipt, restore proof, 2 green probes and the
cron log all need F12 (domain/`PUBLIC_ORIGIN`/prod DB) + F15 (probe account/`PROBE_SECRETS_TOKEN`);
procedures and log tables are in `ops/probe.md`/`ops/backup.md`. Pre-existing flakes seen (out of
T18 scope, left for triage): `mcp/events` order (after-response inserts race; same-ms `at` ties)
and one E2E 401 on `/api/snapshot`. Founder still owes: F9 `CRON_SECRET`, F11 screenshots, F12,
F15, F16 monitor. Carried: FX backfill; deletion vs insert-only analytics (P3); DCR/expired-row
sweeps. Renovate #25 merged to main; #26 open.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
