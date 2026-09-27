# Project State

## Current
Stage: Prototype (Stage 2, re-opened) — comeback reminder and security email screens
Phase: n/a
Status: awaiting-approval — built 2026-09-27; see `docs/02-prototype/prototype-notes.md` §10
Next action: Founder reviews the prototype (sample account → Home card; Account → Notifications;
PROTO → Skip 30 days / Sent outside NetNet) and replies `approve prototype`, with answers to the
three open questions in `prototype-notes.md` §10. After approval: `continue` in a **new session**
→ `stage: architecture`: revise §7.10/§9.3 for J12 and the security email, then the Stage 3 gate.
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
| Prototype (reminder screens) | awaiting-approval | | Built 2026-09-27: Home card, Account → Notifications, lock screen / email / security email previews, PROTO "Skip 30 days". `prototype-notes.md` §10 |
| Architecture | on hold | | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; revise §7.10/§9.3 after the PRD amendment |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Reminder screens built** (Stage 2 re-opened, 2026-09-27), in design B "Poster", per PRD §9.8, J5,
J9, J12. Home: a quiet card below the Position ledger (Turn on → a dashed stand-in for the browser's
prompt → one-line on/blocked; Not now ×2). Account → Notifications replaces Reminders (master, this
device, email, other devices, and a Security row "Always"). PROTO: skip 30 days, agent check, push
fails, can/can't receive push, and "Sent outside NetNet" (lock screen, inbox, security email). New
test suite `tests/notif.mjs` (78 checks); all 24 suites clean. Open for the Founder
(`prototype-notes.md` §10): park Grok/Muse/Other in the prototype now (recommended);
`push_disabled` on deletion; keep the Security row. Architecture stays on hold until approval.
