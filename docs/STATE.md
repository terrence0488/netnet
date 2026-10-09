# Project State

## Current
Stage: Build P2 (pre-QA UI fixes)
Phase: P2
Status: in-progress
Next action: new session fixes the UI drift in `docs/phases/P2/feedback.md`, then `stage: test P2`.
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-08 | `docs/04-plan.md`, `docs/phases/P1/tasks/`, `docs/phases/P2/tasks/` |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | in-progress | | T1–T6 done; T7 sweep done, prod steps open; T8 deferred |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Build P2 done: T1–T7 merged (#63–#69) and T7 closed — deploy green on `main`,
smoke + dispatched probe green on prod (see T7 report). Founder then filed
pre-QA UI drift: production diverges from the high-fidelity prototype (Home
desktop layout, filter, holding page bar chart and menu placement). Next: a new
session fixes `docs/phases/P2/feedback.md` first, then `stage: test P2`.
Open: F17/F18 secrets → real Google/Apple sign-in is a Stage-6 manual check; T8 waits
for the 3 phone shots; F16 monitor + inbox delivery of both emails ride Stage 6.
Watch: Ubuntu 26 runner migration Oct 19; test:int rotates the shared app password
(run it last). QA account in prod: `qa-p1-20261008@example.com`, 2 fictional
holdings (S$5,328) — exclude from metrics, deletable only in P3.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
