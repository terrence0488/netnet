# Project State

## Current
Stage: Build (P4)
Phase: P4
Status: in-progress
Next action: `stage: build P4` (wave 3: T4, then T7; T6 waits on F20). Wave 2 is merged on a green
main. T2 stays in-progress until F21's recording replaces the placeholder.
**Branches:** one branch and one PR per task, from `main` (CONVENTIONS §15); waves 1 and 2 merged,
wave 3 branches start from `main`.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-22 | `docs/01-prd.md` (J7, N3, M5 rewritten at P3 triage: no undo; Founder approved in chat) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-10-24 | `docs/03-architecture.md`, `CONVENTIONS.md` (re-approved at P3 triage: no undo, given rates kept, the first period's change, every schedule on GitHub Actions, error class in logs; after wave 9: the schedules' real lateness, §7.10 and §9.3; after P3: each tool result's JSON as its text (§7.4), each holding's currency (§7.5)) |
| Plan | **approved** | 2026-10-25 | `docs/04-plan.md`, `docs/phases/P1/tasks/` … `docs/phases/P4/tasks/` (P3-T11 … P3-T18 added at triage, P3-T22 after P3's approval; P4 approved with its five decisions as recommended: Founder, "Merge it") |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | **approved** | 2026-10-12 | Test report + hands-on; Account and date review fixups in (#76) |
| P3 | **approved** | 2026-10-24 | Third test run: pass, one Low and two Info (`docs/phases/P3/test-report.md`); the Reminders 17:00 and 01:00 slots' first starts still to record in `ops/probe.md` |
| P4 | in-progress | | Wave 1 merged 2026-10-25 (#121–#125); wave 2 merged 2026-10-26 (T3 #140, T8 #138, T9 #139, T10 #137), main green; T2 and T6 stay open (F21, F20) |

## Handoff note (last session)
Wave 2 merged on 2026-10-26: T3 (#140, metrics and `email_verified`, full CI green after rebase),
T8 (#138, draft `/privacy` and `/terms`, F23 open), T9 (#139, M12 harness, dry run only, F22
open), T10 (#137, launch note). Main CI is green on the merged tree (40240791721).
F24 is set (metrics password, URL and exclusions); F25 could not be verified from this session;
F22, F23 and F20 are open; F11's six Claude images are present; F21 is still deferred.
Next: T4 (after T3; check F25) then T7 (after T8 and F11). T6 is blocked on F20: `content/reviews.json`
is empty. T13 and T14 follow.
Flake: `test/http/me-init.test.ts`'s two-first-confirmations case failed once under load and passed
on re-run at the same commit; T13 should check whether the `/api/me` init race is real.
T2 stays in-progress (F21); Renovate #128–#131, #134 and #135 are open and untouched.
