# Decision Log

Append-only. Newest entries at the bottom.

| Date | Decision | Reason | Stage |
|---|---|---|---|
| 2026-09-22 | Adopt the staged AI-driven workflow (docs/WORKFLOW.md) as the way this project is built | Single source of truth across independent sessions; human approval gates on every stage | Setup |
| 2026-09-22 | Product is NetNet, an AI-native net worth tracker; mockups are design reference only | Founder direction; mockup branding and legacy compat toggles are obsolete | Discovery |
| 2026-09-22 | Beachhead user = multi-asset professional in Singapore / SEA | Founder is the user (fast validation); mockups already encode CPF and multi-currency; US-centric aggregators serve this market worst | Discovery |
| 2026-09-22 | AI agents get full CRUD via MCP, backed by an audit log and undo | MCP clients confirm each tool call with the user; audit + undo make agent write access recoverable rather than irreversible | Discovery |
| 2026-09-22 | Agent auth = remote MCP server with OAuth, not pasted access tokens | Only path to one-click connection in ChatGPT and Claude; connection drop-off is the top product risk, so setup friction must be minimal | Discovery |
| 2026-09-22 | Phase 1 ships the web app and the MCP layer together as one thin vertical slice | Tests the riskiest assumptions (will users connect an agent, will they trust it to write) first rather than deferring them | Discovery |
| 2026-09-22 | No LLM in NetNet's own backend; all inference runs in the user's own agent | Keeps running cost near zero so the product can stay free during validation, and keeps bank statements off NetNet's servers entirely | Discovery |
| 2026-09-22 | Web-first responsive app; native iOS/Android deferred | Fastest go-to-market; native reuses the same API later | Discovery |
| 2026-09-23 | Launch as a real production app to test demand, free, with no billing during the test-market phase | Proving demand needs real users trusting it with real data; a price would confound the signal | Discovery |
| 2026-09-23 | Running cost ceilings: ~$0 at 0-100 users, <$50 at 100-1000, exit test-market above 1000 | Founder self-funds an open-ended runway; cost must stay carryable without a revenue decision | Discovery |
| 2026-09-23 | Test-market runway is undefined, so cost ceilings must hold indefinitely | Disqualifies trial-period free tiers and introductory credits, which defer an unknown bill to an unknown date | Discovery |
| 2026-09-23 | Reliability and security are a floor, not a trade against cost | A mid-task MCP failure teaches users the agent integration is untrustworthy, killing the core bet | Discovery |
| 2026-09-23 | Success measured as sign-ups and engagement; failure means killing the app | Single yardstick for every phase, with an explicit exit instead of drift on sunk cost | Discovery |
| 2026-09-23 | Technical and infrastructure choices deferred to Stage 3, recorded as business constraints only | Requirements should drive the stack, not the reverse; Stage 0 research into hosting was out of stage and discarded | Discovery |
