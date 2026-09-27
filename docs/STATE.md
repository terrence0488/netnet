# Project State

## Current
Stage: Architecture (Stage 3)
Phase: n/a
Status: awaiting-approval — written 2026-09-27
Next action: Founder reviews `docs/03-architecture.md` and `CONVENTIONS.md` and answers the four
decisions in §13 of the architecture, then replies `approve architecture`. After approval, a
**new session** runs Stage 4 with `continue` (`stage: plan`).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | **approved** | 2026-09-26 | Design B "Poster" (branch `claude/design-b-retro`), with PRD §9.6 revisions 12–28 and the carousel's desktop layout. A and C kept on their branches, unmerged |
| Architecture | awaiting-approval | | `docs/03-architecture.md`, `CONVENTIONS.md`; four decisions open (§13) |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Stage 3 written, not approved** (2026-09-27). Proposed: one Cloudflare Worker (Hono, TypeScript)
+ **one Ledger Durable Object per user** for all money data + D1 for identity, OAuth, content and
FX + a separate D1 for analytics; React + Vite SPA; Better Auth, with its OAuth 2.1 provider
(CIMD + DCR) for agents; stateless MCP negotiating 2026-07-28, 2025-11-25 and 2025-06-18.
The free-plan connector question (ChatGPT Free) is **parked by the Founder**; PRD not edited.
Open decisions (architecture §13): ~$6/month cost, Apple's $99/year, Grok listing,
Ledger-per-user. Stage 4 inputs: `01-prd.md` (§6 criteria), `03-architecture.md`,
`CONVENTIONS.md`. The P1 plan must open with the connection spike (§13 risks 4–5).
