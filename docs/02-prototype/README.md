# NetNet — Stage 2 prototype

The clickable prototype, built on the **"Poster"** design system (`design-system.md`).

Open `index.html` in a browser. No build, no server, no dependencies.

- `index.html` — shell (sign-up, onboarding and every screen are rendered by `app.js`)
- `styles.css` — visual language; cream by default, espresso dark follows the OS
- `packs.js` — **jurisdiction packs** (PRD §2.3): the universal types, the generic pack and the SG,
  MY and UK packs. Data only; adding a market is a new entry here, not a code change
- `connectors.js` — the agents and their setup guides (PRD J5). Data only
- `data.js` — **fictional** seed data, shaped like persona P-C (Established) in PRD §2
- `app.js` — screens, computation, hand-rolled SVG charts
- `design-system.md` — **the design system**: tokens, type, components, charts, native boundary
- `prototype-notes.md` — flows covered, design decisions, open questions, user-test script
- `tests/` — the behaviour the design must keep (see `tests/README.md`)
- `agents/`, `connect/` — agent logos and setup screenshots (see each README)
- `fonts/` — Unbounded and Space Grotesk (SIL OFL)

Throwaway design code. The stack is decided in `docs/03-architecture.md`; nothing here is a stack
opinion.

The **PROTO** button resets the sample account, switches to an empty first-run account, shows
the analytics events as they fire, and can pretend the browser is in another country so the region
question can be tested from anywhere. It also runs the comeback reminder (PRD J12): skip 30 days
without checking NetNet, pretend the browser can or cannot receive push, and open what NetNet sent
outside itself (the push on a lock screen, the email in an inbox, the security email).

All money in here is invented. Never replace it with real financial data.
