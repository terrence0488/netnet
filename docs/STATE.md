# Project State

## Current
Stage: PRD amendment (Stage 1, re-opened) — gentle comeback reminder (web push + email)
Phase: n/a
Status: awaiting-approval — rewritten 2026-09-27 with the Founder's decisions (`01-prd.md` §9.8, J9, J12, M13)
Next action: Founder replies `approve prd`. Then `stage: prototype` (the push screens listed in
§9.8), then revise and approve the architecture (`03-architecture.md` §7.10 and §9.3 follow the
amendment). The architecture gate is on hold until then.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | **approved** | 2026-09-26 | Design B "Poster" (branch `claude/design-b-retro`), with PRD §9.6 revisions 12–28 and the carousel's desktop layout. A and C kept on their branches, unmerged |
| PRD (amendment: comeback reminder) | awaiting-approval | | §9.8 + J9, J12, M13, A14; Founder's decisions written in |
| Prototype (push screens) | not-started | | After the PRD amendment |
| Architecture | on hold | | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; revise §7.10/§9.3 after the PRD amendment |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Founder re-opened the PRD before the Stage 3 gate** (2026-09-27) and set push's objective: a
**gentle comeback reminder**, not a nag about updates. PRD §9.8/J12 (rewritten): after 30 days
without checking NetNet (opening it, or the agent using it), then monthly while away; push to devices
where it is on, else email (verified only); daytime local; never amounts or names. Asked once by a
Home card after the first picture, plus Settings → Notifications (master switch, this device, email,
other devices). No iPhone Home Screen guidance; no security notice in v1; J9's scheduled stale email
is gone (J9 keeps in-app labels). Events: `reminder_sent/opened {channel}`, push prompt events.
Next: `approve prd` → prototype push screens (card, settings, lock-screen/inbox previews, PROTO
"30 days away") → architecture §7.10/§9.3 revision → Stage 3 gate. Vercel + Neon otherwise settled.
