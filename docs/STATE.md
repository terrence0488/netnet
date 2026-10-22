# Project State

## Current
Stage: Build (P3)
Phase: P3
Status: in-progress
Next action: `stage: test P3` in a fresh session.
**Branch:** `main` current (P3 stack #77–#87 merged, branches deleted).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-09 | `docs/01-prd.md` (J4 revised to the prototype) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-13 | `docs/04-plan.md`, `docs/phases/P1/tasks/`, `docs/phases/P2/tasks/`, `docs/phases/P3/tasks/` |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | **approved** | 2026-10-12 | Test report + hands-on; Account and date review fixups in (#76) |
| P3 | built | | Merged and deployed to production; awaiting `stage: test P3` |
| P4 | not-started | | |

## Handoff note (last session)
P3 stack merged to `main` (#77–#87); F19 prod secrets are set and the production
deploy (workflow run #27, from `82f7763`) succeeded. Open before or during
`stage: test P3` (its manual checks are in the T10 brief report):
- MCP probe (probe.yml) and Daily backup (backup.yml) began failing on 2026-10-22,
  each within ~2 s and with no step logs, after weeks green. Likely a secret changed
  with F19; read the failed run's error first, then `pnpm smoke --origin <prod>`.
- CI on `main` is red only at "Audit production dependencies" (high/critical advisory).
- `renovate/minor-and-patch-updates` (PR #88) is red; `claude/design-a-two-inks` and
  `claude/design-c-soft` are unmerged prototype explorations (Home carousel).
- P2-T8 still waits on F11 phone shots (non-blocking).
