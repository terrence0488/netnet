# Project State

## Current
Stage: Architecture (Stage 3)
Phase: n/a
Status: awaiting-approval — revised 2026-09-27 on the Founder's decisions
Next action: Founder reviews `docs/03-architecture.md` (Vercel + Neon) and `CONVENTIONS.md`, then
replies `approve architecture`. No decisions are open. After approval, a **new session** runs
Stage 4 with `continue` (`stage: plan`).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | **approved** | 2026-09-26 | Design B "Poster" (branch `claude/design-b-retro`), with PRD §9.6 revisions 12–28 and the carousel's desktop layout. A and C kept on their branches, unmerged |
| Architecture | awaiting-approval | | `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md`; no decisions open |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Stage 3 written and revised, not approved** (2026-09-27). **Founder decided:** hosting is
**Vercel Hobby + Neon Free** ($0 for the first ~70–100 users, upgrade triggers in architecture
§9.4); **only Claude and ChatGPT at launch** (Grok, Muse, "Other agent" parked; PRD §9.7 added);
Apple sign-in ships ($99/year); the Founder buys the domain. Design: one Vercel project (static
files + one Hono function in `sin1`), one Neon Postgres in Singapore (`ledger` with row-level
security, `core`, `analytics`), `withUser()` as the only way into money data. Cloudflare is kept
as Appendix A. Added on the Founder's questions: web app hosting on Vercel's CDN (§5.2) and
notifications (§7.10: email in v1, Web Push and Expo push designed in as $0 channels). Stage 4 inputs: `01-prd.md` (§6), `03-architecture.md`, `CONVENTIONS.md`. P1 must
open with the connection spike (real Claude + ChatGPT; re-check Vercel's limits, which were
sourced second-hand because vercel.com is blocked from the build environment).
