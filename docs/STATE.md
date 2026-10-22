# Project State

## Current
Stage: Triage (P3)
Phase: P3
Status: awaiting-approval
Next action: the Founder reviews the triage and replies `approve triage P3` (re-approves the architecture and plan rewrites); then `stage: build P3` resumes at wave 7, P3-T14 first.
**Branch:** `docs-p3-triage` (the triage pull request); `main` holds the test report and feedback (#91, #93).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-22 | `docs/01-prd.md` (J7, N3, M5 rewritten at P3 triage: no undo; Founder approved in chat) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | revised | | `docs/03-architecture.md`, `CONVENTIONS.md`. P3 triage rewrite awaiting re-approval: no undo, given rates kept, the first period's change, every schedule on GitHub Actions, error class in logs |
| Plan | revised | | `docs/04-plan.md`, `docs/phases/P1/tasks/`, `docs/phases/P2/tasks/`, `docs/phases/P3/tasks/`. P3 triage added P3-T11 … P3-T18; awaiting re-approval |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | **approved** | 2026-10-12 | Test report + hands-on; Account and date review fixups in (#76) |
| P3 | triaged | | Test report: fail. Every item routed (`docs/phases/P3/feedback.md`); T11–T18 to build; T10 open until production |
| P4 | not-started | | |

## Handoff note (last session)
`stage: triage P3` ran. Every Founder item and test-report issue has a type and route in
`docs/phases/P3/feedback.md`. The PRD's J7, N3, M5 and §3.5 lost undo (Founder approved). The
architecture and plan were rewritten in place and await re-approval. Undo is gone, Activity is
read-only, the currency change is one entry and keeps a person's own rates, the first Insights
period has no change, every schedule runs on GitHub Actions (Vercel never fired a cron), and logs
name an unexpected error's class. Briefs P3-T11 … T18. **T14 first**: the probe token in the
latest workflow logs is live, and the Founder rotates it after merge. **T15 before ~2026-11-14**,
when the first reminders fall due. T12 follows T11. Then deploy, close P3-T10 on production,
and run `stage: test P3` again. PR #88 is red; `claude/design-*` are unmerged; P2-T8 waits on F11.
