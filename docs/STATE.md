# Project State

## Current
Stage: Prototype (rework)
Phase: n/a
Status: in-progress — design A locked; two more UI design variants to build before the gate
Next action: `continue` in a new session → the Founder briefs two more UI design variants (B and C)
of the prototype. Build them, present A / B / C side by side, and stop for the Founder's choice.
Stage 2 is **not** approved; `approve prototype` comes after the choice.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | in-progress | | Design A ("Two Inks") locked 2026-09-25 at cd1513d; Founder wants two more UI variants before approving |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Design A is locked** at cd1513d: "Two Inks" (`02-prototype/design-system.md`), all Stage 2 review
changes applied (PRD §9.6 rows 12–28, AI-drafted, for the Founder to read at the gate). Don't change A
while building B and C. **Confirm the brief with the Founder first**; assumed until then: variants
change the look, not the product (flows, content rules §2.1, PRD behaviour stay). Suggested: each its own design-system
doc and stylesheet over the shared `app.js`, switchable in PROTO, so all three run the same data.
**Tests are now in the repo**: `node docs/02-prototype/tests/run.mjs` (22 suites, all clean at the
lock). Variants must pass them; only checks on the look itself may differ. Desktop layout: approved by
the Founder. Still open: Muse logo (`agents/README.md`). Never put design commentary in the prototype UI.
Stage 3 notes: PRD §9.6 item 17 (packs admin portal), free plans allow custom MCP (confirm when building).
