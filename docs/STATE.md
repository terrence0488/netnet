# Project State

## Current
Stage: Build (P4)
Phase: P4
Status: in-progress
Next action: merge wave 1 — #121 (T1), #123 (T5), #124 (T11), #125 (T12); give F21 for #122
(T2, in-progress). Then `stage: build P4` (wave 2: T3, T7, T8, T9, T10).
**Branches:** one branch and one PR per task, from `main` (CONVENTIONS §15); wave 1 is
`p4-t1`, `p4-t2`, `p4-t5`, `p4-t11`, `p4-t12`.

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
| P4 | in-progress | | Wave 1 PRs #121–#125; T2 waits on F21's recording; CI green on each head |

## Handoff note (last session)
Wave 1 is built and open as one PR per task: #121 T1 (done), #122 T2 (in-progress: F21's
recording is the one unmet criterion), #123 T5 (done), #124 T11 (done), #125 T12 (done). Each
task brief carries its report; the PRs carry the per-pack and push-service sources. CI is green
on each code head, and manual runs deployed and smoke-tested a preview for every branch. Founder next:
merge the four done PRs, give F21 for T2, then wave 2 (T3, T7, T8, T9, T10). F24/F25 still gate
T3/T4; F20/F22/F23 remain Founder items; T6/T15 run alongside.
