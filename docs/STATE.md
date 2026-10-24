# Project State

## Current
Stage: Build (P3)
Phase: P3
Status: in-progress
Next action: `stage: test P3` in a fresh session, once `ops/probe.md` holds the Reminders 17:00 and 01:00 slots' first starts (P3-T10's open issue).
**Branches:** waves 7–8 and 10 are merged to `main` and deployed (deploy runs #28 and #29).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-22 | `docs/01-prd.md` (J7, N3, M5 rewritten at P3 triage: no undo; Founder approved in chat) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-10-24 | `docs/03-architecture.md`, `CONVENTIONS.md` (re-approved at P3 triage: no undo, given rates kept, the first period's change, every schedule on GitHub Actions, error class in logs; after wave 9: the schedules' real lateness, §7.10 and §9.3) |
| Plan | **approved** | 2026-10-23 | `docs/04-plan.md`, `docs/phases/P1/tasks/`, `docs/phases/P2/tasks/`, `docs/phases/P3/tasks/` (P3-T11 … P3-T18 added at triage) |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | **approved** | 2026-10-12 | Test report + hands-on; Account and date review fixups in (#76) |
| P3 | triage approved | 2026-10-24 | First run: fail, every item routed and T11–T18 built. Re-test: pass, issues 1–3 routed to T19–T21 (`docs/phases/P3/feedback.md`). T10 verified on production (#29) but for two Reminders slots; then Stage 6 again |
| P4 | not-started | | |

## Handoff note (last session)
`stage: build P3-T10` verified wave 10 on production: deploy run #29 (`67db806`) green with smoke,
and CI green in every lane on `15478b3`, the last code merge. T19: `list_activity` names types by
label on production, and the live bundle carries T19's date reading and T20's average. T21's log
lines need Vercel's dashboard (Stage 6 check 11). Reminders: the 09:00 slot's first scheduled run
started 13:03 UTC on 2026-10-24, green, counts only, all zero. The 17:00 and 01:00 slots had not
started by 18:05 UTC, so T10's production box stays open for them (`ops/probe.md`, T10's Open
issues). The first production sends fall due 2026-11-14. No code changed. PR #88 is red;
`claude/design-*` are unmerged; P2-T8 waits on F11. Follow-up: T13 `ledger_state` key.
