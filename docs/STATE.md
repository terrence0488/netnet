# Project State

## Current
Stage: Triage (P3)
Phase: P3
Status: approved
Next action: `stage: build P3` in a fresh session, from wave 7: P3-T14 first, then T11, T13, T15, T16, T17, T18; T12 after T11.
**Branch:** `docs-p3-triage` (PR #94, the triage), green and ready to merge before the build starts.

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
`stage: triage P3` ran, and the Founder approved it (architecture and plan re-approved; the PRD's
J7, N3, M5 rewrite was approved earlier). Undo is gone and Activity is read-only. Every Founder
item and test-report issue has a type and route in `docs/phases/P3/feedback.md`, built by briefs
P3-T11 … T18. **T14 first**: the probe token in the latest workflow logs is live; once it merges,
the Founder revokes the probe connection, re-runs `ops/probe.md`'s setup and deletes the old run
logs. **T15 before ~2026-11-14**, when the first reminders fall due. T12 follows T11. Then
deploy, close P3-T10 on production, and run `stage: test P3` again. Merge PR #94 first.
PR #88 is red; `claude/design-*` are unmerged; P2-T8 waits on F11 (non-blocking).
