# Project State

## Current
Stage: Build (P4)
Phase: P4
Status: in-progress
Next action: `stage: build P4-T14` after P4-T13's review is triaged (the fresh review session is running;
its findings become P4-T16 onward). T6 waits on F20.
**Branches:** one branch and one PR per task, from `main` (CONVENTIONS §15); waves 1–3 merged,
the T13 review is a docs-only branch.

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
| P3 | **approved** | 2026-10-24 | Third test run: pass, one Low and two Info (`docs/phases/P3/test-report.md`); the Reminders 17:00 and 01:00 slots' first starts are now recorded in `ops/probe.md` |
| P4 | in-progress | | Wave 1 merged 2026-10-25 (#121–#125); wave 2 merged 2026-10-26 (T3 #140, T8 #138, T9 #139, T10 #137); wave 3 merged 2026-10-26 (T7 #141, T4 #142); production deployed from `6c95647`. T2 and T6 stay open (F21, F20); T7's phone half waits on F11 |

## Handoff note (last session)
Wave 3 merged on 2026-10-26: T7 (#141, listings, registry entry, `pnpm listing:tools`, listing
screenshots; Claude's computer guide matches today's screens) and T4 (#142, the daily health check,
`cron-health.yml`, `ops/health.md`). Production was deployed from `6c95647` (deploy 40246336691,
smoke green); `/privacy` and `/terms` now answer 200 and `/` stays `noindex`.
F25 is **set**: a `test_alert` dispatch reported `opsEmailConfigured: true`. The same run fired a
real `slo_success` trigger (96.5% over 86 calls, target ≥ 99.5%) — triage before T14 calls the
scheduled run green. F11 is only half delivered: the three Claude phone screenshots are 70-byte
1×1 stand-ins, so P2-T8 and T7 stay open. P4-T13 is a fresh review session now; its report goes to
the Founder before any fix. F20, F22 and F23 remain open; T6 is blocked; no M12 spend approved;
T2 waits on F21. Renovate #128–#131, #134, #135 untouched.
