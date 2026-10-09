# P2 Feedback — UI drift vs the prototype (pre-Stage-6)

Source: Founder review of production vs the prototype, 2026-10-09. Fix session
runs before `stage: test P2`.

## Governing rule (Founder)

The prototype is high fidelity; the end product stays very close to it.
Production's theme (design-b) is correct — do not adopt the design-c or
design-a themes. Functionality and layout match the prototype regardless of
theme variance. Prototype references: `docs/02-prototype/` and the remote
branches `origin/claude/design-c-soft`, `origin/claude/design-a-two-inks`.

## Items

| # | Item | Type | Route |
|---|---|---|---|
| 1 | Home tab desktop card layout differs from the prototype | Requirement gap (drift vs behavioural reference) | Fix task in P2, before Stage 6 |
| 2 | Filter design and implementation differs from the prototype | Requirement gap | Fix task in P2, before Stage 6 |
| 3 | Extra "By type" and "Assets vs liabilities" cards with no prototype counterpart | Requirement gap — PRD J4 revised 2026-10-09: allocation (by-type list) and position ledger replace them; assets-vs-liabilities lives in Insights only | Implement the revised J4 in the fix session |
| 4 | Holding detail page differs (bar chart; top-right menu) | Requirement gap — bar chart deferred to P5 per 2026-10-09 decision; the rest matches the revised J4 | Menu, history rows, range bar and trend in the fix session; bar chart with P5's period machinery |
| 5 | Holding archive/delete menu at the bottom instead of the prototype's top-right three-dots button | Requirement gap | Fix task in P2, before Stage 6 |
