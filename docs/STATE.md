# Project State

## Current
Stage: Prototype (Stage 2, re-opened) — comeback reminder and security email screens
Phase: n/a
Status: not-started — PRD amendment approved 2026-09-27
Next action: `continue` in a **new session** → `stage: prototype`: add the screens in PRD §9.8
"Consequences downstream" to `docs/02-prototype/`. Inputs: `docs/01-prd.md` (J5 security email,
J9, J12, §9.8). Then revise the architecture (§7.10, §9.3) and bring it to the Stage 3 gate.
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
| Prototype (reminder screens) | not-started | | Next: Home card, Settings → Notifications, reminder previews, security email, PROTO "30 days away" |
| Architecture | on hold | | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; revise §7.10/§9.3 after the PRD amendment |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**PRD amendment approved** (Founder, 2026-09-27). Push is a **gentle comeback reminder**: after 30
days without checking NetNet (opening it, or the agent using it), then monthly while away; push to
devices where it is on, else email (verified only); 08:00–21:00 local. Wording (option C): "Your net
worth is due for an update." + "Just ask Claude." when an agent is connected. Asked once by a quiet
Home card after the first picture, plus Settings → Notifications (master switch, this device, email,
other devices). No iPhone Home Screen guidance. **Security email** on every agent connection, email
only, cannot be turned off (J5). Prototype next (PRD §9.8 consequences), in design B "Poster"
(`design-system.md`); then architecture §7.10/§9.3 revision and the Stage 3 gate (Vercel + Neon,
Claude + ChatGPT only, otherwise settled).
