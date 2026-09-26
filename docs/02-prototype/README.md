# NetNet — Stage 2 prototype

The look is **"Poster"** (bold retro), chosen by the Founder on 2026-09-26 from three designs over
the same product. The other two are kept on their own branches: A "Two Inks"
(`claude/zealous-dijkstra-3yebuo`) and C "Calm" (`claude/design-c-soft`).

Open `index.html` in a browser. No build, no server, no dependencies.

- `index.html` — shell and landing page (sign-up is rendered by `app.js`)
- `styles.css` — visual language; cream by default, espresso dark follows the OS
- `packs.js` — **jurisdiction packs** (PRD §2.3): the universal types, the SG pack and the generic
  pack. Data only; adding a market is a new entry here, not a code change
- `data.js` — **fictional** seed data, shaped like persona P-C (Established) in PRD §2
- `app.js` — screens, computation, hand-rolled SVG charts
- `design-system.md` — **the design system**: tokens, type, components, charts, native boundary
- `prototype-notes.md` — flows covered, design decisions, open questions, user-test script
- `explorations/` — the rejected directions, kept on record
- `fonts/` — Unbounded and Space Grotesk (SIL OFL)

Throwaway Stage-2 design code. It carries **no stack opinion** — no framework, no database, no
hosting. Those are Stage 3 decisions. Do not read this as an architecture proposal.

The **PROTO** button resets the sample account, switches to an empty first-run account, shows
the analytics events as they fire, and can pretend the browser is in another country so the region
question can be tested from anywhere.

All money in here is invented. Never replace it with real financial data.
