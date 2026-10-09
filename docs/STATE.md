# Project State

## Current
Stage: Build P2 (pre-QA UI fixes)
Phase: P2
Status: in-progress
Next action: `stage: test P2` (uncommitted fix on `main` working tree; commit or branch first).
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

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
Pre-QA fixes done, uncommitted: item-3 cards removed; Home desktop list-left/
position-right; filter is a draft sheet (chips, AND/OR, archived, Apply/Cancel/
Reset); holding has menu, row deltas, range bar; allocation toggles $/%. Unit
1233 + home/holding E2E 78 green; lint/typecheck clean.
Open: J4's menu "Edit" has no P2 screen (route it); Home lacks range bar,
value-asc/type sorts, one-value-each placeholder (J4, not feedback.md). F17/
F18, F16, T8 as before; test:int rotates app password (last); shell console
check fails locally w/o Postgres (same on base). QA `qa-p1-20261008@example.com`
(S$5,328) excludable, P3-only delete. Tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB.
