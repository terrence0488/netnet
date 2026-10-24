# Project State

## Current
Stage: Test (P3)
Phase: P3
Status: awaiting-approval
Next action: the Founder reviews `docs/phases/P3/test-report.md` and uses the product hands-on, then approves P3 or gives feedback for `stage: triage P3`.
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
| P3 | triage approved | 2026-10-24 | First run: fail, every item routed and T11–T18 built. Re-test: pass, issues 1–3 routed to T19–T21 (`docs/phases/P3/feedback.md`). Third run: pass, one Low and two Info (`docs/phases/P3/test-report.md`); the Reminders 17:00 and 01:00 slots still to start (T10's open box) |
| P4 | not-started | | |

## Handoff note (last session)
`stage: test P3` (third run) on `main` at `4e0a4ff`, production `67db806`: **pass**. T19, T20 and
T21 hold: Activity reads type labels and screen dates, Insights' average has the amount's sign
(−$140, −1.6%), a sign-out logs nothing and failure logs carry `errorName`. Gates green: unit
1545, integration 750, E2E 456 (0 failed, 4 one-width skips), lint, typecheck, audit. New: Low,
an MCP error message says `holdingId` for `holding_id`; Info, two types read "Loan" after SG→GB;
Info, a carried zero month reads "—" in Insights and "$0" on the holding chart. Open: the
Reminders 17:00 and 01:00 slots had not started by 19:05 UTC (FX's 17:00 slot neither); their
first starts go in `ops/probe.md` (report's check 1). PR #88 is red; `claude/design-*` are
unmerged; P2-T8 waits on F11. Follow-up: T13 `ledger_state` key.
