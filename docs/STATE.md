# Project State

## Current
Stage: Build P2 (prod review follow-ups)
Phase: P2
Status: in-progress
Next action: Founder reviews the follow-up fixes in production, then stage: test P2.
**Branch:** `p2-home-sheet-fixes` (from `main`, CONVENTIONS §15).

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
PR #73 merged and deployed to production (deploy + smoke green): the Founder's
two prod-review fixes, the stale note stacked directly beneath the position and
sheet initial focus on the title instead of Cancel (kills the iOS ring).
Unit 1250 green; full CI (E2E + integration) green.
Open: J4 menu "Edit" still has no screen; baseCurrency write API still missing;
P3+ gaps recorded (Insights, Activity, reminders, settings, export, delete);
test:int rotates app password (last); onboarding-basics/shell need Postgres
locally (CI is the source of truth). QA `qa-p1-20261008@example.com`
(S$5,328) excludable, P3-only delete. Tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB.
