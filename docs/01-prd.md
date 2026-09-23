# 01 — Product Requirements (PRD)

Status: **approved by the Founder 2026-09-23** · Stage owner: Product manager
Inputs: `docs/00-discovery.md` (approved 2026-09-23, §1/§3/§4 revised on the Founder's reframe of
the same date), `docs/reference/mockups/README.md`

> Longer than the workflow's "~2 pages" because the acceptance criteria (§6) are the contract
> Stage 4 plans against and Stage 6 tests against, one set per job. §§1–5 and 7–9 are the lean
> part; skim §6 unless you are checking a specific job.

---

## 1. Problem

People want financial advice fitted to their own situation. Frontier AI models can already give
it — well enough for most of what an ordinary person actually decides. What the model cannot do
is know the thing every one of those answers depends on: **where this person actually stands.**

Most people cannot supply that context, because they do not have it. They do not know their net
worth, what they own against what they owe, or how much of it they could touch this month. So
they ask a capable model a real question and get a generic answer — and nothing in the exchange
tells them the limit was the *input*, not the model.

Assembling the picture is the obstacle, and every existing route to it fails this user:
aggregators automate entry but cannot see the assets that dominate the balance sheet (property,
CPF, vehicles, unvested equity, foreign and private holdings) and break outside the US;
spreadsheets cover everything but decay, because maintaining one is manual drudgery with no
deadline. Talking to ChatGPT directly works once — and then the context is gone, and the next
question starts from nothing.

**NetNet is the context layer.** The user's own AI agent helps assemble and organise their
financial position, keeps it current by doing the data entry, and reads it back through a
comprehensive MCP layer so every question they ask is answered against their real balance sheet
instead of a blank slate. Tracking is the means. Better advice is the end.

The wedge is unchanged by that framing: entry is still what makes the context exist, and
delegating it to an agent is still what makes coverage unlimited. What changes is the hierarchy —
the tracker exists to feed the advice, not the other way round. Detail: `00-discovery.md` §1.

## 2. Target user

**Vision: broad.** Anyone whose AI could advise them better if it knew where they stood — which is
most people (§1).

**Beachhead: narrow, chosen for one reason — it needs no education.** The Founder's criterion is
financial literacy: target people who already understand why a current picture of their position is
worth keeping, so the product never has to teach that. Educating a market is the slow, expensive
problem, and the test-market phase deliberately does not attempt it.

So the first user is the **financially engaged multi-asset tracker, SG/SEA first**: net worth
~S$300K–5M, 5–20 holdings across ≥2 currencies including CPF, reviews position monthly or
quarterly, already keeps a spreadsheet, already pays for ChatGPT or Claude. Detail:
`00-discovery.md` §2.

Expansion ladder, ordered by education cost rather than size:

| # | Segment | Education needed | Why this order |
|---|---|---|---|
| 1 | SG/SEA multi-asset professional | **None** | Founder is this user; CPF and multi-currency are already the mockups' reality; aggregators serve this market worst |
| 2 | Global FIRE / net-worth trackers | **None** | Already track deliberately; same product, same behaviour, larger market, more competition |
| 3 | Financially engaged, simpler holdings (one currency, few assets) | Low | Understand the value but need less of the product; may find it heavy |
| 4 | The broad market who do not know what they are worth | **High** | Must first be convinced this matters, and need guided assembly, not just faster entry |

Step 4 is the vision in §1 and is deliberately deferred. v1's guided starting categories (J1) are
the on-ramp for it, kept cheap — not a campaign to win it.

**Consequence for the pitch (G-D1, G-D3).** The beachhead *does* roughly know what they are worth;
their picture exists and is merely stale. The mass-market line — "you don't know your net worth" —
does not describe them and will read as condescending. Their version of the problem is: *your
numbers are real but stale, and trapped somewhere your AI cannot read, so the advice you get is
generic.* Landing copy and the launch note are written for that, not for §1's broader framing.

**Trade-off worth naming:** literacy cuts the education cost and raises the trust bar. This audience
asks where the data lives, whether it is sold, and what happens on deletion — *before* signing up
(A7). That makes J10 (export and delete) and N4 (isolation) go-to-market features here, not
compliance chores.

## 3. Goals & success metrics

### 3.1 What v1 exists to prove

Three things, in this order:

1. **The premise (A4, promoted).** Grounded advice is worth assembling the data for — users come
   back and ask their agent about their position again, not once.
2. **A1 — users will connect their agent.** Without a connection there is no context layer at
   all, only a tracker.
3. **A2 — users will trust an agent to write** financial data, which is what keeps the picture
   current enough to be worth reading.

No interviews are happening; live usage is the only test.

### 3.2 Success metrics

Window: **8 weeks from public launch** unless stated. "Signup" = verified account.

| # | Metric | Definition (as instrumented) | Target | A miss means |
|---|---|---|---|---|
| **M1** | Signups | Verified accounts created | **100** | Distribution failed (A9) or the pitch does not land |
| **M2** | Picture assembled | % of signups with ≥3 holdings within 7 days | **50%** | People will not hand over real data (A7), so no context exists |
| **M3** | **Agent connection rate** | % of signups completing OAuth from an MCP client within 14 days | **40%** | **A1 is wrong** — the context never reaches an agent |
| **M4** | Agent write adoption | % of connected users with ≥1 successful write tool call; median ≥5 writes/user/month | **70%** | **A2 is wrong** — the picture will go stale again |
| **M5** | Correction rate | % of agent-written values edited or undone within 48h | **<10%** (>25% = failing) | Extraction accuracy is breaking trust (A5) |
| **M6** | Return rate | % of signups with any activity (web or agent) in calendar week 4 | **30%** | Not a recurring need for them (A6) |
| **M7** | **Advice pull** (headline) | % of connected users making ≥1 read-only agent query **after** week 1; and median ≥3 such queries/user/month | **50%** | **The premise is wrong** — grounded advice was a novelty (A4) |
| **M8** | Freshness | Median days since last value update, across users active in the last 30 days | **<45 days** | The context is too stale to answer from |
| **M9** | Time to value | p50 minutes from signup to first agent interaction (read or write) | **<15 min** | Setup is the cliff A1 predicts (M9 is the funnel, not the outcome) |
| **M10** | Funnel conversion | Landing-page unique visitors → signup | **≥8%**, on ≥1,200 visits | The pitch, not the product, is the blocker |

### 3.3 Kill criteria

The product is killed if it cannot get signups and engagement. Concretely, after the 8-week
window: **M1 < 25 signups, or M3 < 15%, or M7 < 20%, or M6 < 10%.** Any one is a kill reading —
provided §3.5 instrumentation and the §3.4 distribution assets were actually delivered. A missing
experiment is not evidence.

### 3.4 Distribution goal (A9)

Signups are the kill metric and there is no channel yet, so distribution ships as product work:

- **G-D1** A public landing page that states the problem in one screen **in the beachhead's terms**
  (§2) — *your numbers are stale and your AI can't read them, so the advice you get is generic* —
  and shows an agent answering a real question from a real balance sheet (screen recording, no
  audio, no real data).
- **G-D2** NetNet listed wherever MCP clients and users discover connectors (client connector
  directories, public MCP registries and lists).
- **G-D3** A launch note the Founder can post, without rewriting it, to 3+ communities of people
  who are **already financially literate** (§2). The targeting criterion is literacy, not reach: a
  smaller audience that needs no education converts better than a larger one that does.
- **G-D4** Landing and signup-funnel analytics live before launch, so M10 is readable.

Channel selection and posting are Founder work; producing G-D1–G-D4 is in v1 scope.

### 3.5 Instrumentation requirement — this *is* the experiment

Analytics ranks with the MCP layer as a P1 deliverable. Without these events the launch produces
no evidence and §3.3 cannot be applied. Minimum event set:

`landing_view` · `signup_started` · `account_created` · `holding_created {source: web|agent}` ·
`value_recorded {source}` · `agent_connection_started {client}` ·
`agent_connection_completed {client}` · `agent_connection_failed {step, client}` ·
`agent_tool_called {tool, kind: read|write, outcome, latency_ms, client}` ·
`value_corrected {original_source, age_at_correction}` · `value_undone` ·
`session_started` · `insights_viewed {view: monthly|quarterly|yearly}` · `reminder_sent` ·
`reminder_clicked` · `account_deleted`

`kind: read|write` is what makes M7 separable from M4 — without it the premise is unmeasurable.
`client` is what makes M3 separable by MCP client — without it, one client's broken connector flow
reads identically to A1 being wrong, which is the most expensive misreading available here (§9.4).

**Privacy constraint (binding):** events carry names, counts, timings and a user id only. Never
amounts, holding names, or any document content. A metrics pipeline that leaks the balance sheet
is a security incident, not a trade-off.

## 4. Scope

### 4.1 In scope for v1

Assemble and maintain a financial position: any asset or liability, user-defined types and tags,
any currency, dated value history, archive · net worth total with trend, breakdown by type,
assets-vs-liabilities, and a user-chosen comparison baseline · **an Insights view of change by
calendar period (monthly, quarterly, yearly) with its own filters and exclusions** · staleness
labels and email reminders · **a comprehensive MCP layer with full CRUD, plus read tools shaped for advice, reached
by OAuth from ChatGPT or Claude** · audit log and undo for every agent write · export and account
deletion · the §3.5 analytics · the §3.4 distribution assets. Mobile-first responsive web, one API
that native clients reuse later.

**Note for Stage 4:** Insights is the one item here that does not serve §3.1, so it should be
sequenced *after* the MCP layer and the §3.5 analytics within P1. Not a hedge on shipping it — it
ships at launch — but if anything in P1 slips, the slip must be visible against the launch date
rather than quietly eating the work the experiment depends on.

### 4.2 Permanently free, and what is deliberately reserved (A10)

Everything in §4.1 is free and **stays free for those users forever** — including unrestricted MCP
read *and* write, uncapped. That is a deliberate cost: the context layer is what drives adoption,
and adoption is what this phase exists to produce.

Reserved for later monetisation — **not** built in v1, so they are not given away by default:

| Reserved capability | Why it is the monetisable side |
|---|---|
| Automated market-price and FX refresh for listed holdings | Removes even the agent from the loop; ongoing per-user data cost |
| Server-initiated / scheduled agent updates | Needs our compute, not the user's subscription |
| NetNet-generated forecasting and scenario planning | See the note below |
| Tax, CGT and year-end reporting produced by NetNet | High willingness to pay, jurisdiction-specific |
| Multi-entity, household or advisor-shared portfolios | Seat-shaped by nature |
| Document vault / statement history | Storage cost, and v1 deliberately never receives documents |
| Threshold alerts and push notifications | Infrastructure cost per user |

**Where the line falls, now that Insights ships free (§4.1):** *backward-looking* analysis of data
the user already has is free and in v1 — totals, trends, period-by-period change, breakdowns.
*Forward-looking* projection built by NetNet is reserved. That is the boundary; it is not "charts
are free, better charts are paid", which would be unholdable.

**Not a contradiction of §1:** the user's *agent* may project, model scenarios and reason about tax
from the read tools — that is the whole point, and it is free and uncapped. What is reserved is
NetNet building those features itself. NetNet supplies context; the agent supplies advice.

## 5. Core user jobs

Ordered by what the product is for. J8 is the outcome; J1–J7 exist to make it possible; J9–J10
keep it trustworthy.

| # | The user wants to… | Serves |
|---|---|---|
| **J8** | **ask their agent questions answered against their real position** | **The premise (A4), M7** |
| **J5** | connect their AI agent to NetNet in one flow | **A1**, M3, M9 |
| **J6** | have the agent assemble and maintain the picture from statements or conversation | **A2/A3/A5**, M4 |
| **J1** | get a first real picture within minutes of signing up | M1, M2, A7 |
| **J2** | track any asset or liability, any currency, their own types and tags | Coverage |
| **J3** | record what something is worth today, and correct history | Snapshot model |
| **J4** | see whether they are going up, against a baseline they choose | A6, M6 |
| **J11** | see how each month, quarter and year actually went, and what drove it | A6, M6 |
| **J7** | see exactly what the agent changed, and undo it | A2, M5 |
| **J9** | be nudged before the picture goes stale | M8 |
| **J10** | export everything and delete the account | A7 |

## 6. Acceptance criteria

Given/When/Then, one set per job. Presented in J-number order for reference; §5 gives priority.

### J1 — A first real picture, fast
- **Given** a visitor on the landing page, **when** they sign up with email or a social provider,
  **then** an account exists and they land on an empty Home with one obvious next action, and no
  onboarding wizard to clear first.
- **Given** an empty account, **when** the user adds one holding with a value, **then** Home shows
  a net-worth total equal to that value with the holding listed under it.
- **Given** a user who does not know what to list, **when** they view the empty state, **then**
  they are offered starting categories relevant to this market (cash, CPF, property, vehicle,
  investments, loans) as one-tap starting points they can rename or ignore — suggestions, not a
  fixed chart of accounts.
- **Given** the empty state, **when** the user would rather delegate assembly, **then** connecting
  an agent (J5) is offered there as a first-class alternative to typing, not buried in settings.
- **Given** any signup attempt, **when** it succeeds or fails, **then** `signup_started` /
  `account_created` fire with no amounts attached.
- **Given** an unverified email, **when** the user uses the app, **then** they can — but agent
  connection (J5) requires verification first.

### J2 — Track anything
- **Given** the Add flow, **when** the user creates an asset, **then** they can set name, type,
  tags, currency and an opening value with a date; only name, type, currency and value are
  required.
- **Given** the Add flow, **when** the user creates a **liability**, **then** it contributes
  negatively and net worth = assets − liabilities.
- **Given** a holding, **when** it is created or edited, **then** the user can mark how accessible
  it is (readily accessible / illiquid / locked, e.g. CPF or unvested equity), defaulting
  sensibly by type — this is what stops J8 answering "can you afford it" off money the user cannot
  touch.
- **Given** a currency other than the user's default, **when** a value is saved, **then** the entry
  stores the original amount and currency *and* the default-currency conversion with the rate and
  rate date used, both visible on the value row.
- **Given** the user's own taxonomy, **when** they add, rename, merge or delete a type or tag,
  **then** existing holdings follow the change and nothing is orphaned.
- **Given** a holding no longer held, **when** the user archives it, **then** it leaves all totals
  and charts but keeps its history and can be unarchived.
- **Given** a delete, **when** confirmed, **then** the holding and its history are removed and the
  action appears in the audit log (J7).

### J3 — Record and correct values
- **Given** a holding, **when** the user adds a value with a date, **then** it joins the dated
  series, the latest-by-date value drives the total, and back-dated entries are accepted.
- **Given** a value row, **when** the user edits amount, date or currency, **then** history, totals
  and charts recompute and the edit is recorded in the audit log.
- **Given** two values on one holding with the same date, **when** saved, **then** the system
  resolves deterministically (last written wins) and warns, rather than silently double-counting.
- **Given** any value change, **when** saved, **then** `value_recorded` or `value_corrected` fires
  with `source` set to `web` or `agent`.

### J4 — See the picture
- **Given** holdings with history, **when** the user opens Home, **then** they see total net worth
  in their default currency, a trend line, a breakdown by type, and an assets-vs-liabilities split.
- **Given** a comparison baseline (Initial value / Last update / Last month / Last quarter / Jan 1 /
  Last year), **when** selected, **then** every change figure and percentage on screen is relative
  to it and the baseline in force is labelled.
- **Given** a holding, **when** opened, **then** the user sees its own trend, its change over the
  selected period, and its full history newest-first.
- **Given** sort and filter controls, **when** the user sorts by value, name, change or last
  updated, or filters by type or tag, **then** list and totals reflect the filtered set and the
  active filter is visible.
- **Given** a phone-width viewport, **when** any of the above is used, **then** it is fully usable
  without horizontal scrolling — mobile-first is the primary case, not a fallback.

### J5 — Connect the agent (A1)
- **Given** a verified account, **when** the user opens Connect your agent, **then** they get
  per-client instructions (ChatGPT, Claude) and the connector URL, with no token to generate,
  paste or store.
- **Given** the user starts the connection in their MCP client, **when** they authorise NetNet,
  **then** OAuth completes, the client lists NetNet's tools, and NetNet shows the connection as
  active with client name and time.
- **Given** a connection attempt, **when** it fails at any step (discovery, authorise, callback,
  first call), **then** `agent_connection_failed {step, client}` fires and the user sees a plain-language
  cause and a retry, not a raw error.
- **Given** an active connection, **when** the user revokes it in NetNet, **then** later calls from
  that client are rejected and the revocation is in the audit log.
- **Given** the whole flow, **when** measured, **then** p50 signup → first agent interaction is
  under 15 minutes (M9), with each funnel step separately readable.

### J6 — The agent assembles and maintains the picture (A2/A3/A5)
- **Given** a connected agent, **when** it calls the MCP layer, **then** it can do everything the
  web UI can: list, create, update, archive and delete holdings; read and write values; read and
  manage types, tags and accessibility; read net worth and history — no UI-only capability.
- **Given** a user who has never listed their finances, **when** they describe them to their agent
  in conversation ("I have about 40k in DBS, a flat, some CPF, an IBKR account"), **then** the
  agent can create the holdings, types and tags to match — assembly is a conversation, not only a
  document parse.
- **Given** the user drops a statement into their agent and asks it to update NetNet, **when** the
  agent writes, **then** the values appear in the web app tagged as agent-written with the client
  name.
- **Given** an agent write that would duplicate a holding already tracked, **when** the tool is
  called, **then** the layer surfaces the likely match so the agent can update rather than
  duplicate.
- **Given** a malformed or out-of-range call, **when** received, **then** it is rejected with an
  error specific enough for the agent to correct itself, and nothing is partially written.
- **Given** any tool call, **when** it completes, **then** `agent_tool_called {tool, kind, outcome,
  latency_ms}` fires; writes also fire the J3 events with `source: agent`.

### J7 — Verify and undo (what makes agent writes defensible)
- **Given** agent activity, **when** the user opens the audit log, **then** they see every change
  newest-first with what changed, old → new, which client did it and when — web changes in the
  same log.
- **Given** a log entry, **when** the user undoes it, **then** the previous state is restored
  exactly, the undo is itself logged, and totals recompute.
- **Given** a batch of writes from one agent turn, **when** the user undoes the batch, **then**
  every change in that turn reverts together, not row by row.
- **Given** a value the agent wrote, **when** the user corrects it, **then** `value_corrected`
  fires with `original_source: agent` and the value's age at correction (M5).

### J8 — Advice grounded in my real position (the premise)
- **Given** a connected agent, **when** the user asks a question about their finances ("can I
  afford a S$120K car?", "how exposed am I to USD?", "am I on track?"), **then** the agent can read
  current net worth, per-holding values, type and tag breakdowns, history over any period, currency
  exposure, and **how accessible each holding is** — enough to answer from the user's real position
  without them re-supplying anything.
- **Given** a typical question, **when** the agent gathers context, **then** one summary call
  returns enough to answer without a long chain of round-trips — context assembly must not be so
  slow or chatty that the agent works around it.
- **Given** read responses, **when** returned, **then** each value carries an as-of date and its
  staleness, and the response conveys how complete the picture is, so the agent can qualify an
  answer built on two-year-old or partial numbers instead of stating it confidently.
- **Given** a read-only question, **when** the agent answers, **then** nothing in NetNet is
  modified.
- **Given** read queries, **when** they occur after the user's first week, **then** they are
  countable separately from writes (M7).

### J9 — Keep the context current (M8)
- **Given** a holding not updated for longer than its expected cadence, **when** the user views it,
  **then** it is labelled with how long it has been stale, on both list and detail.
- **Given** stale holdings, **when** the reminder schedule comes due, **then** NetNet emails a
  reminder naming how many holdings are stale, with a link, and `reminder_sent` fires.
- **Given** reminder settings, **when** the user changes cadence or opts out, **then** it is
  honoured — no email after opt-out, ever.

### J10 — Own the data (A7)
- **Given** an account, **when** the user exports, **then** they receive a complete
  machine-readable file (holdings, types, tags, accessibility, full value history with currencies
  and rates) they could rebuild a spreadsheet from.
- **Given** an account, **when** the user deletes it, **then** all their data is erased within a
  stated window, they are told what that window is, and `account_deleted` fires.
- **Given** any screen or API response, **when** produced, **then** it contains no other user's
  data — verified by test, not by inspection.

### J11 — Insights: how each period actually went
> Specified from `reference/mockups/README.md` alone; the Insights frames are not in the repo.
> Stage 2 must review the real frames with the Founder before building — the behaviour below is
> the contract, the visual and interaction detail is not yet settled.

- **Given** holdings with value history, **when** the user opens Insights, **then** they can switch
  between **Monthly, Quarterly and Yearly** views, each listing net-worth change per calendar
  period — period-end value, absolute change and % change — newest period first.
- **Given** a period in any view, **when** the user opens it, **then** they see which holdings drove
  that period's change, ranked by contribution, in their default currency.
- **Given** Insights Filters, **when** the user filters by type or tag, **then** every figure in the
  view recomputes over the filtered set only and the active filter is visible.
- **Given** the Insights **"Don't Show" exclusion list** (which Home's filter does not have),
  **when** the user excludes a holding, type or tag, **then** it is dropped from Insights figures
  **without** changing Home totals or net worth, and the exclusion persists across sessions until
  cleared.
- **Given** a user with less history than the selected view needs — fewer than two periods carrying
  data, which is the normal case for most users in the first weeks after launch — **when** they open
  that view, **then** they see the periods they do have plus a plain statement of what is needed for
  a comparison: never an empty grid, a fabricated 0% row, or an axis with one point.
- **Given** values added with past dates after the fact, **when** Insights is opened, **then** the
  affected periods recompute — periods derive from **value dates**, never from when the entry was
  made.
- **Given** a holding with no value recorded inside a period, **when** that period is computed,
  **then** its last known value before the period end is carried forward, and the view marks the
  figure as carried rather than observed.
- **Given** holdings in several currencies, **when** a period's change is computed, **then** it uses
  each entry's recorded default-currency conversion (J2), so a period's change is not distorted by
  FX that moved after the fact.
- **Given** a phone-width viewport, **when** any Insights view is used, **then** it is fully usable
  without horizontal scrolling.
- **Given** any Insights view, **when** it is opened, **then** `insights_viewed {view}` fires.

## 7. Non-functional requirements

| # | Requirement | Why |
|---|---|---|
| **N1** | MCP tool-call success rate ≥99.5%; p95 tool latency <1.5s | A failing call teaches the user the context layer cannot be trusted — the core bet |
| **N2** | No LLM inference in NetNet's backend; documents are never uploaded to NetNet | Cost stays near zero, documents stay off our servers, and advice stays the agent's job (§1) |
| **N3** | Every write, from web or agent, is auditable and reversible | Makes agent write access recoverable rather than irreversible |
| **N4** | Data isolation per user, enforced at the data layer and covered by tests | Financial data; one leak ends the product |
| **N5** | Secrets in environment variables only; none in the repo | Non-negotiable (CLAUDE.md) |
| **N6** | Running cost ≈$0 to 100 users, <$50/month to 1,000, holding **indefinitely** — no trial-window free tiers | Open-ended runway (`00-discovery.md` §5) |
| **N7** | Mobile-first responsive; one API serving web now and native later | Native iOS/Android is planned, not hypothetical |
| **N8** | Reliability and security never trade against cost | Founder constraint; cheap-but-flaky is a failed outcome |
| **N9** | Analytics carries no financial values (§3.5) | The metrics pipeline must not become the leak |

## 8. Non-goals for v1

Budgeting, transaction feeds and categorisation · bank-feed aggregation of any kind · **income and
expense tracking** (see the risk below) · tax filing or NetNet-produced tax reporting · shared
household or advisor access · native iOS/Android apps · **an in-app AI chat or assistant, and any
advice generated by NetNet itself** — the agent is the user's own, running on their subscription
(N2) · automatic price or FX refresh (§4.2) · document upload or storage · NetNet-built forecasting
· billing, plans or entitlements · **financial-literacy education — explainers, coaching, "what is
net worth" content** (the beachhead in §2 exists precisely to avoid that cost; teaching the broad
market is a later and separate problem) · the mockups' Pro tier, legacy trend-graph toggles and
haptics.

**Named risk in that list:** a balance sheet answers "what am I worth" and "can I afford this from
what I hold". It does not answer "can I afford this from what I earn", which needs cash flow. v1
draws the line at the balance sheet deliberately — it is the part nobody has — but if M7 comes back
strong with users asking affordability questions, income and expenses is the first candidate to
reconsider, and it is currently neither in scope nor reserved.

## 9. Decisions taken at the gate

Approved by the Founder 2026-09-23. All four open questions were taken as recommended; earlier in
the same session the Founder resolved audience breadth (§2) and overrode the recommendation to
defer Insights (§4.1, J11).

1. **Metric targets and kill thresholds stand as written** (§3.2, §3.3), with advice pull (M7 ≥50%,
   kill <20%) as a headline metric alongside signups, connection rate and week-4 return.
2. **Reserved capability list confirmed** (§4.2): unlimited MCP read and write is permanently free,
   NetNet never generates advice itself, and the free/reserved line is backward-looking analysis
   free, forward-looking projection reserved.
3. **Accessibility is a first-class holding attribute** (readily accessible / illiquid / locked),
   defaulting by type — so J8 never answers "can I afford this" off CPF, home equity or unvested
   equity.
4. **Claude is the launch-blocking MCP client**, ChatGPT a dated fast-follow, both counting toward
   M3; the server is built to the standard remote-MCP + OAuth spec with no client-specific
   branching. The instrumentation amendment this depends on is **applied**: `{client}` now rides on
   `agent_connection_started`, `agent_connection_completed`, `agent_connection_failed` and
   `agent_tool_called` (§3.5). Stage 3 must verify each client's current connector requirements
   (paid tier, developer mode) before the architecture locks, since those cap M3's realistic
   ceiling and change faster than any of us will remember.

**Assumption taken, flag if wrong:** FX for web-entered values uses a free daily reference rate at
entry time only, recorded on the entry, never a background refresh of past entries (§4.2 reserves
automated refresh). Exact source is a Stage 3 choice.

**Carried into Stage 2:** J11's behaviour is specified from the mockups README alone — the Insights
frames have never been seen. Review them with the Founder before building.
