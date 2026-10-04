# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: **Founder:** merge #14 (T6) first, then #13 (T7), then #15 (T8, once it uses
`core.packChain`), then this file's PR. Then `continue` in a **new session** → `stage: build P1`,
wave 4 (P1-T9, T10, T11). Inputs: `docs/04-plan.md` §3, `CONVENTIONS.md`,
`docs/phases/P1/tasks/`.
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-01 | `docs/04-plan.md`, `docs/phases/P1/tasks/` |
| P1 | in-progress | | Waves 1–2 done (T1–T5 merged); wave 3 in review (#13 T7, #14 T6, #15 T8) |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Wave 3 built (reports in the briefs; Status left `todo`: auto mode would not let the build session
mark its own tasks done, so the Founder does). The Founder answered the four questions
(`docs/decisions.md`): a baseline change is per holding and summed; the calendar baselines are month
ends; one currency table, which core imports from `@netnet/contracts/currencies`; a missing session
is `UNAUTHENTICATED` 401 (§7.5, in contracts; T11 uses it). The first three are in #14. FX
unverified live: run the backfill; set `CRON_SECRET`. #15 switches to `core.packChain` once #14
merges. Carried: Ledger.init creates `ledger_state` (T10); web `money.ts` → T6's table; deletion vs
insert-only analytics (P3).
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
