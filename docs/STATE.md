# Project State

## Current
Stage: Plan (P4)
Phase: P4
Status: approved
Next action: `stage: build P4` (wave 1: T1, T2, T5, T11, T12).
**Branches:** the P4 plan merged to `main` (#120); P4 task branches come from it
(CONVENTIONS §15).

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
| P4 | not-started | | Briefed; build next |

## Handoff note (last session)
P4 plan approved 2026-10-25 and merged (#120): 15 briefs, five waves (`docs/04-plan.md` §P4).
Its five decisions are in `decisions.md` (`email_verified` for M1; the health check's split;
the landing page in Poster's brand; P4 drafts the legal pages; sign-up's 422 settled). T2, T3
and T4 rewrite PRD §3.5 and architecture §6.4, §7.7, §9.3, §10 as their briefs say. Next:
`stage: build P4`, wave 1 (T1, T2, T5, T11, T12), one branch per task from `main`. Founder
items: F24 before T3 deploys, F25 before T4; F20 (reviewers) and F21 (recording) are the long
poles. Carries: PR #88 (deps) and `ledger_state`'s key in T13's scope; P2-T8 completes in T7;
the Reminders 17:00/01:00 first starts in T14.
