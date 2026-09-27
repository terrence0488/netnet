# Project State

## Current
Stage: PRD amendment (Stage 1, re-opened) — push notifications
Phase: n/a
Status: awaiting-approval — amendment proposed 2026-09-27 (`01-prd.md` §9.8, J9, J12, M13)
Next action: Founder answers the five decisions in PRD §9.8 and replies `approve prd`. Then
`stage: prototype` (add the push screens listed in §9.8), then revise and approve the architecture
(`03-architecture.md` §7.10 and §9.3 follow the amendment). The architecture gate is on hold until then.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | **approved** | 2026-09-26 | Design B "Poster" (branch `claude/design-b-retro`), with PRD §9.6 revisions 12–28 and the carousel's desktop layout. A and C kept on their branches, unmerged |
| PRD (amendment: push) | awaiting-approval | | §9.8 + J9, J12, M13, A14; five decisions (§9.8) |
| Prototype (push screens) | not-started | | After the PRD amendment |
| Architecture | on hold | | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; revise §7.10/§9.3 after the PRD amendment |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Founder re-opened the PRD before passing the Stage 3 gate** (2026-09-27): push notifications get
a proper product treatment, then the prototype, then the architecture. Proposed in PRD §9.8: web
push for stale reminders (J9, now channel-agnostic, local 08:00–21:00) and an agent-connected
security notice; a new job J12 (ask once on Home after the first picture, iPhone Home Screen
how-to, Settings → Notifications with devices, counts-not-money, max one push a day); A14 and M13;
events renamed to `notification_sent/opened` plus push prompt events. Five decisions open (§9.8).
Architecture (Vercel + Neon, Claude + ChatGPT only) is otherwise settled; its §7.10 and §9.3
(single 09:00 SGT send) must follow the amendment. Stage 2 must add the push screens.
