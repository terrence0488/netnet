# Project State

## Current
Stage: Build (P3)
Phase: P3
Status: in-progress
Next action: the Founder rotates the probe token and deploys production while it is idle (below), then `stage: build P3-T10` for wave 9 (the production criterion), then `stage: test P3`.
**Branches:** waves 7–8 are merged to `main` (#95–#103).

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
`stage: build P3` built and merged waves 7–8 (P3-T11 … T18, the zod audit patch); each brief
holds its engineer's report, and the briefs' `Status:` lines are left to the Founder. Migrations
0008–0010 deploy together. 0009 drops the undo columns, which is not expand-only: the Founder chose
to drop now, so deploy while production is idle and fix forward rather than roll back. First
revoke the probe connection, re-run `ops/probe.md`'s setup and delete the old run logs that show
the token. Deploy before ~2026-11-14 (the reminder schedules), then dispatch Reminders once by hand.
Open follow-ups are in the briefs' reports (T13 `ledger_state` key, T18 other logs). PR #88 is
red; `claude/design-*` are unmerged; P2-T8 waits on F11.
