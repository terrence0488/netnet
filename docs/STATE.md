# Project State

## Current
Stage: Architecture (Stage 3) — revision after the reminder amendment
Phase: n/a
Status: not-started — prototype (reminder screens) approved 2026-09-27
Next action: `continue` in a **new session** → `stage: architecture`: revise `docs/03-architecture.md`
§7.10/§9.3 for J12 (comeback reminder: `last_checked_at`, the 30-day job in daytime bands, push first
with email fallback, the device list, the events) and the J5 security email (sent at once, email
only); drop the scheduled stale-holding email; correct the launch agent list (§ near line 67: Claude,
ChatGPT **and "Other agent"**; Grok and Muse parked). Inputs: `docs/01-prd.md` (J5, J9, J12, §3.5,
§9.7, §9.8), `docs/02-prototype/prototype-notes.md` §10, `docs/03-architecture.md`, `CONVENTIONS.md`.
Then the Stage 3 gate.
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
| Architecture | not-started (revision) | | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; revise §7.10/§9.3 for J12 and the security email, and the launch agent list, then the gate |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Prototype (reminder screens) approved** by the Founder, 2026-09-27. Built per PRD §9.8, J5, J9,
J12 in design B "Poster": Home's one-time push card, Account → Notifications (master, this device,
email, other devices, Security "Always"), and PROTO previews of the push, the reminder email and the
security email (`prototype-notes.md` §10). At the gate the Founder kept **"Other agent" at launch**
(Claude, ChatGPT, Other; Grok and Muse parked), which amended PRD J5 and §9.7 row 29, and settled
that account deletion fires no `push_disabled` (J12). The prototype matches: Grok and Muse are
`parked` in `connectors.js`. All 24 test suites clean. `03-architecture.md` still says "Claude and
ChatGPT only" and still describes the stale-holding email: both are the next session's to revise.
