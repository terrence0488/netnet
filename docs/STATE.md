# Project State

## Current
Stage: Triage (P3)
Phase: P3
Status: approved
Next action: `stage: build P3` (fresh session), wave 10: P3-T19, T20 and T21, in parallel. Then deploy, close P3-T10 on production, and `stage: test P3` again.
**Branch:** `docs-p3-retest-triage` (the triage pull request, #110; the Founder merges it before the build). Waves 7–8 are merged to `main` (#95–#103) and deployed (deploy run #28); the re-test's report is merged (#108, #109).

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
| P3 | triage approved | 2026-10-24 | First run: fail, every item routed and T11–T18 built. Re-test: pass, issues 1–3 routed to T19–T21 (`docs/phases/P3/feedback.md`). T10 open until production; then Stage 6 again |
| P4 | not-started | | |

## Handoff note (last session)
`stage: triage P3` ran on the re-test's report, and the Founder approved it. `feedback.md` routes:
issue 1 to **P3-T19** (Activity names types by the current pack's label, and the screen shows a
value's date like its other dates), issue 2 to **P3-T20** (the average's percent is the mean change
over the opening total, and a ranged view counts its oldest period: both Founder-confirmed), and
issue 3 to **P3-T21** (every failure log carries its error's class per architecture §10; then the
sign-out's after-response failure is fixed). Issue 4 meets its criterion and was not raised. No PRD
or architecture change. The plan adds wave 10. Then deploy, close P3-T10 on production (the
Reminders schedule's first starts go into `ops/probe.md`), and run `stage: test P3` again.
PR #88 is red; `claude/design-*` are unmerged; P2-T8 waits on F11. Follow-up: T13 `ledger_state` key.
