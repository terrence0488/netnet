# Project State

## Current
Stage: Architecture (Stage 3)
Phase: n/a
Status: awaiting-approval — revised 2026-09-27 on the Founder's decisions
Next action: Founder reviews `docs/03-architecture.md` (Vercel + Neon), `CONVENTIONS.md` and PRD
§9.7 (rows 29–31), then replies `approve architecture`. No decisions are open. After approval, a
**new session** runs Stage 4 with `continue` (`stage: plan`).

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
**Stage 3 written and revised, not approved** (2026-09-27). Founder decided: **Vercel Hobby + Neon
Free** ($0 for ~70–100 users; upgrade triggers, architecture §9.4); **Claude and ChatGPT only** at
launch; **web push in v1** for reminders (PRD §9.7 rows 29–31, J9); Apple sign-in; own domain.
Design: one Vercel project (web app on the CDN §5.2, one Hono function in `sin1`), one Neon Postgres
in Singapore (`ledger` behind row-level security via `withUser()`, `core`, `analytics`),
`notify()` for email + web push (§7.10). Cloudflare kept as Appendix A.
Stage 4 inputs: `01-prd.md` (§6), `03-architecture.md`, `CONVENTIONS.md`. P1 opens with the
connection spike (real Claude + ChatGPT; re-check Vercel's limits, sourced second-hand). Add a small
design task for the Reminders screen (push switch, iOS Home Screen guidance): no prototype for it.
