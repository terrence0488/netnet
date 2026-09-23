# 00 — Discovery

Status: approved 2026-09-23 · §1, §3 and §4 revised 2026-09-23 on the Founder's reframe of the
problem, re-confirmed with the PRD approval the same day · Stage owner: Product researcher

## 1. Problem statement

> **Reframed by the Founder, 2026-09-23.** The earlier framing led with data entry as the problem.
> Data entry is the *obstacle*; the problem is that AI cannot give tailored advice without knowing
> where the person stands. The wedge and the build are unchanged — the hierarchy is not.

People want financial advice fitted to their own situation, and frontier AI models can already
give it — well enough for most of what an ordinary person actually decides. What a model cannot do
is know the thing every one of those answers depends on: **where this person actually stands.**

Most people cannot supply that context, because they do not have it. They do not know their net
worth, what they own against what they owe, or how much of it they could touch this month. They
ask a capable model a real question, get a generic answer, and nothing in the exchange tells them
the limit was the input rather than the model.

Assembling that picture is the obstacle, and it is where every existing route fails. People with
**multi-asset, multi-currency wealth** have no reliable picture of their net worth.
Their money is spread across brokerages, bank accounts, retirement schemes (CPF), property,
vehicles, unvested equity and crypto. The automated tools (Mint-style aggregators, Monarch,
Copilot) are built on bank-feed aggregation, which:

- **cannot see** the assets that dominate this group's balance sheet — the house, the car, CPF,
  unvested RSUs, private holdings, foreign accounts;
- **breaks constantly** outside the US, where aggregation coverage is thin to nonexistent;
- optimises for **transactions and budgeting**, not for the stock-take question this group
  actually asks: *what am I worth, and is it going up?*

So they fall back to a spreadsheet. The spreadsheet works — it handles any asset, any currency —
but it decays. Updating it means opening ten apps, copying numbers, fixing formulas and
converting currencies by hand. It is a chore with no deadline, so it slips, and a net-worth
history with a two-year gap in it is worth very little.

**The real problem is not tracking. It is data entry.** Every existing product either automates
entry at the cost of coverage (aggregators), or preserves coverage at the cost of effort
(spreadsheets and manual trackers). Nobody has removed the effort without also narrowing what
can be tracked.

### The insight NetNet is built on

An AI agent with access to the user's documents can do the data entry. The user drops a
brokerage statement into ChatGPT or Claude and says "update my net worth"; the agent reads the
numbers and writes them into NetNet. The tedious part is delegated, not automated away — which
means it works for *any* asset, including the ones no bank feed will ever reach.

This inverts the usual trade-off: manual entry stops being NetNet's limitation and becomes the
reason the agent is useful.

**And reading is the point.** Once the agent can read the balance sheet, every question the user
asks it is answered against their real position rather than a blank slate — "can I afford this
car?", "how exposed am I to USD?", "am I on track?". NetNet is the context layer that makes those
answers possible. Tracking is the means; better advice is the end. That ordering matters for
scope: NetNet supplies context and never generates advice itself (see `01-prd.md` §4.2, §8).

## 2. Target user

**The vision is broad; the beachhead is narrow, and it is selected on financial literacy.**
Founder decision, 2026-09-23: go first at people who already understand why a current picture of
their position is worth keeping, because educating a market is the slow and expensive problem and
the test-market phase will not attempt it. Breadth comes later, in the order set out at the end of
this section.

**Primary (beachhead): the financially engaged multi-asset professional in Singapore / SEA.**

- Mid-to-late career, salaried or self-employed, net worth roughly S$300K–5M.
- Holdings span 5–20 line items across ≥2 currencies: a local brokerage or IBKR, bank cash,
  **CPF**, possibly property, possibly a car, employer RSUs, some crypto.
- Financially literate and engaged — reviews position monthly or quarterly, not daily.
- Already uses a spreadsheet, a notes app, or an existing manual tracker, and is mildly
  ashamed of how out of date it is.
- Already pays for ChatGPT or Claude, or would.

Chosen because the Founder is this user, which makes validation fast and honest; because the
mockups already encode this user's reality (CPF and multi-currency are first-class); and because
US-centric aggregation products serve this market especially badly.

**Expansion order — by education cost, not market size:** (1) SG/SEA multi-asset professional,
no education needed; (2) global FIRE / net-worth trackers — same behaviour, larger market, more
competition, still no education needed; (3) financially engaged people with simpler holdings; (4)
the broad market who do not know what they are worth — high education cost, and they need guided
assembly rather than faster entry. Step 4 is the vision in §1, deliberately deferred. See
`01-prd.md` §2 for the table and what it means for the launch pitch.

**Note the asymmetry it creates:** the beachhead already roughly knows their net worth, so the
mass-market framing of §1 does not describe them. Their problem is that the numbers are stale and
unreadable by their AI. Literacy also raises the trust bar — this audience asks where the data lives
and what deletion means before signing up (A7).

**Explicitly not the user in v1:** budgeters, day traders, people wanting transaction
categorisation, households sharing finances, anyone needing tax filing, and anyone who first has to
be taught why tracking net worth matters.

## 3. Current alternatives, and why they lose

| Alternative | Why people use it | Where it fails this user |
|---|---|---|
| **Spreadsheet (Excel / Google Sheets)** | Total flexibility, free, handles any asset or currency | Updating is manual drudgery; it decays; charts are work; no mobile experience; FX by hand |
| **Aggregators (Monarch, Copilot, Mint-alikes)** | Automatic, polished, low effort | Bank coverage poor outside US; blind to property, CPF, RSUs, private assets; transaction-first, not net-worth-first; subscription |
| **Manual net-worth apps** | Purpose-built, mobile, decent charts | Entry is still fully manual, so they decay too; closed silos with no programmatic access |
| **Brokerage / bank apps** | Accurate and live for that one account | Single-institution by definition; no consolidated picture |
| **Not tracking at all** | Zero effort | The status quo NetNet actually competes with, and the most common one |
| **ChatGPT alone (now the primary alternative)** | Conversational, already in hand, gives real advice | No memory of financial state across chats; the user must re-supply everything each time, and cannot, because they do not have it; nothing persists or charts |

**Positioning:** the flexibility of a spreadsheet, without the data entry — because your own AI
agent does the entry for you.

## 4. Riskiest assumptions

Ordered by how much damage a wrong answer does. A1 and A2 are the ones worth deliberately
testing before heavy investment.

| # | Assumption | If wrong | How to test |
|---|---|---|---|
| **A1** | Users will actually **connect** NetNet to their agent. The setup (OAuth connector in ChatGPT/Claude) is a real drop-off cliff, and many people have never added a connector. | The differentiator is dead weight; NetNet is just another manual tracker. | Instrument connection rate in P1. Watch 5 users attempt setup unaided, timed, no help. |
| **A2** | Users will **trust an agent to write** financial data — and trust the numbers it wrote without re-checking every one. | The write path collapses to read-only; the "drop a statement" story is gone. | In interviews, probe reactions to agent-written values. Measure post-write correction rate. |
| **A3** | Agent-assisted entry is genuinely **less effort** than the spreadsheet, end to end, including verifying what the agent did. | No reason to switch. | Time both paths, same user, same statement. |
| **A4** | **(promoted — this is now the premise)** The **advice job** is valued and recurring, not a novelty people try twice. | The reason for building NetNet is gone. What is left is a tracker with an import feature — viable, but not what this is. | Track repeat read-only agent queries in week 2+, not week 1 (PRD metric M7). |
| **A5** | Statement-to-values extraction is **accurate enough** across messy real formats that users don't lose trust after one bad parse. | Trust breaks early and doesn't recover. | Run 10 real statements (SG banks, IBKR, CPF) through an agent and score accuracy. |
| **A6** | Consolidated net worth is a **recurring** need (monthly-ish), not an annual curiosity. | Retention floor is very low regardless of execution quality. | Interview for last-checked recency and frequency. |
| **A7** | People will hand **complete net-worth data** to a new, unknown, free product from a solo founder. | Signups stall at the trust barrier. | Ask directly in interviews; watch whether signups add >3 holdings. |
| **A8** | Free-forever-for-now attracts real users, not just tyre-kickers, and monetisation can follow later. | Demand signal is noise. | Judge by depth of use (holdings added, return visits), never by signup count. |
| **A9** | **Distribution is solvable after launch.** There is no waitlist, audience or channel; the plan is to launch and then promote. | The product can be excellent and still get no signups — and the kill criterion is signups. Failure would be indistinguishable from "no demand". | Treat distribution as a work item with its own owner and metrics, not a launch-day afterthought. |
| **A10** | Enough of the product's value can stay free permanently that **future capabilities alone** can carry monetisation. | Nothing left to charge for that people want more than what they already have free. | Decide now which capabilities are deliberately reserved, before they ship for free by accident. |
| **A11** | **(new, from the reframe)** Advice grounded in the user's real numbers is **noticeably better** than generic advice — and the user can tell the difference. | The context layer is effort nobody is rewarded for. Users go back to asking the model directly, which is free and needs no setup. | Compare repeat query behaviour in week 2+ (M7) against week 1 novelty; watch whether users keep the picture current for the sake of the answers (M8). |

**A4 and A11 sit above these as the premise:** if grounded advice is not worth the assembly, A1
and A2 do not matter. They are cheaper to test, though — they only read out once users are
connected, which is why the ordering below still holds for what to build first.

**The sharpest product risk is A1 + A2 together.** The premise needs the user to clear a setup
hurdle *and* extend trust to an agent with write access. Either one failing takes the wedge with
it. This is why P1 ships both halves — the web app and the MCP layer — rather than deferring the
agent work: the riskiest assumption should be tested first, not last.

**The sharpest business risk is A9.** With no interviews and no channel, every assumption above
is now tested only by live users — and live users only exist if promotion works. A product that
nobody sees produces the same reading as a product nobody wants, and the kill criterion cannot
tell them apart. Distribution therefore needs to be planned as work, not hoped for.

**Non-obvious risk worth naming:** the agent writes *through* an LLM the Founder does not
control. A mis-parsed statement produces a plausible-looking wrong number in the user's net
worth. The audit log and undo are not polish — they are what makes agent write access
defensible.

## 5. Business constraints

Founder-set constraints on the business. These are **not** technical choices — they are the
inputs Stage 3 (Architecture) must satisfy, and the yardstick any stack proposal is measured
against.

### Purpose of the build
Launch as a **real production app** to test market demand. Not a prototype, not a private beta:
a live product that real users trust with real financial data.

### Go-to-market
- **Web app first**, on a custom domain the Founder will register.
- **Native iOS/Android is planned**, not hypothetical. Decisions made now must not make that
  expansion expensive later — web and native must be able to share one backend and one API.

### Pricing during test-market
**Completely free.** No billing, no paywall, no tiers. Monetisation is deliberately deferred
until demand is proven.

### Cost ceilings

| Users | Monthly running cost |
|---|---|
| 0–100 | ≈ $0 |
| 100–1,000 | < $50 |
| > 1,000 | Exit test-market phase; work out the business model |

### Runway
**Undefined** — could be a month, a quarter, or a year.

Consequence: the cost ceilings must hold **indefinitely**. Anything free only for a trial window
(introductory credits, 3-month trials, promotional tiers) does not satisfy this constraint. It
defers an unknown bill to an unknown date, which is not the same as being cheap.

### Quality floor — does not trade against cost
Minimising cost must **not** compromise service quality or security. The app must be reliable
and secure at all times. Cheap-but-flaky is a failed outcome, not an acceptable trade.

This bites hardest on the agent-facing surface. A web page that is slow produces an annoyed user
who retries; an **MCP call that fails mid-task teaches the user the integration cannot be
trusted** — and that is the product's core bet (A1, A2). Infrastructure defaults that trade
availability for cost are therefore a product risk, not an ops detail.

### Success and kill criteria
The outcome to drive is **sign-ups and engagement**. If NetNet cannot get people to sign up and
keep using it, the app is killed and the Founder moves on.

Consequence for planning: every phase is judged on whether it moves those two numbers. Work that
does not is deferrable by definition, and the PRD's success metrics should make both directly
measurable.

## 6. Interview questions

Removed. The Founder decided against an interview round (see section 7) — the market will be
tested by launching. This section previously held a ten-question guide; it is deleted rather than
left to rot, per the workflow's rule that documents stay short and living.

## 7. Founder answers (resolved 2026-09-23)

**1. User interviews before the PRD? — No.** No interview round will run. The product launches
and the market is tested live.

*Consequence:* assumptions A1–A8 are tested only by real users of the deployed product. This
raises the stakes on P1's instrumentation — if it does not measure connection rate, agent write
volume, correction rate and return visits, the launch produces no evidence and the kill decision
has nothing to rest on. **Analytics is not a nice-to-have in P1; it is the experiment.**

**2. Waitlist, audience or channel for the first users? — No.** Launch first, promote after.

*Consequence:* distribution is an unsolved problem with no owner (A9). The PRD must carry a
goal for it, and the plan must contain real work for it, or the signup metric measures reach
rather than demand.

**3. Does "free" have an end date? — No, and it is stronger than that.** Whatever people can use
for free now stays free for them in future. Monetisation will come from **new capabilities added
later**, not from putting today's features behind a paywall.

*Consequence, and it binds every later stage:* **anything shipped during the test-market phase is
permanently free.** Scope decisions from here are revenue decisions. Before P1 ships, it is worth
naming which capabilities are deliberately withheld for later monetisation — otherwise they get
given away by default (A10).

*Worth stating plainly once:* the MCP layer is both the product's differentiator and the most
obviously monetisable thing in it. Committing it to the permanently-free set is a real choice
with real cost. It is also defensible — the differentiator is what drives adoption, and adoption
is what the test-market phase exists to produce. Recorded here so the trade-off is deliberate
rather than discovered later.

*Technically:* no billing in v1, but the data model should not make a future entitlement concept
painful to add. That is a Stage 3 consideration, not a decision to take now.

## 8. Decisions taken in this stage

| Decision | Reason |
|---|---|
| Beachhead = SG/SEA multi-asset professional | Founder is the user; mockups already encode this reality; aggregators serve this market worst |
| Agents get full CRUD, with audit log + undo | MCP clients already confirm each tool call; audit + undo make write access recoverable |
| Remote MCP + OAuth, not pasted tokens | Only path to one-click connection in ChatGPT and Claude; A1 is the top risk, so the setup flow must be as frictionless as possible |
| P1 ships web app + MCP together | Tests the riskiest assumptions first rather than deferring them |
| No LLM in NetNet's own backend | Inference runs on the user's agent subscription; keeps free-tier hosting viable and keeps statements off our servers |
| Free during test-market, with cost ceilings of ~$0 to 100 users and <$50 to 1,000 | Proves demand without a pricing variable confounding the signal, at a running cost the Founder can carry indefinitely |
| Test-market runway is open-ended, so cost ceilings must hold indefinitely | Rules out anything free only for a trial window — it defers an unknown bill to an unknown date |
| Reliability and security do not trade against cost | A failing MCP call destroys trust in the agent integration, which is the product's core bet |
| Success = sign-ups and engagement; failure = kill the app | Gives every phase a single yardstick and an explicit exit, rather than drifting on sunk cost |
| Problem reframed: the problem is AI lacking financial context, not data entry as such | Founder reframe. Frontier models can already advise well; what they lack is where the user stands. Tracking becomes the means, advice the end — which promotes A4 to the premise and adds A11 |
| No user interviews; the market is tested by launching | Founder decision; shifts all validation onto live usage, which makes P1 instrumentation the experiment |
| No waitlist or channel; launch first, promote after | Founder decision; makes distribution an explicit unsolved problem (A9) rather than an assumed one |
| Free stays free: today's capabilities are permanently free, monetisation comes from future additions | Founder decision; means anything shipped in the test-market phase can never be paywalled, so scope is now a revenue decision |
