# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: the Founder merges wave 4 (#18, then #20, and #19) and answers its questions; then
`continue` in a **new session** → `stage: build P1`, wave 5 (P1-T12, T13, T14).
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
| P1 | in-progress | | Waves 1–3 done (T1–T8) |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Wave 4 is built and in review; the three branches pass lint, typecheck and tests together. Merge #18
(T9) first: #20 (T10) is stacked on it and retargets to `main` when its branch is deleted. Reports
are in the briefs; their Status lines are the Founder's. Questions in the PRs: §7.3's `context()`
returns `ContextInput` (rewrite §7.3?); deleting a tag in use (refuse, or untag like the prototype?);
the Origin check's refusal is `401 UNAUTHENTICATED`; sign-up reveals an existing email (422); with
real pack text 8 KB fits ~12–14 holdings, not 25 (`meaning` once per type would change §7.5, so
decide before T15). Founder setup: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`,
`EMAIL_PREVIEW_ALLOW`, `PUBLIC_ORIGIN` (F10). Carried: FX backfill and `CRON_SECRET`; web `money.ts`
→ contracts' currency table and `core.fromMinor`; deletion vs insert-only analytics (P3).
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
