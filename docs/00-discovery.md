# 00 — Discovery

Status: **approved** · Stage owner: Product researcher

## 1. Problem statement

People want financial advice fitted to their own situation, and frontier AI models can already
give it — well enough for most of what an ordinary person actually decides. What a model cannot do
is know the thing every one of those answers depends on: **where this person actually stands.**

Most people cannot supply that context, because they do not have it. They do not know their net
worth, what they own against what they owe, or how much of it they could touch this month. They
ask a capable model a real question, get a generic answer, and nothing in the exchange tells them
the limit was the input rather than the model.

Assembling that picture is the obstacle, and it is where every existing route fails. Money spread
across brokerages, bank accounts, retirement schemes (CPF), property, vehicles, unvested equity and
crypto has no reliable consolidated picture. The automated tools (Mint-style aggregators, Monarch,
Copilot) are built on bank-feed aggregation, which:

- **cannot see** the assets that dominate such a balance sheet — the house, the car, CPF,
  unvested RSUs, private holdings, foreign accounts;
- **breaks constantly** outside the US, where aggregation coverage is thin to nonexistent;
- optimises for **transactions and budgeting**, not for the stock-take question people actually
  ask: *what am I worth, and is it going up?*

So people fall back to a spreadsheet. The spreadsheet works — it handles any asset, any currency —
but it decays. Updating it means opening ten apps, copying numbers, fixing formulas and converting
currencies by hand. It is a chore with no deadline, so it slips, and a net-worth history with a
two-year gap in it is worth very little.

**Data entry is the obstacle.** Every existing product either automates entry at the cost of
coverage (aggregators), or preserves coverage at the cost of effort (spreadsheets and manual
trackers). Nobody has removed the effort without also narrowing what can be tracked.

### The insight NetNet is built on

An AI agent with access to the user's documents can do the data entry. The user drops a
brokerage statement into ChatGPT or Claude and says "update my net worth"; the agent reads the
numbers and writes them into NetNet. The tedious part is delegated, not automated away — which
means it works for *any* asset, including the ones no bank feed will ever reach.

**And reading is the point.** Once the agent can read the balance sheet, every question the user
asks it is answered against their real position rather than a blank slate — "can I afford this
car?", "how exposed am I to USD?", "am I on track?". NetNet is the context layer that makes those
answers possible. Tracking is the means; better advice is the end. NetNet supplies context and
never generates advice itself (`01-prd.md` §4.2, §8).

## 2. Target user

Three personas, Singapore/SEA first: **`01-prd.md` §2.** SG/SEA comes first because the Founder is
this user (fast, honest validation), because CPF and multi-currency holdings are everyday there, and
because US-centric aggregators serve the region worst.

**Not the user in v1:** budgeters, day traders, people wanting transaction categorisation,
households sharing finances, and anyone needing tax filing.

## 3. Current alternatives, and why they lose

| Alternative | Why people use it | Where it fails this user |
|---|---|---|
| **Spreadsheet (Excel / Google Sheets)** | Total flexibility, free, handles any asset or currency | Updating is manual drudgery; it decays; charts are work; no mobile experience; FX by hand |
| **Aggregators (Monarch, Copilot, Mint-alikes)** | Automatic, polished, low effort | Bank coverage poor outside US; blind to property, CPF, RSUs, private assets; transaction-first, not net-worth-first; subscription |
| **Manual net-worth apps** | Purpose-built, mobile, decent charts | Entry is still fully manual, so they decay too; closed silos with no programmatic access |
| **Brokerage / bank apps** | Accurate and live for that one account | Single-institution by definition; no consolidated picture |
| **Not tracking at all** | Zero effort | The status quo NetNet actually competes with, and the most common one |
| **ChatGPT alone (the primary alternative)** | Conversational, already in hand, gives real advice | No memory of financial state across chats; the user must re-supply everything each time, and cannot, because they do not have it; nothing persists or charts |

**Positioning:** the flexibility of a spreadsheet, without the data entry — because your own AI
agent does the entry for you.

## 4. Riskiest assumptions

Ordered by how much damage a wrong answer does. There is no interview round, so every assumption
is tested by live use of the launched product.

| # | Assumption | If wrong | How it is tested |
|---|---|---|---|
| **A1** | Users will actually **connect** NetNet to their agent. The OAuth connector setup is a real drop-off cliff, and many people have never added a connector. | The differentiator is dead weight; NetNet is just another manual tracker. | Connection rate (M3), time to value (M9); watch testers attempt setup unaided. |
| **A2** | Users will **trust an agent to write** financial data — and trust the numbers it wrote without re-checking every one. | The write path collapses to read-only; the "drop a statement" story is gone. | Write adoption (M4) and correction rate (M5). |
| **A3** | Agent-assisted entry is genuinely **less effort** than the spreadsheet, end to end, including verifying what the agent did. | No reason to switch. | Time both paths, same user, same statement. |
| **A4** | **The premise:** the **advice job** is valued and recurring, not a novelty people try twice. | The reason for building NetNet is gone; what is left is a tracker with an import feature. | Repeat read-only agent queries after week 1 (M7). |
| **A5** | Statement-to-values extraction is **accurate enough** across messy real formats that users don't lose trust after one bad parse. | Trust breaks early and doesn't recover. | Run 10 real statements (SG banks, IBKR, CPF) through an agent and score accuracy; correction rate (M5). |
| **A6** | Consolidated net worth is a **recurring** need (monthly-ish), not an annual curiosity. | Retention floor is very low regardless of execution quality. | Week-4 return (M6). |
| **A7** | People will hand **complete net-worth data** to a new, unknown, free product from a solo founder. | Signups stall at the trust barrier. | Signups with ≥3 holdings within 7 days (M2). |
| **A8** | Free attracts real users, not just tyre-kickers, and monetisation can follow later. | Demand signal is noise. | Judge by depth of use (holdings added, return visits), never by signup count. |
| **A9** | **Distribution is solvable after launch.** There is no waitlist, audience or channel. | The product can be excellent and still get no signups — indistinguishable from "no demand". | Distribution is v1 work with its own metrics (PRD §3.4, M10). |
| **A10** | Enough of the product's value can stay free permanently that **future capabilities alone** can carry monetisation. | Nothing left to charge for that people want more than what they already have free. | The reserved-capability list (PRD §4.2), decided before anything ships free by accident. |
| **A11** | Advice grounded in the user's real numbers is **noticeably better** than generic advice — and the user can tell the difference. | The context layer is effort nobody is rewarded for; users go back to asking the model directly. | Repeat queries after week 1 (M7); whether users keep the picture current for the answers' sake (M8). |
| **A12** | The app is **worth using before an agent is connected**. | P-A churns before the experiment reaches them. | Standalone value (M11); PRD §2.2. |
| **A13** | NetNet + agent **beats the same data uploaded as a spreadsheet**, even on a weak model. | The context layer adds nothing; NetNet is a nicer spreadsheet. | Context lift benchmark (M12); PRD §2.4. |
| **A14** | A **gentle monthly nudge** brings drifted-away people back. | The reminder stays (it is free and gentle); return is sought elsewhere. | Comeback rate per channel (M13); PRD J12. |

**A4 and A11 are the premise:** if grounded advice is not worth the assembly, A1 and A2 do not
matter. They only read out once users are connected, though, which is why the build order still
starts with connection and trust.

**The sharpest product risk is A1 + A2 together.** The premise needs the user to clear a setup
hurdle *and* extend trust to an agent with write access. Either one failing takes the wedge with
it. This is why P1 ships both the web app and the MCP layer.

**The sharpest business risk is A9.** A product nobody sees produces the same reading as a product
nobody wants, and the kill criterion cannot tell them apart. Distribution is planned as work, not
hoped for.

**Non-obvious risk worth naming:** the agent writes *through* an LLM the Founder does not control.
A mis-parsed statement produces a plausible-looking wrong number in the user's net worth. The audit
log and undo are not polish — they are what makes agent write access defensible.

## 5. Business constraints

Founder-set constraints on the business: the yardstick every stack and scope choice is measured
against.

**Purpose.** Launch as a **real production app** to test market demand. Not a prototype, not a
private beta: a live product that real users trust with real financial data. No interview round
and no waitlist: launch first, then promote.

**Go-to-market.** **Web app first**, on the Founder's custom domain. **Native iOS/Android is
planned**, not hypothetical: web and native share one backend and one API.

**Pricing.** **Completely free** during the test market: no billing, no paywall, no tiers. Whatever
people can use free stays free for them permanently; monetisation comes only from **capabilities
added later** (PRD §4.2). No billing in v1, but the data model must not make a future entitlement
concept painful to add.

**Cost ceilings.** They must hold **indefinitely**, because the runway is undefined (a month, a
quarter or a year). Anything free only for a trial window (introductory credits, 3-month trials,
promotional tiers) does not satisfy them: it defers an unknown bill to an unknown date.

| Users | Monthly running cost |
|---|---|
| 0–100 | ≈ $0 |
| 100–1,000 | < $50 |
| > 1,000 | Exit test-market phase; work out the business model |

**Quality floor — does not trade against cost.** The app must be reliable and secure at all times.
Cheap-but-flaky is a failed outcome. This bites hardest on the agent-facing surface: an **MCP call
that fails mid-task teaches the user the integration cannot be trusted**, and that is the product's
core bet (A1, A2).

**Success and kill.** The outcome to drive is **sign-ups and engagement**. If NetNet cannot get
people to sign up and keep using it, the app is killed and the Founder moves on. Every phase is
judged on whether it moves those two numbers (PRD §3).
