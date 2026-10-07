# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: F15 walkthrough underway (Founder on step 1: probe signup) → probe twice green → Sentry receipt, first backup + restore, cron log → mark T18 done → `stage: test P1`.
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
Production is LIVE at netnetapp.io (first deploy green, verified: health/metadata/MCP-401/app/
holding page/headers). Rollback proved via API (dpl_2HsY → dpl_128z, ~26s, alias-observed);
CLI rollback+promote both 404 here; a rollback pins production (auto-assign off) — #48 makes
deploys verify the alias moved. Merged green since: #37 placeholders, #38 Vercel env, #39 events-order flake, #40 prod build
target, #41 smoke empty-secrets, #42–43 promote/scope probes, #44 agent snapshot stub, #45 API
rollback, #46 client-side filter, #47 alias truth, #48 moved-check. F15 walkthrough underway (step 1 with Founder: probe signup). Still open: probe twice
green, Sentry receipt both sides, first backup (02:30 UTC) + restore proof, cron timing log,
real F11 screenshots, F16 monitor, me-init concurrency flake (seen once, passed on re-run).
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
