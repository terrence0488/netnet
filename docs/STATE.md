# Project State

## Current
Stage: Build (Stage 5)
Phase: P1
Status: not-started
Next action: `continue` in a **new session** → `stage: build P1`, wave 1 (P1-T1). Inputs: `docs/04-plan.md`
§3, `CONVENTIONS.md`, `docs/phases/P1/tasks/`. The build runs wave by wave (plan §3.4) and hands
off to a new session between waves when context runs heavy.
**Branch:** one branch per task, from `main` (CONVENTIONS §15).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-09-29 | `docs/01-prd.md` |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md`, `CONVENTIONS.md` |
| Plan | **approved** | 2026-10-01 | `docs/04-plan.md`, `docs/phases/P1/tasks/` |
| P1 | not-started | | |
| P2 | not-started | | |
| P3 | not-started | | |
| P4 | not-started | | |
| P5 | not-started | | |

## Handoff note (last session)
Plan approved: five phases; P1 is 18 briefs in seven waves (plan §3.3–3.4). Founder items done: F4
(Vercel: personal Hobby account, project `netnet` at the repo root, preset "Other", preview log-in
off), F5, F7 (Neon, Postgres 17; database passwords made with `openssl rand -hex 32`), F8. Still to
come: F6 and Renovate after T1 merges; F2 domain before wave 4 (T11 needs Resend DNS); F1 by P2;
F3 reviewers by P4. Network: Vercel and Neon hosts reach this environment, but `api.neon.tech`
answered a gateway 502 on 2026-10-01; recheck before T2 and T4. P1-T2 (the spike) needs about 45
minutes of the Founder's hands-on time and gates T11 and T13.
Plan tracker: https://claude.ai/artifact/UkJfDYaAAi8gJV1aBbk3nB. When a task's status or this file
changes, update its database with ArtifactData: `tasks/<id> {status}`, `meta/state` (this block).
