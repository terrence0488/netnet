# Project State

## Current
Stage: Build (P4)
Phase: P4
Status: in-progress
Next action: `stage: build P4` (wave 2: T3, T7, T8, T9, T10). F21 (T2's recording) is still
outstanding; T2 stays in-progress. GitHub Actions is healthy again and main's CI is green.
**Branches:** one branch and one PR per task, from `main` (CONVENTIONS §15); wave 1 merged
(#121–#125), wave 2 branches start from `main`.

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
| P4 | in-progress | | Wave 1 merged 2026-10-25 (#121–#125); T2 stays in-progress on F21's recording; #88 deps merged; wave 2 next |

## Handoff note (last session)
Wave 1 merged to `main` on 2026-10-25: T1 (#121), T2 (#122), T5 (#123), T11 (#124), T12 (#125);
T12's read-tool follow-up #127 and the Renovate dependency PR #88 are merged too. T2 is
in-progress: the page and `landing_view` are in the tree, but F21's recording is missing, so its
last done criterion is open; `p4-t2-recording` adds it. Main CI is green after the Actions billing
fix. Wave 2 starts from `main`: T3, T7, T8, T9, T10. F21/F24/F25 still gate T2–T4; F20/F22/F23
remain; T6/T15 run alongside. Renovate has #128–#131 open (major bumps), untouched.
