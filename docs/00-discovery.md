# 00 — Discovery

Status: awaiting Founder approval · Date: 2026-09-22 · Stage owner: Product researcher

## 1. Problem statement

People with **multi-asset, multi-currency wealth** have no reliable picture of their net worth.
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
reason the agent is useful. And once the agent can also *read* the balance sheet, a second job
appears that no tracker serves today — "I'm thinking of buying a car, can I afford it?" answered
against the user's real financial position rather than generic advice.

## 2. Target user

**Primary (beachhead): the multi-asset professional in Singapore / SEA.**

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

**Secondary (later): global FIRE / net-worth trackers** — the same behaviour, larger market,
more competition. Reachable once the core works, without changing the product.

**Explicitly not the user in v1:** budgeters, day traders, people wanting transaction
categorisation, households sharing finances, anyone needing tax filing.

## 3. Current alternatives, and why they lose

| Alternative | Why people use it | Where it fails this user |
|---|---|---|
| **Spreadsheet (Excel / Google Sheets)** | Total flexibility, free, handles any asset or currency | Updating is manual drudgery; it decays; charts are work; no mobile experience; FX by hand |
| **Aggregators (Monarch, Copilot, Mint-alikes)** | Automatic, polished, low effort | Bank coverage poor outside US; blind to property, CPF, RSUs, private assets; transaction-first, not net-worth-first; subscription |
| **Manual net-worth apps** | Purpose-built, mobile, decent charts | Entry is still fully manual, so they decay too; closed silos with no programmatic access |
| **Brokerage / bank apps** | Accurate and live for that one account | Single-institution by definition; no consolidated picture |
| **Not tracking at all** | Zero effort | The status quo NetNet actually competes with, and the most common one |
| **ChatGPT alone** | Conversational, already in hand | No memory of financial state across chats; re-supply everything each time; nothing persists or charts |

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
| **A4** | The **advice job** ("can I afford this car?") is valued, not a novelty people try twice. | NetNet is a tracker with an import feature — thinner, but still viable. | Track repeat read-only agent queries in week 2+, not week 1. |
| **A5** | Statement-to-values extraction is **accurate enough** across messy real formats that users don't lose trust after one bad parse. | Trust breaks early and doesn't recover. | Run 10 real statements (SG banks, IBKR, CPF) through an agent and score accuracy. |
| **A6** | Consolidated net worth is a **recurring** need (monthly-ish), not an annual curiosity. | Retention floor is very low regardless of execution quality. | Interview for last-checked recency and frequency. |
| **A7** | People will hand **complete net-worth data** to a new, unknown, free product from a solo founder. | Signups stall at the trust barrier. | Ask directly in interviews; watch whether signups add >3 holdings. |
| **A8** | Free-forever-for-now attracts real users, not just tyre-kickers, and monetisation can follow later. | Demand signal is noise. | Judge by depth of use (holdings added, return visits), never by signup count. |

**The sharpest risk is A1 + A2 together.** The premise needs the user to clear a setup hurdle
*and* extend trust to an agent with write access. Either one failing takes the wedge with it.
This is why P1 ships both halves — the web app and the MCP layer — rather than deferring the
agent work: the riskiest assumption should be tested first, not last.

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

Ten questions for 5–8 people matching the target user. Ask about the past, not the future;
never pitch NetNet before question 9.

**Current behaviour**
1. Walk me through the last time you worked out your total net worth. What did you actually do?
2. When was that? What prompted it — a decision, a date, something else?
3. Where does it live right now? Show me, if you're willing.
4. Which of your assets are the annoying ones to get a number for, and why?

**Pain**
5. What's the longest it's gone without updating? What made you come back to it?
6. If it were always current and correct, what would you do with it that you can't today?
7. What have you tried and abandoned? What made you stop?

**Money and trust**
8. Have you ever paid for a tool like this? What happened?
9. You already use ChatGPT/Claude. How would you feel about giving it access to read your full
   financial position? What about letting it *write* to it?
10. What would a new financial app have to do — or not do — before you'd put your real numbers
    in it?

Close with: *"Who else should I talk to?"*

## 7. Open questions for the Founder

1. **Is the interview round happening?** The mockups and stated vision are strong enough to
   proceed on Founder conviction alone, but then A1/A2 stay untested until P1 is live in
   front of real users. Both are legitimate; they differ in where the risk sits.
2. **Is there a waitlist, audience, or channel** for the first 20 users, or does distribution
   need to be solved as its own problem?
3. **Does "free" have a stated end date?** It affects early messaging and whether users feel
   baited later.

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
