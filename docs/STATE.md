# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: in-progress
Next action: merge P1-T1 into `main` (branch `claude/affectionate-hamilton-kkgrla`), then `continue`
in a **new session** → `stage: build P1`, wave 2 (P1-T2, T3, T4, T5). Inputs: `docs/04-plan.md` §3,
`CONVENTIONS.md`, `docs/phases/P1/tasks/`. The build runs wave by wave (plan §3.4).
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-01 | `docs/04-plan.md`, `docs/phases/P1/tasks/` |
| P1 | in-progress | | Wave 1 (T1) done |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Wave 1 done: P1-T1 (report in its brief). The workspace, root scripts (CLAUDE.md → Commands), CI
and per-PR previews work; CI run 36835613408 deployed and smoke-tested a preview. The function is
the API bundled by esbuild, re-exported by `api/index.ts`: new server dependencies must bundle
(mark native-only optional modules external). Previews deploy only for a branch with an open pull
request, or a manual run of CI. CI reads the Vercel owner from the project; `VERCEL_ORG_ID` is
unused. Founder: F6 (protect `main`, Renovate) once T1 merges; F2 before wave 4. Recheck
`api.neon.tech` before T2 and T4. TypeScript stays on 6.0 until typescript-eslint supports 7.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB. When a task's status or this file
changes, update its database with ArtifactData: `tasks/<id> {status}`, `meta/state` (this block).
