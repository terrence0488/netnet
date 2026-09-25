# Project State

## Current
Stage: Prototype (rework)
Phase: n/a
Status: in-progress — variants B and C built; waiting on the Founder's A / B / C choice
Next action: the Founder compares A / B / C and picks one (or asks for changes). Then the chosen
variant becomes the prototype's design, and Stage 2 goes to the gate. Stage 2 is **not** approved;
`approve prototype` comes after the choice.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | in-progress | | A ("Two Inks", cd1513d) · B ("Poster") · C ("Calm") built 2026-09-25, one branch each; awaiting the Founder's choice |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**Three designs, one product, one branch each** (Founder's brief, 2026-09-25: UI only; flows,
function and content stay; content may bend to fit a look):
- **A "Two Inks"** — `claude/zealous-dijkstra-3yebuo` (locked at cd1513d). `design-system.md`.
- **B "Poster"** (bold retro) — `claude/design-b-retro`. `design-system-b.md`: cream, black
  outlines, hard shadows, tomato; Unbounded + Space Grotesk.
- **C "Calm"** (clean, soft, spacious) — `claude/design-c-soft`. `design-system-c.md`: white cards
  on a pale ground, indigo hero, coral glow; Plus Jakarta Sans.
B and C change only `styles.css`, fonts and their design doc; `app.js`, data and tests are A's,
and all 22 suites pass on each. Each variant doc lists what it replaces; A's §2.1, §5, §6.1, §7 bind.
On the choice: merge that branch's look, fold its doc into `design-system.md`, rerun the tests,
then present the Stage 2 gate. Still open: Muse logo (`agents/README.md`). Stage 3 notes: PRD §9.6
item 17 (packs admin portal), free plans allow custom MCP (confirm when building).
