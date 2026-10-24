# Project State

## Current
Stage: Build (P3)
Phase: P3
Status: in-progress
Next action: the Founder merges wave 10 (#111–#113) and the production workflow deploys; then `stage: build P3-T10` for its production criterion, then `stage: test P3` in a fresh session.
**Branches:** wave 10 is in review: `p3-t19` (#112), `p3-t20` (#111), `p3-t21` (#113). Waves 7–8 are merged to `main` (#95–#103) and deployed (deploy run #28).

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
`stage: build P3` built wave 10; each brief holds its engineer's report, and the `Status:` lines
are left to the Founder. **T19:** Activity names types by the current pack's label, and the screen
reads value dates with `formatDate`. **T20:** the average's percent is the mean change over the
opening total, and a ranged view counts its oldest period. **T21:** every failure log carries its
error's class; the sign-out's failure was `sessionFromCookie` copying Better Auth's cookie-clearing
headers onto a finalized response (P3-T13's lead), so a read after the response now never refreshes
or writes. No migration. Follow-ups: one core helper could replace T19's two type-snapshot readers;
the prototype's `renderInsights` still averages percents. After the deploy, P3-T10 reads the
Reminders schedule's first starts into `ops/probe.md`. PR #88 is red; `claude/design-*` are
unmerged; P2-T8 waits on F11. Follow-up: T13 `ledger_state` key.
