# Project State

## Current
Stage: Build (P3)
Phase: P3
Status: in-progress
Next action: the Founder merges #106 and sets P3-T10's `Status:`, then `stage: test P3` (fresh session).
**Branches:** waves 7–8 are merged to `main` (#95–#103) and deployed (deploy run #28); wave 9's report is #106 (`p3-t10`).

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
`stage: build P3-T10` ran wave 9 on `main`'s deployed code (deploy run #28): the full matrix green
(E2E 446 passed / 6 skipped at both widths), the analytics audit holding with `value_corrected`,
and production checked through Actions and the NetNet connector (`P3-T10.md`'s report). This
session's network refused `netnetapp.io`; `netnet-orcin.vercel.app` serves the same deployment.
**Stage 6 checks the Reminders schedules:** none had fired yet (first slot 09:00 UTC, 2026-10-24)
and the Founder chose not to wait. Confirm each slot (01:00, 09:00, 17:00 UTC) has a green
`schedule` run and record the first starts in `ops/probe.md`. Nobody is due before 2026-11-14.
Raised: architecture §7.10 and §9.3 say a run starts up to an hour late; here it is 2–6 hours
(behaviour unaffected; the Founder's rewrite). Follow-ups: T13 `ledger_state` key, T18 other logs.
PR #88 is red; `claude/design-*` are unmerged; P2-T8 waits on F11.
