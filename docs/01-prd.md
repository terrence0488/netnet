# 01 — Product Requirements (PRD)

Status: awaiting Founder approval · Date: 2026-09-23 · Stage owner: Product manager
Inputs: `docs/00-discovery.md` (approved 2026-09-23), `docs/reference/mockups/README.md`

> This PRD is longer than the workflow's "~2 pages" because the acceptance criteria (§6) are the
> contract Stage 4 and Stage 6 work from, one set per story. Sections 1–5 and 7–9 are the lean
> part; skim §6 unless you are checking a specific job.

---

## 1. Problem

People with multi-asset, multi-currency wealth have no current picture of their net worth.
Aggregators automate entry but cannot see the assets that dominate this balance sheet (property,
CPF, vehicles, unvested equity, foreign and private holdings) and break outside the US.
Spreadsheets cover everything but decay, because updating them is manual drudgery with no
deadline. **The problem is data entry, not tracking.**

NetNet's wedge: the user's own AI agent does the entry. Drop a statement into ChatGPT or Claude,
the agent writes the values into NetNet through a comprehensive MCP layer. Effort is delegated
rather than automated away, so coverage is never narrowed. Full detail: `00-discovery.md` §1.

## 2. Target user

The multi-asset professional in Singapore / SEA: net worth ~S$300K–5M, 5–20 holdings across ≥2
currencies including CPF, reviews position monthly or quarterly, already keeps a stale
spreadsheet, already pays for ChatGPT or Claude. Detail and secondary segments: `00-discovery.md`
§2.

## 3. Goals & success metrics

### 3.1 What v1 exists to prove

Two assumptions, in this order: **A1 — users will connect their agent** (OAuth setup is a
drop-off cliff) and **A2 — users will trust an agent to write financial data**. No interviews are
happening; there is no other test. Everything else in v1 is in service of producing a clean
reading on those two.

### 3.2 Success metrics

Measurement window: **8 weeks from public launch**, unless stated. "Signup" = verified account.

| # | Metric | Definition (as instrumented) | Target | A miss means |
|---|---|---|---|---|
| **M1** | Signups | Verified accounts created | **100** | Distribution failed (A9) or the pitch does not land |
| **M2** | Activation depth | % of signups with ≥3 holdings within 7 days | **50%** | People look but will not hand over real data (A7) |
| **M3** | **Agent connection rate** | % of signups completing OAuth from an MCP client within 14 days | **40%** | **A1 is wrong** — the differentiator is dead weight |
| **M4** | Agent write adoption | % of connected users with ≥1 successful write tool call; and median ≥5 writes/user/month | **70%** | **A2 is wrong** — the write path collapses to read-only |
| **M5** | Correction rate | % of agent-written values edited or undone by the user within 48h | **<10%** (>25% = failing) | Extraction accuracy is breaking trust (A5) |
| **M6** | Return rate | % of signups with any activity (web session or agent call) in calendar week 4 | **30%** | Net worth is not a recurring need for them (A6) |
| **M7** | Advice job pull | % of connected users making ≥1 read-only agent query after week 1 | **40%** | The advice job is a novelty, not a job (A4) |
| **M8** | Freshness | Median days since last value update, across users active in the last 30 days | **<45 days** | The decay problem is not actually solved |
| **M9** | Setup friction | p50 minutes from signup to first agent-written value | **<15 min** | Setup is the cliff A1 predicts |
| **M10** | Funnel conversion | Landing-page unique visitors → signup | **≥8%**, on ≥1,200 visits | The pitch, not the product, is the blocker |

### 3.3 Kill criteria

Per Founder constraint: the product is killed if it cannot get signups and engagement. Concretely,
after the 8-week window: **M1 < 25 signups, or M3 < 15%, or M6 < 10%.** Any one of those is a kill
reading, provided §3.5 instrumentation and the §3.4 distribution goal were actually delivered — a
missing experiment is not evidence.

### 3.4 Distribution goal (A9)

Distribution is a product goal here, not a launch-day afterthought, because signups are the kill
metric and there is no channel yet. v1 must ship the assets that make promotion possible:

- **G-D1** A public landing page that states the wedge in one screen and shows the agent writing a
  holding (short screen recording, no audio, no real data).
- **G-D2** NetNet listed wherever MCP clients and users discover connectors (client-side connector
  directories, public MCP registries and lists).
- **G-D3** A launch note the Founder can post to 3+ relevant communities without rewriting it.
- **G-D4** Landing-page and signup-funnel analytics live before launch, so M10 is readable.

Channel selection and posting are Founder work; producing G-D1–G-D4 is in v1 scope. Targets sit in
M1/M10.

### 3.5 Instrumentation requirement — this *is* the experiment

Analytics is a P1 deliverable of the same rank as the MCP layer. Without these events the launch
produces no evidence and §3.3 cannot be applied. Minimum event set:

`landing_view` · `signup_started` · `account_created` · `holding_created {source: web|agent}` ·
`value_recorded {source}` · `agent_connection_started` · `agent_connection_completed` ·
`agent_connection_failed {step}` · `agent_tool_called {tool, outcome, latency_ms}` ·
`value_corrected {original_source, age_at_correction}` · `value_undone` · `session_started` ·
`reminder_sent` · `reminder_clicked` · `account_deleted`

**Privacy constraint on analytics (binding):** events carry names, counts, timings and a user id
only. Never amounts, holding names, currencies-as-identifiers, or any document content. A metrics
pipeline that leaks the balance sheet is a security incident, not a trade-off.

## 4. Scope

### 4.1 In scope for v1

Manual tracking of any asset or liability (user-defined types and tags, any currency, dated value
history, archive) · net worth total with trend chart, breakdown by type, assets-vs-liabilities, and
a user-chosen comparison baseline · staleness labels and email reminders · **a comprehensive MCP
layer with full CRUD over everything above, reached by OAuth from ChatGPT or Claude** · audit log
and undo for every agent write · data export and account deletion · the §3.5 analytics · the §3.4
distribution assets. Mobile-first responsive web, one API that native clients can reuse later.

### 4.2 Permanently free, and what is deliberately reserved (A10)

Everything in §4.1 ships free and **stays free for those users forever** — including unrestricted
MCP read *and* write, with no call caps or holding limits. That is a deliberate cost: the
differentiator is what drives adoption, and adoption is what this phase exists to produce.

Reserved for later monetisation — **not** built in v1, so they are not given away by default:

| Reserved capability | Why it is the monetisable side |
|---|---|
| Automated market-price and FX refresh for listed holdings | Removes even the agent from the loop; ongoing per-user data cost |
| Server-initiated / scheduled agent updates | Needs our compute, not the user's subscription |
| Forecasting and scenario planning (retirement, "what if" projections) | Distinct job from "what am I worth now" |
| Tax, CGT and year-end reporting | High willingness to pay, jurisdiction-specific work |
| Multi-entity, household, or advisor-shared portfolios | Seat-shaped by nature |
| Document vault / statement history | Storage cost, and v1 deliberately never receives documents |
| Threshold alerts and push notifications | Infrastructure cost per user |

## 5. Core user jobs

| # | As a… I want to… | Serves |
|---|---|---|
| **J1** | see a real net-worth number within minutes of signing up | M1, M2, A7 |
| **J2** | track any asset or liability, in any currency, with my own types and tags | Coverage wedge |
| **J3** | record what a holding is worth today, and correct history | Snapshot model |
| **J4** | see whether I am going up, against a baseline I choose | A6, M6 |
| **J5** | connect my AI agent to NetNet in one flow | **A1**, M3, M9 |
| **J6** | have my agent do the data entry from my statements | **A2/A3/A5**, M4 |
| **J7** | see exactly what the agent changed, and undo it | A2, M5 |
| **J8** | ask my agent questions answered against my actual balance sheet | A4, M7 |
| **J9** | be nudged before my data goes stale | M8 |
| **J10** | export everything and delete my account | A7 |

## 6. Acceptance criteria

Given/When/Then, one set per job. These are what Stage 6 tests against.

### J1 — First number fast
- **Given** a visitor on the landing page, **when** they sign up with email or a social provider,
  **then** an account exists and they land on an empty Home with a single obvious next action
  ("Add your first holding"), with no onboarding wizard to clear first.
- **Given** a new empty account, **when** the user adds one holding with a value, **then** Home
  shows a net-worth total equal to that value and the holding is listed under it.
- **Given** a signup attempt, **when** it succeeds or fails at any step, **then** `signup_started`
  / `account_created` fire with no amounts attached.
- **Given** an unverified email, **when** the user tries to use the app, **then** they can use it,
  but agent connection (J5) requires verification first.

### J2 — Track anything
- **Given** the Add flow, **when** the user creates an asset, **then** they can set name, type,
  tags, currency, and an opening value with a date, and only name/type/currency/value are required.
- **Given** the Add flow, **when** the user creates a **liability**, **then** it is stored as a
  negative contribution and net worth = assets − liabilities.
- **Given** a currency other than the user's default, **when** a value is saved, **then** the entry
  stores the original amount and currency *and* the default-currency conversion with the rate and
  rate date used, and both are visible on the value row.
- **Given** the user's own taxonomy, **when** they add, rename, merge or delete a type or tag,
  **then** existing holdings follow the change and nothing is orphaned; types/tags are not a fixed
  enum.
- **Given** a holding no longer held, **when** the user archives it, **then** it leaves all totals
  and charts but is retained with its full history and can be unarchived.
- **Given** a delete, **when** the user confirms, **then** the holding and its history are removed
  and the action appears in the audit log (J7).

### J3 — Record and correct values
- **Given** an existing holding, **when** the user adds a value with a date, **then** it joins the
  dated series, the latest-by-date value drives the total, and back-dated entries are accepted.
- **Given** a value row, **when** the user edits the amount, date or currency, **then** history,
  totals and charts recompute, and the edit is recorded in the audit log.
- **Given** two values on the same holding with the same date, **when** they are saved, **then**
  the system resolves deterministically (last written wins) and warns the user rather than
  silently double-counting.
- **Given** any value change, **when** it is saved, **then** `value_recorded` or `value_corrected`
  fires with `source` set to `web` or `agent`.

### J4 — See the picture
- **Given** holdings with history, **when** the user opens Home, **then** they see total net worth
  in their default currency, a trend line over time, a breakdown by type, and an
  assets-vs-liabilities split.
- **Given** a comparison baseline (Initial value / Last update / Last month / Last quarter / Jan 1 /
  Last year), **when** the user selects one, **then** every change figure and percentage on the
  screen is relative to that baseline and the baseline in force is labelled on screen.
- **Given** a holding, **when** the user opens it, **then** they see its own value trend, its
  change over the selected period, and its full value history newest-first.
- **Given** sort and filter controls, **when** the user sorts by value, name, change or last
  updated, or filters by type or tag, **then** the list and totals reflect only the filtered set
  and the active filter is visible.
- **Given** a phone-width viewport, **when** any of the above is used, **then** it is fully usable
  without horizontal scrolling — mobile-first is the primary case, not a fallback.

### J5 — Connect the agent (riskiest; A1)
- **Given** a verified account, **when** the user opens Connect your agent, **then** they get
  copy-paste-free instructions per client (ChatGPT, Claude) and the exact connector URL, with no
  token to generate, paste or store.
- **Given** the user starts the connection in their MCP client, **when** they authorise NetNet,
  **then** OAuth completes, the client lists NetNet's tools, and NetNet shows the connection as
  active with the client name and connection time.
- **Given** a connection attempt, **when** it fails at any step (discovery, authorise, callback,
  first call), **then** `agent_connection_failed {step}` fires and the user sees a plain-language
  cause and a retry, not a raw error.
- **Given** an active connection, **when** the user revokes it in NetNet, **then** subsequent tool
  calls from that client are rejected and the revocation is in the audit log.
- **Given** the whole flow, **when** measured, **then** p50 signup → first agent-written value is
  under 15 minutes (M9) and each funnel step is separately readable.

### J6 — Agent does the entry (A2/A3/A5)
- **Given** a connected agent, **when** it calls the MCP layer, **then** it can do everything the
  web UI can: list, create, update, archive and delete holdings; read and write values; read and
  manage types and tags; read net worth and history — with no UI-only capability left out.
- **Given** the user drops a brokerage or bank statement into their agent and asks it to update
  NetNet, **when** the agent writes the values, **then** the new values appear in the web app
  without a manual refresh action beyond reload, each tagged as agent-written with the client name.
- **Given** an agent write that would create a duplicate holding for something already tracked,
  **when** the tool is called, **then** the layer surfaces the likely match to the agent so it can
  update rather than duplicate.
- **Given** a malformed or out-of-range agent call, **when** it is received, **then** it is
  rejected with an error message specific enough for the agent to correct itself, and nothing is
  partially written.
- **Given** any tool call, **when** it completes, **then** `agent_tool_called {tool, outcome,
  latency_ms}` fires, and writes also fire the J3 events with `source: agent`.

### J7 — Verify and undo (what makes agent writes defensible)
- **Given** agent activity, **when** the user opens the audit log, **then** they see every change
  newest-first with what changed, old → new value, which client did it, and when — and web changes
  appear in the same log.
- **Given** an entry in the audit log, **when** the user undoes it, **then** the previous state is
  restored exactly, the undo is itself logged, and totals recompute.
- **Given** a batch of writes from one agent turn, **when** the user undoes the batch, **then**
  every change in that turn is reverted together, not one row at a time.
- **Given** a value the agent wrote, **when** the user corrects it, **then** `value_corrected`
  fires with `original_source: agent` and the age of the value at correction (M5).

### J8 — Ask about my position (A4)
- **Given** a connected agent, **when** the user asks a question about their finances ("can I
  afford a S$120K car?"), **then** the agent can read current net worth, per-holding values, type
  and tag breakdowns, history over any period, and currency exposure — enough to answer from the
  user's real position without the user re-supplying anything.
- **Given** a read-only question, **when** the agent answers, **then** nothing in NetNet is
  modified.
- **Given** read tool responses, **when** they are returned, **then** they carry as-of dates and
  the staleness of each value, so the agent can qualify an answer built on two-year-old numbers.
- **Given** read queries, **when** they occur after the user's first week, **then** they are
  countable separately from writes (M7).

### J9 — Stay current (M8)
- **Given** a holding not updated for longer than its expected cadence, **when** the user views it,
  **then** it is labelled with how long it has been stale ("Updated 2 years ago"), on the list and
  on the detail screen.
- **Given** stale holdings, **when** the user's reminder schedule comes due, **then** NetNet emails
  a reminder naming how many holdings are stale, with a link, and `reminder_sent` fires.
- **Given** reminder settings, **when** the user changes cadence or turns reminders off, **then**
  the change takes effect and is honoured — no email after opt-out, ever.

### J10 — Own the data (A7)
- **Given** an account, **when** the user exports, **then** they receive a complete machine-readable
  file (holdings, types, tags, full value history with currencies and rates) that they could
  rebuild a spreadsheet from.
- **Given** an account, **when** the user deletes it, **then** all their data is erased within a
  stated window, they are told what that window is, and `account_deleted` fires.
- **Given** any NetNet screen or API response, **when** it is produced, **then** it contains no
  other user's data — verified by test, not by inspection.

## 7. Non-functional requirements

| # | Requirement | Why |
|---|---|---|
| **N1** | MCP tool-call success rate ≥99.5%; p95 tool latency <1.5s | A failing call teaches the user the integration cannot be trusted — the core bet (`00-discovery.md` §5) |
| **N2** | No LLM inference in NetNet's backend; statements and documents are never uploaded to NetNet | Keeps cost near zero and keeps documents off our servers (Stage 0 decision) |
| **N3** | Every write, from web or agent, is auditable and reversible | Makes agent write access recoverable rather than irreversible |
| **N4** | Data isolation per user, enforced at the data layer and covered by tests | Financial data; a single leak ends the product |
| **N5** | Secrets in environment variables only; no credentials in the repo | Non-negotiable (CLAUDE.md) |
| **N6** | Running cost ≈$0 to 100 users, <$50/month to 1,000, holding **indefinitely** — no trial-window free tiers | Open-ended runway (`00-discovery.md` §5) |
| **N7** | Mobile-first responsive; one API serving web now and native later | Native iOS/Android is planned, not hypothetical |
| **N8** | Reliability and security never trade against cost | Founder constraint; cheap-but-flaky is a failed outcome |
| **N9** | Analytics carries no financial values (see §3.5) | The metrics pipeline must not become the leak |

## 8. Non-goals for v1

Budgeting, transaction feeds and categorisation · bank-feed aggregation of any kind · tax filing or
tax reporting · shared household or advisor access · native iOS/Android apps · **an in-app AI chat
or assistant** (the agent is the user's own, running on their subscription — N2) · automatic price
or FX refresh for listed holdings (§4.2) · document upload or storage · forecasting and retirement
projections · billing, plans or entitlements of any kind · the mockups' Pro/membership tier, legacy
trend-graph toggles, and haptics (`reference/mockups/README.md`).

## 9. Open questions

Numbered for the gate. Each carries a recommendation so silence still leaves a decision.

1. **Metric targets (§3.2) and kill thresholds (§3.3)** — are 100 signups / 40% connection / 30%
   week-4 return the right bar for 8 weeks? *Recommend: adopt as written; they are deliberately
   modest, and a kill reading should be unambiguous.*
2. **Reserved capabilities (§4.2)** — confirm the list, especially that **unlimited MCP read and
   write stays permanently free**. *Recommend: confirm. The differentiator has to be free to drive
   adoption; the reserved list is where money comes from.*
3. **Insights tab** — the mockups have a full quarterly/yearly/monthly Insights tab. Ship it in
   v1? *Recommend: no. Home's trend + breakdown + baseline (J4) covers "am I going up". Insights
   is a post-launch phase.*
4. **Which MCP clients are launch-blocking** — both ChatGPT and Claude, or one first?
   *Recommend: build to the standard remote-MCP + OAuth spec so both work; treat Claude as the
   launch-blocking client to verify end to end, ChatGPT as fast-follow. Both count toward M3.*
5. **FX rate source for web-entered values** — the model records a rate per entry, but v1 needs to
   get a rate from somewhere at zero cost, and §4.2 reserves *automated* refresh.
   *Recommend: a free daily reference rate for the conversion at entry time only, never a
   background refresh of past entries; exact source is a Stage 3 choice.*
