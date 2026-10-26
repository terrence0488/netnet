# Project State

## Current
Stage: Build (P4)
Phase: P4
Status: in-progress
Next action: build work is deployed and green; **T14 is in-progress on Founder-only boxes** — N1(a)
the outcome set, N1(b)/F24 the test account, F11 the three Claude phone screenshots, F20 the pack
reviews (T6), F22 the M12 key and spend cap, F23 the legal review, the restore drill, the Actions
budget, the launch-note paste check and the blind sheet (see `ops/launch-readiness.md`). When those
land: T6 per pack, T7's phone half, one M12 run; then the Founder starts `stage: test P4` in a
fresh session.
**Branches:** one branch and one PR per task, from `main` (CONVENTIONS §15); waves 1–3 and the
security fixes merged.

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
| P4 | in-progress | | Wave 1 (#121–#125), wave 2 (T3 #140, T8 #138, T9 #139, T10 #137), wave 3 (T7 #141, T4 #142), T13 (#143) and the security fixes (T16 #148, T17 #149, T18 #150, T19 #151, T20 #152) merged; deploy gate #145 and attribution #146 merged; production deployed from `4b85407`; main CI 40260626406 green. T14 in-progress on Founder boxes; T2 (F21), T7 (F11) and T6 (F20) stay open |

## Handoff note (last session)
Billing cleared; the fix wave landed. Merged 2026-10-26: T16 #148 (`ab35eaf`), T17 #149 (`1245ff4`),
T18 #150 (`70eb148`), T19 #151 (`816e862`), T20 #152 (`124f6f1`), the deploy gate #145 (`2917b9a`)
and attribution #146 (`4b85407`); main at `4b85407`, CI 40260626406 green.
Production was deployed from `4b85407` (40261224283): the new "Wait for main's green Checks" gate ran,
migrate/publish/deploy/smoke passed, `/`, `/privacy` and `/terms` answer 200.
Metrics dispatch 40261516486 prints every per-segment table; M10 landing visitors = 4. Health
dispatch 40261532440 exits 1 on the real `slo_success` (87 calls, 96.6%, p95 175 ms) — the three
non-ok calls are one hands-on account's `create_holding` (`LIKELY_DUPLICATE` ×2, `VALIDATION_FAILED`
×1), not service failures.
T14 stays in-progress on Founder-only boxes: N1(a) outcome set, N1(b)/F24 account, F11 phone shots,
F20 packs (T6 blocked), F22 M12, F23 legal, the restore drill, the Actions budget, the paste check and
the blind sheet. The 01:00 health schedule has not yet run since billing was restored.
T2 waits on F21; T7's phone half on F11; T6 on F20; no M12 spend; no Stage 6/8 started; no stage
approved. A local production E2E rerun could not start (Chromium 1248 absent here); CI's E2E on the
deployed commit is green.
