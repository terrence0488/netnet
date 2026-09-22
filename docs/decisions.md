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
