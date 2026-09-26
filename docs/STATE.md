# Project State

## Current
Stage: Prototype (rework)
Phase: n/a
Status: in-progress — design B "Poster" chosen and folded in; Stage 2 at its gate
Next action: the Founder reviews the Stage 2 gate (prototype + PRD §9.6 revisions) and replies
`approve prototype`. Then a **new session** runs `continue` → Stage 3 (Architecture).

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | at gate | | Design B "Poster" chosen 2026-09-26 (branch `claude/design-b-retro`); A and C kept on their branches |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
**The Founder chose design B "Poster"** (2026-09-26). The Stage 2 line is now `claude/design-b-retro`;
`design-system.md` is B's system (the separate `design-system-b.md` was folded in and removed).
**A and C are kept, not merged**: A "Two Inks" on `claude/zealous-dijkstra-3yebuo`, C "Calm" on
`claude/design-c-soft`. Never merge those into the Stage 2 line; they are reference only.
Also this session: Home's trend and allocation became a swipeable carousel on a phone (side by side
on a computer) in all three designs; B dropped its Home ticker; three iPhone layout bugs fixed.
Tests: `node docs/02-prototype/tests/run.mjs` (23 suites, all clean on B).
At the gate: PRD §9.6 rows 12–28 (AI-drafted), and the desktop change from the carousel
(prototype-notes §7 item 7). Stage 3 notes: PRD §9.6 item 17 (packs admin portal), free plans allow
custom MCP, native-build rules in design-system §9, Muse logo (`agents/README.md`).
