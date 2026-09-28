# Project State

## Current
Stage: Architecture (Stage 3) — revision after the reminder amendment
Phase: n/a
Status: awaiting-approval — revision written 2026-09-28
Next action: the Founder reviews `docs/03-architecture.md` (§7.10, §9.3, §3, and the five choices
under §13 "Decisions") and `CONVENTIONS.md`, then replies `approve architecture`. After that, in a
**new session**: `stage: plan`.
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
**Architecture revised** (2026-09-28) for PRD §9.8. New `core.reminder_state` (replaces
`notification_pref` and `ledger_state`'s reminder columns). Checking = a session-authenticated
`/api/*` request or an MCP `tools/call`, written at most once a day. `/api/cron/reminders` runs at
01:00, 09:00 and 17:00 UTC and sends only in local 08:00–21:00: push first, email fallback,
atomic claim. The security email is sent at once on Allow, with retry. The launch list is Claude,
ChatGPT and "Other agent", with connections classified by host. The events are renamed per PRD
§3.5. The stale-holding email is gone. Also fixed a missing "§6" heading and a duplicated "§8"
heading. Five engineering choices await the Founder at the gate (§13 "Decisions"). `CONVENTIONS.md`
has matching test rows. The branch merges to `main` once approved.
