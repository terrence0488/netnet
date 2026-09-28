# Project State

## Current
Stage: Architecture (Stage 3) — revision after the reminder amendment
Phase: n/a
Status: awaiting-approval — revision written 2026-09-28
Next action: the Founder replies `approve architecture` (the five choices and the stop-after-3 rule
are already accepted, 2026-09-28). After that, in a **new session**: `stage: plan`.
**Branch:** work from `claude/eager-heisenberg-ytll3f` (not `main`); it holds Stage 3 and the PRD
amendment. It merges into `main` once the architecture is approved.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | **approved** | 2026-09-26 | Design B "Poster" (branch `claude/design-b-retro`), with PRD §9.6 revisions 12–28 and the carousel's desktop layout. A and C kept on their branches, unmerged |
| PRD (amendment: comeback reminder) | **approved** | 2026-09-27 | §9.8 + J5 security email, J9, J12, M13, A14; wording option C |
| Prototype (reminder screens) | **approved** | 2026-09-27 | Home card, Account → Notifications, lock screen / email / security email previews, PROTO "Skip 30 days" (`prototype-notes.md` §10). At the gate: "Other agent" stays at launch (PRD J5, §9.7 row 29 amended; Grok, Muse parked); Security row kept; deletion fires no `push_disabled` |
| Architecture | awaiting-approval | | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; revised 2026-09-28 for J12, the J5 security email and the launch agent list |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Architecture revised** (2026-09-28) for PRD §9.8: `core.reminder_state`; checking = a session
`/api/*` request or an MCP `tools/call`; `/api/cron/reminders` at 01:00/09:00/17:00 UTC, sending only
in local 08:00–21:00; push first, email fallback; security email at once on Allow, with retry;
launch list Claude, ChatGPT, "Other agent". At the gate the Founder accepted all five engineering
choices and the unverified Hobby cron limits, and decided the reminder **stops after three per
absence** (PRD J12, §9.7 row 31, §9.8 amended; architecture §7.10). `CONVENTIONS.md` §15 cleaned of
Cloudflare leftovers. The approved prototype still sends past three (noted, not rebuilt). Awaiting
`approve architecture`; the branch merges to `main` once approved.
