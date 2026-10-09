# Project State

## Current
Stage: Build P2 (full prototype conformance sweep)
Phase: P2
Status: in-progress
Next action: review the sweep, commit + push to PR #70, merge, dispatch production.
**Branch:** `p2-feedback-fixes` (from `main`, CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-09 | `docs/01-prd.md` (J4 revised to the prototype) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-08 | `docs/04-plan.md`, `docs/phases/P1/tasks/`, `docs/phases/P2/tasks/` |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | in-progress | | T1–T6 done; T7 sweep done, prod steps open; T8 deferred |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Full P1/P2 prototype-conformance sweep done on `p2-feedback-fixes`, uncommitted:
agent tab (direct rows when empty, "What it can do" column, lowercase last
used), connect flow (tab Back skips the choice, step prompts render), approval
consent grammar, EmptyHome reuses AlternativeRoute, handoff copy/Copy fixes,
AskAgent primary connect, StaleCard→compact StaleNote with the no-data prompt,
Account sections + connected row + note + 2-col, new Archived screen + Home
list-foot link + empty-Home recovery link. Unit 1249 green; lint/typecheck
clean; E2E home 56, agent 44, holding/taxonomy/add/gallery green.
Open: commit+push+CI, then merge #70 → manual prod dispatch → smoke/probe;
J4 menu "Edit" still has no screen; baseCurrency write API still missing;
P3+ gaps recorded (Insights, Activity, reminders, settings, export, delete);
test:int rotates app password (last); shell console check + onboarding-basics
fail locally w/o Postgres (same on base). QA `qa-p1-20261008@example.com`
(S$5,328) excludable, P3-only delete. Tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB.
