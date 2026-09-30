# Project State

## Current
Stage: Planning (Stage 4)
Phase: n/a
Status: not-started — architecture approved 2026-09-29
Next action: `continue` in a **new session** → `stage: plan`. Inputs: `docs/01-prd.md` (acceptance
criteria), `docs/03-architecture.md`, `CONVENTIONS.md`. Include a **Founder setup checklist** (see
handoff) with each item placed before the task that needs it.
**Branch:** `claude/eager-heisenberg-ytll3f` holds the approved Stage 3 and the PRD amendments. It
is ready to merge into `main` (the Founder merges, or asks for a PR); until then, work from it.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | **approved** | 2026-09-26 | Design B "Poster" (branch `claude/design-b-retro`), with PRD §9.6 revisions 12–28 and the carousel's desktop layout. A and C kept on their branches, unmerged |
| PRD (amendment: comeback reminder) | **approved** | 2026-09-27 | §9.8 + J5 security email, J9, J12, M13, A14; wording option C |
| Prototype (reminder screens) | **approved** | 2026-09-27 | Home card, Account → Notifications, lock screen / email / security email previews, PROTO "Skip 30 days" (`prototype-notes.md` §10). At the gate: "Other agent" stays at launch (PRD J5, §9.7 row 29 amended; Grok, Muse parked); Security row kept; deletion fires no `push_disabled` |
| Architecture | **approved** | 2026-09-29 | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; revised 2026-09-28 for J12, the J5 security email and the launch agent list; five engineering choices accepted; with PRD J12 amended (reminder stops after three) |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Architecture approved** by the Founder, 2026-09-29, with the 2026-09-28 revision (comeback reminder,
security email, launch agents Claude/ChatGPT/"Other agent"), the five engineering choices, the
stop-after-three rule (PRD J12 amended) and the Hobby cron risk accepted. **Founder setup, for the
plan to schedule:** start now: Apple Developer Program, buy the domain. Before the P1 spike: Vercel
(Hobby, GitHub-linked), Neon (`netnet-prod` + `netnet-preview`, aws-ap-southeast-1), Claude and
ChatGPT plans that allow custom connectors, and the cloud environment's network access to Vercel and
Neon. During P1: Resend (domain DNS), Google OAuth client, Sentry, a backup key pair (public half to
GitHub). Secrets go straight into Vercel/GitHub settings, never into chat.
