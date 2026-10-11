# P2 Feedback — UI drift vs the prototype (pre-Stage-6)

Source: Founder review of production vs the prototype, 2026-10-09. Fix session
runs before `stage: test P2`.
Second review: Founder production review, 2026-10-11 (items 6–10).

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
| 6 | Add-sheet drift: Tags row missing (a P2-T6 regression), no currency symbol on Asset Value (design-system §6 Amount entry), value height misaligned, date overflows the border | Bug (regression + drift vs design system) | P2-T9, before Stage 6 |
| 7 | Activity button on the Home top missing | Later-phase scope — P3 owns Activity (J7); ignored per the Founder's instruction | None |
| 8 | Holding bar chart missing (re-raised) | Already routed — deferred to P5 per the 2026-10-09 decision (#4) | None; re-confirm at this gate |
| 9 | Edit Value sheet: date overflows the border, value height misaligned | Bug (drift vs the prototype's `sheetValue`) | Folded into P2-T9 |
| 10 | Three-dots menu missing Edit; no Edit holding screen | Requirement gap (drift vs behavioural reference; prototype `sheetHoldingMenu` → `#/edit/`) | P2-T10, before Stage 6 |
