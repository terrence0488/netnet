# Project State

## Current
Stage: P3
Phase: P3
Status: approved
Next action: `stage: plan` (P4 task briefs).
**Branches:** P3 is merged to `main` and deployed (deploy run #29).

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
| P3 | **approved** | 2026-10-24 | Third test run: pass, one Low and two Info (`docs/phases/P3/test-report.md`); the Reminders 17:00 and 01:00 slots' first starts still to record in `ops/probe.md` |
| P4 | not-started | | |

## Handoff note (last session)
P3 approved 2026-10-24 on the third Stage 6 run (pass, `main` at `4e0a4ff`, production `67db806`).
Carry into P4 planning: the Low issue (an MCP error message says `holdingId` for `holding_id`)
and the two Info (two types read "Loan" after SG→GB; a carried zero month reads "—" in Insights
and "$0" on the holding chart), none routed yet. The Reminders 17:00 and 01:00 slots had not
started by 19:05 UTC; record their first starts in `ops/probe.md` when they land. The Founder's
manual checks are in the test report. PR #88 is red; `claude/design-*` are unmerged; P2-T8
waits on F11. Follow-up: T13 `ledger_state` key. Founder-reported bug fixed on `mcp-text-figures`:
tool text is now the JSON of `structuredContent` (Claude saw counts, no figures); §7.4 rewritten.
