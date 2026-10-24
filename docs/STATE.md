# Project State

## Current
Stage: Build (P3)
Phase: P3
Status: in-progress
Next action: `stage: build P3-T10` for wave 9 (the production criterion), then `stage: test P3`.
**Branches:** waves 7–8 are merged to `main` (#95–#103) and deployed (deploy run #28).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-22 | `docs/01-prd.md` (J7, N3, M5 rewritten at P3 triage: no undo; Founder approved in chat) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-10-23 | `docs/03-architecture.md`, `CONVENTIONS.md` (re-approved at P3 triage: no undo, given rates kept, the first period's change, every schedule on GitHub Actions, error class in logs) |
| Plan | **approved** | 2026-10-23 | `docs/04-plan.md`, `docs/phases/P1/tasks/`, `docs/phases/P2/tasks/`, `docs/phases/P3/tasks/` (P3-T11 … P3-T18 added at triage) |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | **approved** | 2026-10-12 | Test report + hands-on; Account and date review fixups in (#76) |
| P3 | triage approved | 2026-10-23 | Test report: fail; every item routed (`docs/phases/P3/feedback.md`). T11–T18 to build; T10 open until production; then Stage 6 again |
| P4 | not-started | | |

## Handoff note (last session)
`stage: build P3` built, merged and deployed waves 7–8 (P3-T11 … T18, the zod audit patch);
the Founder marked T11–T18 done. Migrations 0008–0010 are on production (0009's drop of the undo
columns by the Founder's choice). The probe connection was revoked and set up again, and probe run
#69 logged `***` for the token; the old run logs stay, by the Founder's choice (sole access).
Reminders answered 200 by hand on production. T15's last box waits for the first scheduled
Reminders run (01:00, 09:00, 17:00 UTC): wave 9 checks it with T10's production criterion. Open
follow-ups are in the briefs' reports (T13 `ledger_state` key, T18 other logs). PR #88 is red;
`claude/design-*` are unmerged; P2-T8 waits on F11.
