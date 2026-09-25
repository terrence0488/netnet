# NetNet — Stage 2 prototype · design B "Poster"

This branch is **design variant B** (bold retro poster). Same product, flows and tests as design A;
only the look differs. What B changes: `design-system-b.md`.

Open `index.html` in a browser. No build, no server, no dependencies.

- `index.html` — shell and landing page (sign-up is rendered by `app.js`)
- `styles.css` — B's visual language; cream by default, espresso dark follows the OS
- `packs.js` — **jurisdiction packs** (PRD §2.3): the universal types, the SG pack and the generic
  pack. Data only; adding a market is a new entry here, not a code change
- `data.js` — **fictional** seed data, shaped like persona P-C (Established) in PRD §2
- `app.js` — screens, computation, hand-rolled SVG charts
- `design-system.md` — **the design system** (A's); its content, chart, hit-target and layout rules still bind
- `design-system-b.md` — what B replaces: idea, type, colour, component appearance
- `prototype-notes.md` — flows covered, design decisions, open questions, user-test script
- `explorations/` — the rejected directions, kept on record
- `fonts/` — Unbounded and Space Grotesk (SIL OFL)

Throwaway Stage-2 design code. It carries **no stack opinion** — no framework, no database, no
hosting. Those are Stage 3 decisions. Do not read this as an architecture proposal.

The **PROTO** button resets the sample account, switches to an empty first-run account, shows
the analytics events as they fire, and can pretend the browser is in another country so the region
question can be tested from anywhere.

All money in here is invented. Never replace it with real financial data.
