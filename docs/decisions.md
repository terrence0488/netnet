# Decision register

The decisions in force, one line each with the reason. The stage documents hold the detail; this
file holds the *why*, so settled questions are not reopened by accident. A new decision gets a new
entry in its area. A changed decision **replaces** its entry, and the documents it affects are
rewritten to match. Nothing here is superseded or historical; git history holds earlier versions.

## Process and repository

| Decision | Why |
|---|---|
| Build through the staged AI workflow (`docs/WORKFLOW.md`); only the Founder approves a stage | One source of truth across independent sessions, with a human deciding every gate |
| Documents state the current decision only; changes are rewritten in place, never appended as amendments | Keeps each session's context small and unambiguous; git history holds the past |
| Each approved stage lands on `main`; work happens on a branch from `main` | `main` always reflects the last Founder-approved state |
| `main` has no branch protection while the repository is private on GitHub's free plan; the Founder merges a pull request only when its Checks job is green | Protection for a private repository needs a paid plan. One person merges, and CI on `main` shows a slip at once |
| Mockup images and any material with real personal data are never committed (`.gitignore` blocks them) | They hold the Founder's real name, email and finances; git history is permanent and the repo may go public |
| No user interviews and no waitlist: launch, then promote | Founder decision. Live usage is the only test, so P1 instrumentation is the experiment and distribution is planned work (A9) |

## Product and scope

| Decision | Why |
|---|---|
| NetNet is the context layer for the user's own AI agent. It supplies facts and uncertainty, never advice | Frontier models already advise well enough; what they lack is where the user stands |
| No LLM inference in NetNet's backend; documents never reach NetNet (N2) | Running cost stays near zero, and statements stay off our servers |
| Agents get full CRUD through MCP, backed by an audit log and undo (N3) | Clients confirm each call; audit and undo make write access recoverable |
| Agents connect by remote MCP with OAuth, never a pasted token | The only one-click path in Claude and ChatGPT; connection drop-off is the top risk (A1) |
| P1 ships the web app and the MCP layer together | Tests the riskiest assumptions (will people connect, will they trust writes) first |
| Web first, mobile-first responsive; native iOS/Android later with React Native + Expo on the same API | Fastest go-to-market; native reuses the API and the shared TypeScript |
| Free with no billing during the test market. Whatever ships free stays free; money comes only from capabilities added later (PRD §4.2) | A price would confound the demand signal; every scope choice is therefore a revenue choice |
| Unlimited MCP read and write is permanently free | The differentiator is what drives adoption, and adoption is what this phase must produce |
| Backward-looking analysis is free and in v1; forward-looking projection built by NetNet is reserved. The user's agent may project freely | "Historical vs projective" is a line that holds; "better charts are paid" would not |
| Insights ships at launch and is built last (P5), after the MCP layer and analytics (P1) | Founder judged it core; it is the one v1 item that does not serve the experiment, so a slip shows against the launch date instead of eating the experiment's work |
| Liabilities are in v1 | Net worth is meaningless without debt, and the same value model covers it |
| Income and expense tracking is neither in scope nor reserved | The balance sheet is the part nobody has; it is the first thing to reconsider if affordability questions dominate M7 |
| No in-app AI chat and no financial-education content | Follows from no inference; opinionated defaults and the user's agent carry the education cost |
| Net Worth Goals, value notes and chart marks are out of v1 | No job needs them; goals edge toward reserved projection |
| Running cost ≈$0 to 100 users and <$50/month to 1,000, holding indefinitely; reliability and security never trade against cost | Self-funded, open-ended runway; a failing MCP call kills trust in the core bet |
| Success is sign-ups and engagement. After 8 weeks, M1 < 25, M3 < 15%, M7 < 20% or M6 < 10% is a kill reading, read on P-B and P-C only | One yardstick with an explicit exit; a blended reading would hide a segment failing |

## Users and measurement

| Decision | Why |
|---|---|
| Three personas: P-A starting out, P-B accumulating, P-C established; SG/SEA first | The problem describes people who do not know their net worth; serving them is the difference between a good tracker and a great one |
| NetNet does not teach: defaults with stated reasons, fact questions instead of categories, judgement routed to the agent | Reaches a wider audience without paying an education cost |
| The app must be worth using before an agent is connected (A12, M11); P-A is held to M11 | Otherwise P-A churns before the experiment reaches them, and that reads as evidence against A1 and A4 |
| The agent is a target user: NetNet + agent must beat a spreadsheet upload, even on a weak model (A13, M12) | Makes the context claim falsifiable |
| Context has four layers (arithmetic, meaning, provenance, answer shape); dense not comprehensive; facts not judgement; deterministic (N11) | Lifts weak models without bloat, stays advice-free, and costs nothing to compute |
| The moat is capture and history, not compute | Directs investment to the opinionated flow and jurisdiction semantics |
| Analytics is a v1 deliverable equal to the MCP layer; events never carry amounts, names or text (N9) | Instrumentation is the experiment; a pipeline that leaks the balance sheet is an incident |
| Every event carries `segment`; `client`, `entry`, `method`, `via` and `channel` ride where they apply | Each splits a metric that would otherwise be misread, e.g. one client's broken flow looking like A1 failing |
| Distribution (landing page, demo recording, directory listings, launch note, funnel analytics) is v1 work. The pitch: "you can't get useful advice from an AI that doesn't know where you stand" | Sign-ups are the kill metric and there is no channel; the line is true for all three personas |

## Holdings, accessibility and packs

| Decision | Why |
|---|---|
| Accessibility (readily accessible / illiquid / locked, or undecided) is a first-class holding attribute | "Can I afford it" answered off CPF or home equity destroys trust in one question |
| It is never asked as a category: a pack default with its reason, one fact question where ambiguous, or "could you use it within a month?"; the consequence is shown in money | People cannot classify reliably, but they know the facts |
| "Not sure" stores undecided: counts toward net worth, never toward what could be used, reported to the agent as incompleteness | Saving is never blocked, and no answer rests on a guess |
| Opinions about the interaction are universal; opinions about the world live in per-country jurisdiction packs, which are data (N10) | A flow fused with Singapore's facts could never leave Singapore |
| Types are universal and only labels are local (a mandatory-retirement type that SG labels CPF) | CPF, EPF, 401(k) and pensions behave identically for net worth |
| The generic pack is first-class. The country is inferred from IP on our own server and confirmed with one tap; every country is listed alphabetically | A wrong pack is worse than none; a list that opens with Singapore tells everyone else it is not for them |
| A pack lists only what differs from generic, may add its own types and follow-up questions, and never restricts what can be tracked | New countries stay cheap; people hold assets in several countries |
| Ten launch packs (SG, MY, ID, PH, TH, VN, HK, IN, AU, GB), each reviewed by someone who knows the market. Other countries get generic, and their country is recorded | Covers where the first users live and hold assets; the recorded country says which pack to write next |
| Packs and agent guides are versioned, validated, audited content, editable later through an admin portal with no access to user data. A pack edit never reclassifies an existing holding | They change more often than the product; one edited default must not silently move everyone's "could use" figure |
| Money is stored in integer minor units. The FX rate for the value's date is fixed at write, stored, exported and readable by the agent, but not displayed | No float drift; periods are not distorted by later FX moves; the rate is almost never wanted on screen |
| Deleting a tag removes it from the holdings that carry it, or merges it into another; it is never refused | A tag is only a label. Each holding's change is audited, so undo can put the tag back |
| A change against a baseline is worked out per holding and summed; a holding first valued after the baseline counts from its first value | Adding a holding is not growth, and the total and every row are measured against the same thing |
| The calendar baselines are month ends: last month is the end of last month, last quarter the end of the month three months back, last year the end of the same month last year; Jan 1 is 1 January | Statements are dated at month ends, so the comparison is like with like, and "since 31 Aug" reads as a fixed point |

## Onboarding and agents

| Decision | Why |
|---|---|
| Sign-up asks only for a way in (Google, Apple, email + password). Email verification does not block, except before connecting an agent | Every question before the account exists costs sign-ups; agent connection is the one risky step |
| Onboarding: where you live, an optional segment, then the basics or the agent route. One question per screen, with Back, Skip and "Done for now" | Nothing has to be finished; the segment never changes the UI, so per-segment metrics stay clean |
| One primary action per screen; the agent is offered as a real second route (an outlined button below a rule) | A new user facing equal choices leaves; the agent is what v1 bets on |
| One connect flow everywhere, per client and platform, with screenshots and no "I've done it" button | The routes can never drift apart; NetNet sees the approval itself |
| Launch agents: Claude and a generic "Other agent" guide. ChatGPT is listed once NetNet is in OpenAI's directory; its guide stays in content, unlisted, until then. Grok and Muse parked; one list in every country | ChatGPT's free plan allows no custom connector but can use directory-listed apps, so it can be neither tested nor promised before then (P1 spike). Standard MCP + OAuth means any agent can still connect |
| Every new agent connection shows NetNet's approval page; remembered consent is off | A remembered approval would skip the page, and with it the security email, on a reconnect (P1 spike) |
| The starting prompt is one line; the country's checklist comes from the MCP layer. Prompts never carry financial data | One source of pack data; weak models follow a structured checklist better; the agent reads what it needs |
| Agent provenance is quiet: a mark on the row, the client named when a value is opened, full attribution in Activity | Who wrote a number matters when checking it, not while reading the position |

## Notifications

| Decision | Why |
|---|---|
| v1 sends two messages, both through one `notify()`: the comeback reminder and the security email | Push costs nothing, so the only question was what it is for |
| Comeback reminder: after 30 days without checking NetNet (opening it, or the agent calling a tool), monthly, at most three per absence, only 08:00–21:00 local. Push where it is on, otherwise email to a verified address | A gentle nudge that never nags active or agent-first users, and stops for people who have left |
| Wording: "Your net worth is due for an update." plus "Just ask {agent}." when one is connected. Never an amount, total or name | Short and factual, no guilt; lock screens and inboxes are public |
| Push is offered only by a quiet Home card after the first picture, or in Settings; no Home Screen how-to; where push is impossible, email is used | Permission follows an explaining tap; nobody is nagged or taught |
| A security email on every agent connection, email only, and it cannot be turned off | Makes granting agent write access safer (A2, A7) |
| "Opened" means tapped or clicked; no email-open pixel | A pixel is a tracker, and Apple Mail's prefetching makes it meaningless |

## Design

| Decision | Why |
|---|---|
| The design system is "Poster" (`docs/02-prototype/design-system.md`) | The Founder's choice for the product's look |
| The mockups are a functional brief only | The product carries its own design language |
| Binding rules: one figure, one place; 44px tap targets (36px with a mouse); nothing below 11px on a phone; only navigation moves the page | Each fixes a real failure found on real devices |
| Agent is a fourth tab; desktop gets a sidebar and a 12-column grid | J5 and J8 are the point of the product; v1 is a responsive web app |
| Charts use the validated categorical palette in fixed order; brand and chart hues never share a role; a chart with too little data is a frosted placeholder | Colour-blind safety; a chart that vanishes makes a new account look emptier than it is |
| We own everything that displays data and all colour and type; the platform owns input by gesture | Brand chrome, native controls, decided once rather than case by case |

## Delivery

| Decision | Why |
|---|---|
| v1 is built in five phases: P1 the core loop (sign up, add, connect, ask, the agent writes), P2 standalone value, P3 trust, ownership and the comeback reminder, P4 launch readiness, P5 Insights (`04-plan.md`) | Thin vertical slices with the riskiest assumptions (A1, A2, A4) first; everything the experiment depends on comes before Insights |
| Every phase ends on production, deployed only by the Founder's manual workflow; production stays unannounced until launch | Each checkpoint is tested where users will be, and nothing reaches production without the Founder |
| A capability lands in the Ledger, REST and MCP in the same phase; its screen may follow later | One implementation, so the agent is never behind the UI (J6) |
| A throwaway spike proved OAuth and MCP with real Claude before the auth and MCP work; its verdict (`docs/phases/P1/spike.md`) sets the library and its settings | The newest parts (the OAuth provider with CIMD, MCP 2026-07-28) are proven with a real client before anything depends on them |
| The build adds endpoints, fields, parameters and message kinds that the architecture implies, and reports them; any other interface change is stop-and-raise | Keeps architecture §7 current without a Founder gate for every implied detail |
| CI checks every push and the opening of every pull request. Previews deploy from CI with the Vercel CLI, only for a branch with an open pull request (or a manual run); Vercel's own Git deployments are off | Production comes only from the manual workflow, and previews stay one per pull request, within Neon's branch limit |

## Architecture

| Decision | Why |
|---|---|
| Verification and password-reset emails go through `notify()`, as two email-only message kinds | Every message to a person takes one path, so the no-amount template test covers all of them |
| Neon and CI run Postgres 18 | One major version from tests to production (CONVENTIONS §1) |
| Vercel (Hobby) + Neon Postgres (Free) in Singapore; one TypeScript codebase, one Hono function; upgrades on measured triggers (architecture §9.4) | $0 for the first ~70–100 users, conventional Postgres, per-PR previews with their own database branch |
| The function is the API bundled by esbuild into one file (`apps/api/dist/vercel.js`), which `api/index.ts` re-exports | Vercel compiles TypeScript file by file and cannot run workspace packages from source; one self-contained file runs the same in CI's E2E and on Vercel |
| Per-user isolation by Postgres row-level security with `FORCE`, composite keys and one `withUser()` entry | Enforced by the database, not by remembering a filter (N4) |
| One ISO 4217 table, in contracts; core imports it by its zod-free path, `@netnet/contracts/currencies`, the one value core takes from contracts | One list to keep current, and core stays free of zod |
| Better Auth for accounts and the agents' OAuth 2.1 server (CIMD and DCR); our own MCP token check | No hand-rolled security code; protocol support stays in our hands |
| The OAuth endpoints are Better Auth's own paths, `/api/auth/oauth2/*` and `/api/auth/jwks` | Clients find them from the server's metadata, so a rewrite to other paths would be a route to maintain for nothing |
| MCP is stateless Streamable HTTP across three protocol versions, with one summary tool, `get_financial_context`, of at most 8 KB | Clients migrate at different speeds; one dense call answers a question |
| `get_financial_context` says what each type of holding is once per type (`types`), not on every holding | The repeated pack text was about a quarter of each holding's bytes; more holdings fit in the 8 KB |
| No charting library: d3 maths and our own SVG, with geometry shared with native | Three heavily specified chart kinds; one geometry for web and native |
| First-party analytics in its own schema; no tracking SDKs | N9 by construction rather than by auditing a vendor |
| Web push by the standard (VAPID, a service worker that caches nothing); email by Resend | Free and standard; no financial data ever stored offline |
| Account deletion erases at once, with a stated window of 30 days (the life of backups) | J10 needs a stated window |
| Exchange rates come through Frankfurter's API: the ECB's reference rates for the currencies the ECB publishes, and for every other currency Frankfurter's daily blend of central banks' published rates, stored as `fallback`. SOS, SSP, XCG, XPF and ZWG have no daily source and are unsupported (`CURRENCY_UNSUPPORTED`) | Free, no key, daily history back to each bank's own start, official sources rather than scraped market data, and one client for both. Frankfurter is open source, so it can be self-hosted if the public API goes. It covers every other currency in `countries.json` |
| Accepted risks: slow first calls while traffic is thin (about 1 s server-side on a new instance; `latency_ms` and P1-T18's probe measure it in production), Neon's monthly compute cap, Vercel Hobby's non-commercial terms and cron limits (timing within the hour is checked on production in P1-T18), higher cost past ~100 users | The price of $0 at launch; each has a trigger or a fallback (architecture §12) |
