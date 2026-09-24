# Project State

## Current
Stage: Prototype (rework)
Phase: n/a
Status: awaiting-approval
Next action: Founder reviews `docs/02-prototype/` (ideally tests it with 3–5 people across P-A/B/C,
script in `prototype-notes.md` §9) and replies `approve prototype` — or gives feedback. Answers to
`prototype-notes.md` §7 decisions 1–2 change `01-prd.md` and must land before approval.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | awaiting-approval | | Reworked 2026-09-24 for amended J1/J2/§2.3; gate presented |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Prototype reworked against the amended PRD. J1: sign-up confirms region + optional segment; guided basics
sit on the empty Home; a first picture (usable / locked-until / owed) appears with no agent. J2: accessibility
is a pack default + reason, one fact question, or the universal question — consequence shown, never the label;
"Not sure" saves as an undecided 4th state. §2.3: `02-prototype/packs.js` (SG + generic, data only).
OPEN at the gate (`prototype-notes.md` §7): #1 undecided state needs a J2 edit; #2 §3.4 G-D1/G-D3 still say
"beachhead"/"already literate", contradicting §2.5; #3 proposed `{via}` on `holding_created`.
§2.4 (A13/M12) is still NOT demonstrated — the Agent → Try it screen is a scripted replay. Say so at Stage 3.
`design-system.md` governs visuals (four components added in §6). No design/scope commentary in the UI.
Stage 3 still owes: verify MCP connector tier-gating per client (§9.5).
