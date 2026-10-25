# Project State

## Current
Stage: Plan (P4)
Phase: P4
Status: awaiting-approval
Next action: Founder reviews the P4 plan and its five decisions, then `approve plan`; after that,
`stage: build P4` (wave 1: T1, T2, T5, T11, T12).
**Branches:** P3 and P3-T22 merged to `main` (T22 in #119); the P4 plan is on
`docs/p4-plan-briefs`.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-22 | `docs/01-prd.md` (J7, N3, M5 rewritten at P3 triage: no undo; Founder approved in chat) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-10-24 | `docs/03-architecture.md`, `CONVENTIONS.md` (re-approved at P3 triage: no undo, given rates kept, the first period's change, every schedule on GitHub Actions, error class in logs; after wave 9: the schedules' real lateness, §7.10 and §9.3; after P3: each tool result's JSON as its text (§7.4), each holding's currency (§7.5)) |
| Plan | **awaiting-approval** | | `docs/04-plan.md` with P4's briefs (`docs/phases/P4/tasks/P4-T1` … `T15`). P1–P3 briefs approved 2026-10-23 (P3-T11 … P3-T18 added at triage, P3-T22 after P3's approval) |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | **approved** | 2026-10-12 | Test report + hands-on; Account and date review fixups in (#76) |
| P3 | **approved** | 2026-10-24 | Third test run: pass, one Low and two Info (`docs/phases/P3/test-report.md`); the Reminders 17:00 and 01:00 slots' first starts still to record in `ops/probe.md` |
| P4 | not-started | | Briefed; awaiting plan approval |

## Handoff note (last session)
P4 planned (`docs/04-plan.md` §P4, 15 briefs in `docs/phases/P4/tasks/`), awaiting approval.
Five decisions at the gate (plan PR): `email_verified` for M1; the health check's split
(workflow reads Neon and analytics, the function emails); the landing page in Poster's brand;
P4 drafts the privacy policy and terms; sign-up's 422 settled. On approval, T3 and T4 rewrite
PRD §3.5 and architecture §7.7, §9.3, §10 as their briefs say. New Founder items F24 (metrics
role) and F25 (`OPS_EMAIL`); F20–F23 rewritten. Carries: the Reminders 17:00/01:00 first starts
(now in P4-T14); PR #88 (deps, in P4-T13's scope); P2-T8 completes in P4-T7; T13's
`ledger_state` key in P4-T13's scope; P3's two Info notes stay as they are (plan §P4).
