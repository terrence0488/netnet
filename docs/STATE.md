# Project State

## Current
Stage: Build P2 (waves 1–3)
Phase: P2
Status: in-progress
Next action: run the production workflow, then `stage: test P2` (fresh session).
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
Build P2 waves 1–3 ran unattended: 7 PRs merged (#63–#69, T1–T7 code), all CI green;
T7's preview verified end to end (smoke + deployment-safe E2E). Manager fixes: T5/T2
ConnectEntry union, chart date-axis clip (333px→contained at 320 narrow). T7 stays
in-progress: run the production workflow, then smoke + probe on prod, then Stage 6.
Open: F17/F18 secrets → real Google/Apple sign-in is a Stage-6 manual check; T8 waits
for the 3 phone shots; F16 monitor + inbox delivery of both emails ride Stage 6.
Watch: Ubuntu 26 runner migration Oct 19; test:int rotates the shared app password
(run it last). QA account in prod: `qa-p1-20261008@example.com`, 2 fictional
holdings (S$5,328) — exclude from metrics, deletable only in P3.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
