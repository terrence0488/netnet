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
| 2026-09-23 | Mockup images removed from the repo and purged from git history; written description kept instead | They contain the Founder's real name, email, net worth and holdings; git history is permanent and this repo may later gain collaborators or go public | Discovery |
| 2026-09-23 | Founder-supplied reference material containing real personal data stays local, never committed | .gitignore blocks images under docs/reference/mockups/; ask the Founder for the visuals when needed | Discovery |
| 2026-09-23 | All work stays on claude/compassionate-franklin-f6gat1; merge to main only once the project is finalised | Keeps a single reviewable line of work during the staged build rather than merging stage by stage | Discovery |
| 2026-09-23 | No user interview round; the market is tested by launching the product | Founder decision; moves all validation onto live usage, making P1 instrumentation the experiment itself | Discovery |
| 2026-09-23 | No waitlist or pre-launch channel; launch first, then promote | Founder decision; distribution becomes an explicit unsolved problem (assumption A9) needing planned work | Discovery |
| 2026-09-23 | Free stays free permanently; monetisation comes only from capabilities added later | Founder decision; anything shipped during the test-market phase can never be paywalled, so scope is now a revenue decision | Discovery |
| 2026-09-23 | Interview guide deleted from 00-discovery.md rather than left in place | Workflow rule: documents stay short and living, never stale | Discovery |
| 2026-09-23 | CORRECTION, supersedes the entry above: merge to main after **each stage is approved**, not once the whole project is finalised | Founder clarification. Each approved stage lands on main as a checkpoint, so main always reflects the last Founder-approved state; work continues on claude/compassionate-franklin-f6gat1 | Discovery |
| 2026-09-23 | Stage 0 Discovery approved by the Founder | Problem, beachhead user, assumptions and business constraints settled; Stage 1 (PRD) may begin | Discovery |
