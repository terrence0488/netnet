# Project State

## Current
Stage: P1 approved (Stage 6 gate passed)
Phase: P1
Status: approved
Next action: `stage: plan` (P2 task briefs; later phases stay outlines).
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-01 | `docs/04-plan.md`, `docs/phases/P1/tasks/` |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
P1 tested green: unit 1098, integration 562 (RLS/isolation), e2e 170 (4 intentional
skips), typecheck, content, prod smoke, 6 straight green probes; live prod pass
(signup→holdings→snapshot + negatives) per PRD. Report: `docs/phases/P1/test-report.md`.
QA account in prod: `qa-p1-20261008@example.com`, 2 fictional holdings (S$5,328) —
exclude from metrics, deletable only in P3. Triage candidates: test:int rotates the
shared cluster's app password (run it last); lint ignores miss `.pnpm-store/` +
`.claude/settings.local.json`. Oct 8 scheduled backup failed on the billing block
(external, settled; manual backup same day exists). F11 half shipped: 3 Claude computer
shots live via PR #61; deploy initially failed on a dead probe token family (cause
unknown — no runs in between), recovered per ops/probe.md (new client + secrets, probe
green), Vercel auto-assign re-enabled after the rollback pin, redeploy green with shots
verified live. Still open: 3 Claude phone shots, F16 monitor, inbox delivery of both
emails, Ubuntu 26 runner migration Oct 19 (CI floats on `ubuntu-latest`). Founder approved P1 Oct 8 with no
triage items; phone shots and F16 ride along as follow-ups.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB (`tasks/<id>`, `meta/state`).
