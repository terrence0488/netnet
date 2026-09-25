# 01 — Product Requirements (PRD)

Status: **approved by the Founder 2026-09-24** (amended) · Stage owner: Product manager
First approved 2026-09-23. Amended and re-approved 2026-09-24: §2 widened from one persona to
three, §2.3 added jurisdiction packs so the product is not permanently shaped by its first market,
and §2.4 made the agent a target user with a falsifiable claim behind it (what changed and why:
**§9.5**). **Revised again during the Stage 2 review, 2026-09-24/25:** sign-up and onboarding, the
agent route, per-country packs and their administration, and what the product shows. Those
revisions are written into the requirements below and listed in **§9.6**; they await the Founder's
approval at the Stage 2 gate.
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

> **Rewritten 2026-09-24:** the beachhead was widened from one persona to three. §9.5 records what
> that overturned and what it costs.

**Vision: broad.** Anyone whose AI could advise them better if it knew where they stood — which is
most people (§1).

**v1 targets three personas, SG/SEA first.** §1 has always described someone who does not know what
they are worth. Until now §2 excluded exactly that person. This section makes §2 agree with §1.

| | **P-A · Starting out** | **P-B · Accumulating** | **P-C · Established** |
|---|---|---|---|
| Sketch | ~21, first job, well educated | ~30, close to a decade of work, saving for a first home | ~40, family with two children, heavy commitments |
| Net worth | Under ~S$50K, sometimes negative | ~S$100–500K | ~S$1M+, with ~S$500K invested |
| Holdings | 2–5: a bank account, CPF, maybe a study loan | 5–10, mostly one currency | 15–30: multi-currency, CPF, property, loans, insurance |
| Tracks today | Nothing, or an app abandoned after a month | Spreadsheet or app, but misses months | Spreadsheet or app, 30–60 min every month |
| Net worth literacy | Has heard of it; has never computed one | Roughly | Well — the problem is making sense of it at scale |
| AI use | Frequent and casual, free tier | Moderate; Copilot at work, ChatGPT basic | Pastes whole spreadsheets into Claude or ChatGPT and finds it genuinely good |
| Needs first | To find out where they stand at all | To stop the picture decaying, and to settle trade-offs | Sense-making at scale, and someone else doing the upkeep |

### 2.1 The organising principle

The old beachhead was selected on financial literacy **so that the product would never have to
teach**. Widening the audience removes that rationale. The replacement is not to start teaching:

> **NetNet does not teach. It is opinionated, and it routes what it cannot decide to the user's own
> agent.** Defaults are chosen for the user and state their reason in plain language. Questions ask
> for facts the user already knows ("do you live here?"), never for categories they must learn first
> ("illiquid or locked?"). Where judgement is genuinely needed, the agent supplies it, not us.

This keeps §8's education non-goal intact rather than deleting it, and it is the same division of
labour as §1: NetNet supplies context, the agent supplies intelligence.

### 2.2 The second principle — standalone value before the agent

**The app must be worth using before any agent is connected** (assumption A12, measured by M11).

A picture that has been assembled but not connected must still tell a beginner something true and
surprising on day one: what they can actually touch, what is locked away, what they owe. Arithmetic
and good defaults can do this — no inference, no backend cost, no breach of N2.

This is not a nicety. If P-A cannot get value before connecting, they churn before ever reaching the
thing v1 exists to test, and M3, M6 and M7 come back looking like evidence that **A1 and A4 are
wrong** — when in truth the experiment never ran on them. That is the same class of misreading §9.4
already names as the most expensive available here.

### 2.3 Region — Singapore first, but never Singapore-shaped

**SG/SEA is the launch region, not the design constraint.** Being opinionated (§2.1) is inherently
local: "CPF is locked" is a fact about one country. Fusing that into the flow would make NetNet a
Singapore app that cannot leave, so the two kinds of opinion are kept apart:

| | Scope | Where it lives |
|---|---|---|
| **Opinions about the interaction** — ask a fact not a category, default with a stated reason, show the consequence, never block saving | Universal | The product. Never localised. |
| **Opinions about the world** — which holdings are common here, what they are called, which are locked and why | Per jurisdiction | A **jurisdiction pack**: data, not code |

A pack supplies the starting-point checklist (the basics, including follow-ups asked only after a
yes: "is there a car loan on it?"), local labels for universal types, **its own default types** on
top of the universal ones where a thing is common enough there to deserve a name (a car loan in
Singapore; not in Japan, where cars are mostly bought outright), default accessibility per type with
the one-line reason shown to the user, the disambiguating question for each ambiguous type, and
currency and date conventions. **A pack lists only what differs from the common default**, so a new
country is a short file and the common default is itself editable. Where the common default fixes an
answer that is not fixed in one country, that country's pack asks instead (Malaysia's EPF: Akaun
Fleksibel can be withdrawn at any time, the rest cannot).

**Types are universal; only labels are local.** NetNet does not ship "CPF" as a type — it ships a
mandatory-retirement type that the SG pack labels CPF, and that is EPF, MPF, Superannuation, 401(k)
or a workplace pension elsewhere. Different names, identical behaviour: counts toward net worth,
never toward what can be spent this month. The same holds for primary vs investment property,
tax-advantaged wrappers, vehicles and secured loans — and the disambiguating questions turn out to
be universal anyway ("do you live here?" works everywhere). A corollary for copy: **"locked until
you're eligible to withdraw" beats "locked until 55"** — it is both safer and portable.

Four rules, binding:

1. **The generic pack is first-class, not a degraded fallback.** Someone in a market with no pack
   gets universal types, universal questions and the full §2.1 treatment — only the local names are
   missing. It must be good on its own.
2. **A wrong pack is worse than no pack.** Showing CPF to a Malaysian is more alienating than showing
   nothing. Infer from the visitor's IP, which beats the browser's language (many people here run
   en-US browsers), falling back to locale; then **confirm with one question**, because IP is wrong
   behind a VPN or abroad. Never apply silently. The lookup runs on our own server or CDN, never as a
   third-party call from the browser. Every country can be chosen from a list sorted alphabetically,
   with none pinned to the top: a list that opens with Singapore tells everyone else the product is
   not for them.
3. **Packs set defaults; they never restrict.** This audience holds a Singapore CPF, a UK ISA and a
   US brokerage at once. Jurisdiction chooses the suggestions; the type system stays fully open (J2).
4. **The agent covers every market we have not packed.** "I have a Riester pension" is something the
   user's agent already understands; J2's open taxonomy and J6's assembly mean it can create it
   correctly. Unpacked markets are served on day one by the thing the product is already for.

**In v1:** the pack machinery, the **generic pack**, and packs for **ten launch countries** —
Singapore, Malaysia, Indonesia, the Philippines, Thailand, Vietnam, Hong Kong, India, Australia and
the United Kingdom: the first users' region, then where they come from, move to and hold assets.
Every other country gets the generic pack, and its country is still recorded — that is the demand
signal for which pack to write next. Each pack is reviewed by someone who knows that market before
it ships (rule 2). The machinery is the part that is expensive to retrofit; a pack is cheap, which
is why launch can carry ten and the rest can follow demand.

**Packs are administered content, not code.** A pack changes more often than the product does — a
scheme is renamed, a withdrawal rule moves — so a human admin must be able to change one without a
developer or a release. The admin portal that does it is **not in v1**, but nothing in v1 may
preclude it (N10). Four constraints, binding now:

- **Packs live where the running system reads them**, in a published schema. An edit that fails
  validation is rejected whole: a half-applied pack is a wrong pack.
- **Packs are versioned, and an edit never silently reclassifies anyone's holdings.** Labels may
  follow the current pack. An accessibility outcome, and the reason shown for it, stay as they were
  applied until the user changes them or a logged migration re-applies them. Otherwise one edited
  default moves every user's "what you could use this month" with no action of theirs — the
  confident wrong answer §2.4 names as the failure that ends trust.
- **Every pack change is audited and reversible** — who, what, when, old → new — as J7 is for user
  data.
- **Editing packs grants no access to user data.** Configuring the world and reading anyone's
  balance sheet are separate permissions.

The agent setup guides (J5) are administered the same way, for a different reason: the steps and
screenshots per client and platform describe Claude's and ChatGPT's own screens, which change
without notice. Until the portal exists they are files, updated without a code change.

### 2.4 The agent is a user too — and the thing v1 is really betting on

§2.2 says the app must be worth using with no agent. This is its mirror: **with an agent, the pair
must beat either half.**

The benchmark is the one P-C already runs every month. Put identical data in a spreadsheet and in
NetNet. Upload the spreadsheet to one Claude instance; connect NetNet to another. Ask both the same
question. **The NetNet answer must be better** — and it must be better even when the model is a weak
one, because that is the only way to prove the lift comes from the context rather than from the
model (assumption **A13**, gated by **M12**).

That only works if NetNet compiles data into context rather than dumping rows. Four layers, none of
which a spreadsheet can carry:

| Layer | What NetNet supplies | Why it lifts a weak model |
|---|---|---|
| **Arithmetic already done** | Accessible / illiquid / locked totals, period change, contribution by holding, currency exposure, concentration | A weak model doing 40 rows of arithmetic in context makes errors, confidently. Deterministic computation does not. |
| **Semantics** | "Mandatory retirement account, locked until withdrawal eligibility, counts toward net worth, never toward spendable" — where a spreadsheet row says `CPF OA \| 117,100` | The model stops inferring what an instrument is from its name. This is the §2.3 jurisdiction pack paying a second dividend. |
| **Provenance & completeness** | As-of date and staleness per value, observed vs carried forward, how complete the picture is | Lets the model **qualify** instead of asserting. A confident wrong answer is the failure mode that ends trust, and an upload guarantees it. |
| **Answer shape** | Which figure applies to which kind of question — affordability uses accessible, not total | Removes the most common category error without NetNet giving any advice. |

**Two constraints on this, both binding.**

- **Dense, not comprehensive.** More context is not better context: a bloated summary buries the
  relevant fact and fights N1's latency budget. The summary is ordered by importance and stays small
  enough to help a weak model rather than drown it. "Send everything" is a failure, not a default.
- **Facts and structure, never judgement.** NetNet may state what is true and flag what is
  uncertain. It may not state what the user should do. "Readily accessible is $X, and one input is
  two years stale" is context; "don't buy the car" is advice, and belongs to the agent (§8, N2).

**Where the moat actually is, stated honestly.** Any competitor can compute an accessible total —
the compute is not the secret. What is hard to replicate is the **capture**: the opinionated flow
(§2.1) and the jurisdiction semantics (§2.3) that get accessibility, provenance and meaning recorded
correctly in the first place, plus the accumulated history behind them. Investment that protects the
differentiator goes there, not into the summary endpoint.

**And it costs nothing.** Every layer above is deterministic computation over data we already hold.
No inference, so N2 holds and N6's cost ceiling is untouched (N11).

### 2.5 Consequence for the pitch (G-D1, G-D3)

One line no longer fits all three. P-C's problem is that real numbers are *stale and unreadable by
their AI*; P-A's is *never having had the numbers at all*. The landing page leads with the widest
statement that is true for all three — **you cannot get useful advice from an AI that does not know
where you stand** — and carries both proofs beneath it. It never opens with "you don't know your net
worth", which is false and condescending for P-B and P-C.

### 2.6 Trade-offs worth naming

- **Education cost is now real**, and is paid by opinionated defaults and by the user's agent — never
  by content we write and maintain (§8).
- **The trust bar stays high.** P-B and P-C ask where the data lives, whether it is sold and what
  deletion means *before* signing up (A7), so J10 and N4 remain go-to-market features, not chores.
- **P-A is the weakest commercial prospect.** They are least able to pay when monetisation arrives.
  They are in v1 because the habit forms there and because §1 has always claimed them — not because
  they are the best near-term business. If that trade stops being acceptable, P-A is the first
  segment to drop, and §3.3's per-segment kill criteria make that decision readable.

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
| **M12** | **Context lift** (new) | Blind A/B on a fixed dataset and question set: NetNet-connected agent vs the same data uploaded as a spreadsheet, scored on numeric correctness, appropriate qualification, and absence of fabrication — run on a deliberately weak model | NetNet wins **≥80%** of paired questions, and **never** scores worse on fabrication | **A13 is wrong** — the context layer is not adding what §2.4 claims, and NetNet is a nicer spreadsheet |
| **M11** | **Standalone value** (new) | % of signups with ≥2 sessions **before** any agent connection; and % still active in week 4 having never connected | **40%** / **15%** | **A12 is wrong** — the app is not worth using on its own, so P-A churns before the real experiment reaches them (§2.2) |

**Every metric above is reported per segment** (P-A / P-B / P-C), captured in onboarding by one
skippable question. Targets in this table are the blended figure; per-segment targets are set in
§3.3. Blending three populations this different makes a miss unreadable — a strong P-C result would
hide P-A never connecting at all, which is precisely the misreading §9.4 warns about.

### 3.3 Kill criteria

The product is killed if it cannot get signups and engagement. Concretely, after the 8-week
window: **M1 < 25 signups, or M3 < 15%, or M7 < 20%, or M6 < 10%.** Any one is a kill reading —
provided §3.5 instrumentation and the §3.4 distribution assets were actually delivered. A missing
experiment is not evidence.

**Kill criteria are read on P-B and P-C, not on the blend.** Those two are the commercial bet; P-A
is the habit bet and is allowed to underperform on M3 and M7 without killing the product. What P-A
*is* held to is **M11** — if the app is not worth using standalone, P-A should be dropped from v1
rather than carried (§2.4). A blended reading is never used to kill anything.

### 3.4 Distribution goal (A9)

Signups are the kill metric and there is no channel yet, so distribution ships as product work:

- **G-D1** A public landing page that states the problem in one screen **in §2.5's terms** — the
  widest statement true for all three personas: *you can't get useful advice from an AI that
  doesn't know where you stand* — with both proofs beneath it: for someone who has never added it
  up (P-A), and for someone whose numbers are real but stale and unreadable by their AI (P-B, P-C).
  It shows an agent answering a real question from a real balance sheet (screen recording, no
  audio, no real data), and it never opens with "you don't know your net worth". It is a marketing
  page with its own design, not a screen in the product; its call to action goes straight to sign-up.
- **G-D2** NetNet listed wherever MCP clients and users discover connectors (client connector
  directories, public MCP registries and lists).
- **G-D3** A launch note the Founder can post, without rewriting it, to 3+ communities that
  **between them reach all three personas** (§2). It leads with §2.5's statement and varies only the
  proof to suit the audience. Literacy is no longer the filter — §2.1 moved the education cost onto
  opinionated defaults and the user's agent — but **P-B and P-C carry the kill criteria** (§3.3), so
  the channel mix must put enough of them in front of the product to make those segments readable.
  A launch that recruits mostly P-A produces a large, cheerful, unreadable result.
- **G-D4** Landing and signup-funnel analytics live before launch, so M10 is readable.

Channel selection and posting are Founder work; producing G-D1–G-D4 is in v1 scope.

### 3.5 Instrumentation requirement — this *is* the experiment

Analytics ranks with the MCP layer as a P1 deliverable. Without these events the launch produces
no evidence and §3.3 cannot be applied. Minimum event set:

`landing_view` · `signup_started {method: email|google|apple}` · `account_created {method}` · `holding_created {source: web|agent, via: guided|form}` ·
`value_recorded {source}` · `agent_connection_started {client, entry: onboarding|home|holding|agent}` ·
`agent_connection_completed {client, entry}` · `agent_connection_failed {step, client, entry}` ·
`agent_tool_called {tool, kind: read|write, outcome, latency_ms, client}` ·
`value_corrected {original_source, age_at_correction}` · `value_undone` ·
`session_started` · `insights_viewed {view: monthly|quarterly|yearly}` · `reminder_sent` ·
`reminder_clicked` · `account_deleted`

Every event above also carries **`{segment}`** (`starting_out` / `accumulating` / `established` /
`unknown`), set during onboarding and never changed by us. Without it none of §3.2 is readable per
segment, and §3.3 cannot be applied to the segment it is meant to judge. `signup_started` and
`account_created` fire before the question is asked and carry `unknown`; per-segment readings join
them to the account.

`method` says which way in people choose — Google, Apple or email. Sign-up is built to be as
frictionless as possible (J1), and this is how that is checked.

`via` is set only when `source` is `web`: **`guided`** for the basics (J1), **`form`** for the Add
form. Without it nothing can say whether guided assembly is what gets P-A to M2 — a guided "yes"
and a typed holding would be indistinguishable. It carries no amounts, so N9 is unaffected.

`entry` says where a connection attempt began: onboarding, the empty Home, a holding, or the Agent
tab. Onboarding offers the agent as its alternative route (J1); `entry` is what shows whether that
route, rather than the Agent tab, is what drives M3.

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

A **context-compilation layer** (§2.4) that turns stored data into agent-ready
context — derived totals, per-holding meaning, provenance and completeness, and answer-shape
guidance — deterministic and small enough to help a weak model rather than drown it. This is the
differentiator, not a convenience.

**Opinionated defaults with stated reasons** throughout data entry; **fact-based questions in place
of classification** wherever a category would otherwise have to be learned; **guided assembly** (the
basics) for someone who does not know what to list; and **standalone answers on Home** — what is
readily accessible, what is locked, what is owed — good enough to be worth the visit before any
agent is connected (§2.2). None of this is educational content, and none of it needs inference (N2).

**Sign-up by Google, Apple, or email and password; a short onboarding** that ends in either the
basics or a connected agent (J1, J5); **jurisdiction packs** for ten launch countries plus the
generic pack (§2.3).

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
- **Given** a visitor on the sign-up page, **when** they sign up with a provider (Google, Apple) or
  with an email and a password, **then** an account exists, and sign-up asked for nothing else.
  Every question before the account exists costs sign-ups (M1, M10); anything that can be asked
  afterwards is.
- **Given** a new account, **when** it is created, **then** onboarding asks, one question per
  screen: where they live (inferred, then confirmed — §2.3 rule 2) and an optional segment. Then
  one screen — "Let's start by getting to know a little about your finances" — with **Start**,
  which opens **the basics** (below). Below a rule, the agent is offered as the other way to start:
  "Let your AI agent do this", with a secondary **Connect to agent** button (J5). It must be visible
  enough to be a real choice, because the agent is what v1 is betting on (A1, M3), and never a
  second filled button, because two equal choices stall a new user. In the basics, every answer is saved the moment it is given, and "Done for now" is one tap
  away on every screen, so onboarding never has to be cleared to reach Home. Once the basics have
  started, the agent is not offered again inside them: one route at a time.
- **Given** any question in the basics, **when** the user would rather not say or does not know —
  whether they have it, or roughly how much — **then** **Skip** moves on with nothing added and
  nothing asked because of it. A skipped question is neither a yes nor a no: Back can return to it.
- **Given** the basics, **when** the user presses **Back**, **then** they return to the previous
  question showing their earlier answer, which they can correct in place or change from yes to no.
  A no removes what the yes added, and anything asked only because of it ("no car" removes the car
  loan), logged like any delete. From the first question, Back returns to where the basics began —
  in onboarding, the screen where the agent route is — so choosing the questions is never a trap.
- **Given** the agent route, **when** the agent is connected, **then** onboarding is done and the
  user lands on a blank Home — no waiting state. The blank Home offers the starting prompt to copy
  and, where the client supports it, a button that opens the agent with the prompt already typed
  ("Let Claude do it"). Adding holdings themselves is the quiet alternative.
- **Given** an email sign-up, **when** the password is set, **then** a verification email is sent
  and the user carries on without waiting for it. Provider sign-ups are already verified.
- **Given** a returning user, **when** they log in, **then** they resume onboarding if they had not
  finished it, and otherwise go straight to Home.
- **Given** an empty account, **when** the user adds one holding with a value, **then** Home shows
  a net-worth total equal to that value with the holding listed under it.
- **Given** an empty Home, **when** it is shown, **then** it offers **one** primary action and one
  secondary alternative, never several equal-weight choices: a new user who cannot tell where to
  start leaves. With no agent connected, the action is "Add what you have" (the basics), and below a
  rule the alternative is the same "Let your AI agent do this" block as in onboarding (J5), not
  buried in settings. With an agent connected, it is
  the starting prompt, with "add it yourself" as the alternative.
- **Given** a user who does not know what to list, **when** they meet the basics, **then** the
  questions are this market's common holdings (the pack's checklist) — suggestions, not a fixed
  chart of accounts.
- **Given** any signup attempt, **when** it succeeds or fails, **then** `signup_started` /
  `account_created` fire with no amounts attached.
- **Given** an unverified email, **when** the user uses the app, **then** they can — but agent
  connection (J5) requires verification first.
- **Given** a user who has never computed a net worth (P-A), **when** they finish sign-up, **then**
  they are walked through a short list of things people commonly hold — a bank account, CPF, a
  loan, a car — one question per screen, answering only "do you have this?" and "roughly how
  much?", with a follow-up only after a yes where the pack has one ("is there a loan on it?"). They
  may stop at any point with whatever they entered already counted.
- **Given** a first picture of two or three holdings and **no agent connected**, **when** Home is
  shown, **then** it states at least one thing the user did not type in — what they could actually
  use, what is locked and roughly until when, and what they owe against it. A total alone is not a
  first picture (§2.2, A12, M11).
- **Given** any signup, **when** onboarding runs, **then** a coarse segment is recorded from one
  skippable question, and every subsequent event carries it (§3.5).

### J2 — Track anything
- **Given** the Add flow, **when** the user creates an asset, **then** they can set name, type,
  tags, currency and an opening value with a date; only name, type, currency and value are
  required.
- **Given** the Add flow, **when** the user creates a **liability**, **then** it contributes
  negatively and net worth = assets − liabilities.
- **Given** a holding, **when** it is created or edited, **then** how accessible it is is recorded
  as one of readily accessible / illiquid / locked, **or undecided** (below) — this is what stops
  J8 answering "can you afford
  it" off money the user cannot touch.
- **Given** any holding type, **when** the user is asked about accessibility, **then** the question
  asks for a **fact they already know** ("do you live here?", "has it vested?"), never for the
  category itself. The three category names are a data model, not a question put to a user.
- **Given** a type where the answer is not in doubt — mandatory retirement, cash, listed
  investments — **when** a holding is created, **then** nothing is asked and the value is set, with
  its reason stated in one line the user can see and override. The reason text comes from the
  jurisdiction pack (§2.3), never hard-coded.
- **Given** a user in a market with no pack, **when** they add holdings, **then** the generic pack
  gives them universal types, the same fact-based questions and the same stated reasons — only local
  institution names are absent, and nothing about the flow degrades (§2.3 rule 1).
- **Given** a jurisdiction inferred from the visitor's IP (or locale), **when** the user first sees
  it, **then** it is confirmed by one question rather than applied silently, and it is changeable
  afterwards (§2.3 rule 2). Choosing another country lists every country alphabetically, and the
  chosen country's currency becomes the default for totals, changeable.
- **Given** a pack with its own default types (Singapore's car loan), **when** the country is
  confirmed, **then** those types are added to the account alongside the universal ones. Moving
  country later adds the new pack's types and removes none, since a type may already hold
  holdings.
- **Given** a user holding instruments from several countries, **when** they add them, **then**
  nothing in the pack prevents it — the pack supplies suggestions and defaults only (§2.3 rule 3).
- **Given** any accessibility default, **when** it is applied, **then** its **consequence** is shown
  rather than its label — "counts toward the $X you could use this month" / "won't count, it's your
  home" — and it stays changeable from the holding afterwards.
- **Given** the Add flow, **when** the user is unsure, **then** accessibility never blocks saving,
  and asking their agent is offered as an alternative to deciding.
- **Given** a user who answers "Not sure", **when** the holding is saved, **then** it is recorded as
  **undecided** — a fourth state, never silently resolved to one of the three. An undecided holding
  **counts toward net worth** but **never toward what the user could use this month**; it is marked
  as not yet decided wherever it is listed, with a way to decide or to ask their agent; and it is
  reported to the agent as **incompleteness** in the §2.4 provenance layer, so an affordability
  answer is qualified rather than quietly built on a guess.
- **Given** a currency other than the user's default, **when** a value is saved, **then** the entry
  stores the original amount and currency *and* the default-currency conversion with the rate and
  rate date used. The original amount is visible on the value, because it is what the user checks
  against a statement. The rate and rate date are kept on the entry, exported, and readable by the
  agent, but not displayed: they answer a question almost nobody asks, and showing them made every
  foreign-currency value harder to read.
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
- **Given** a new user whose holdings have one value each, or a holding with only one value,
  **when** they open Home or that holding, **then** the trend keeps its place as a placeholder: a
  sample of the chart's shape, in neutral ink, under frosted glass labelled "Need more data", with
  one line saying what makes it appear (a later update, or a value with an earlier date). The
  sample carries no figures or dates and never uses a data colour, so it cannot be mistaken for
  the user's own trend. A chart that vanishes teaches a new user the product has less in it than
  it does. A chart that shows a line through one point, or a flat line at their only value, reads
  as a fact about their money.
- **Given** sort and filter controls, **when** the user sorts by value, name, change or last
  updated, or filters by type or tag, **then** list and totals reflect the filtered set and the
  active filter is visible.
- **Given** a phone-width viewport, **when** any of the above is used, **then** it is fully usable
  without horizontal scrolling — mobile-first is the primary case, not a fallback.

### J5 — Connect the agent (A1)
- **Given** a verified account, **when** the user opens Connect your agent, **then** they get
  steps for their client **and their platform** (phone or computer, detected and
  switchable), each step with a screenshot, and the connector URL, with no token to generate,
  paste or store. The steps and screenshots are administered content (§2.3), because the clients'
  own screens change without notice. So is the client list itself: Claude and ChatGPT at launch,
  and any other agent (Grok, Muse) once it is confirmed to accept a custom remote MCP connector.
  Muse (Meta, launched September 2026) takes connectors differently: there is no settings screen,
  so the user asks Muse in the chat to add one from NetNet's address. Its guide therefore starts
  with a message to send, not a menu path. Meta's connector directory accepts MCP servers with
  OAuth, and a NetNet listing there would turn this into Muse's own one-tap add. Muse is US-only
  at launch.
- **Given** an agent that is not on the list, **when** the user chooses **Other agent**, **then**
  they get a generic guide: add a custom connector (MCP server) in the agent's settings with this
  address, then Allow on NetNet's page. No platform split and no screenshots, because we cannot know
  its screens. Any agent that supports remote MCP with OAuth works; the named list is a
  convenience, never a limit. NetNet's approval page and the Agent tab show the name the agent
  registers with.
- **Given** the connect flow, **when** the user changes their mind, **then** Back returns them step
  by step to where they began; the flow does not also offer the questions.
  The server is standard remote MCP with OAuth and no client-specific branching, so supporting
  another agent is content — steps, screenshots, a logo — not code.
- **Given** the "Connect to agent" button, **when** it is shown, **then** it shows the agents it
  works with: its icon turns through their logos, two seconds each, and holds still for anyone
  whose device asks for reduced motion. Logos are each company's official files, drawn in the
  button's own ink, and screen readers hear only "Connect to agent".
- **Given** any place the user starts connecting — onboarding, the empty Home, a holding, the Agent
  tab — **when** they do, **then** it is the same flow, so the routes can never drift apart.
- **Given** an email that is not yet verified, **when** the user starts connecting, **then** they
  are asked to verify first, with a resend, and the flow moves on by itself once they have.
- **Given** the setup steps, **when** the user approves NetNet in their client, **then** NetNet's
  screen moves on by itself. There is no "I've done it" button to press.
- **Given** the user starts the connection in their MCP client, **when** they authorise NetNet,
  **then** OAuth completes, the client lists NetNet's tools, and NetNet shows the connection as
  active with client name and time.
- **Given** a connection attempt, **when** it fails at any step (discovery, authorise, callback,
  first call), **then** `agent_connection_failed {step, client, entry}` fires and the user sees a
  plain-language cause and a retry, not a raw error.
- **Given** a connected agent, **when** Home is empty or holdings are out of date, **then** the next
  step is handed to the agent: a starting prompt, or a prompt to update what is stale, with a
  button that opens the agent with the prompt already typed where the client supports it, and Copy
  where it does not. Prompts carry no financial data; the agent reads what it needs through the
  MCP layer. Without a connected agent, the same places offer to connect one.
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
  document parse. The MCP layer gives the agent the user's country checklist and the fact questions
  (J2), so a conversation asks what the basics ask, and a one-line prompt is enough to start it.
- **Given** the user drops a statement into their agent and asks it to update NetNet, **when** the
  agent writes, **then** the values appear in the web app marked as agent-written, with the client
  named on the value. The mark is quiet and the name appears when the value is opened; the audit
  log carries full attribution (J7). Who wrote a number matters when checking it, not while
  reading the position, and a loud label on every agent-written row competes with the figures.
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
- **Given** that one summary call, **when** it returns, **then** it carries all four §2.4 layers:
  arithmetic already done (accessible / illiquid / locked totals, period change, contribution by
  holding, currency exposure, concentration); the **meaning** of each holding, not just its name;
  per-value provenance and overall completeness; and which figure applies to which kind of question.
- **Given** the same question asked of an agent with NetNet connected and an agent handed the same
  data as a spreadsheet, **when** both answer, **then** the NetNet answer is more accurate and
  better qualified — measured blind, on a deliberately weak model, per M12 (A13).
- **Given** the summary response, **when** it is assembled, **then** it is **ordered by importance
  and kept small**; completeness is never traded for relevance, since a bloated response buries the
  answer and breaches N1's latency budget.
- **Given** any context NetNet returns, **when** it is produced, **then** it is computed
  deterministically — arithmetic, schema and stored provenance only, never inference (N11) — and it
  states facts and uncertainty, never what the user should do (§8).
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
  a comparison, and each chart keeps its place as the same placeholder as Home's (J4): never an
  empty grid, a fabricated 0% row, or an axis with one point. The statement is made once, not on
  every chart. When filters or exclusions leave nothing, the view says that instead, because more
  data would not help.
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
| **N8** | Reliability and security never trade against cost | Cheap-but-flaky is a failed outcome for financial data |
| **N9** | Analytics carries no financial values (§3.5) | The metrics pipeline must not become the leak |
| **N11** | Context compilation is **deterministic** — arithmetic, schema and stored provenance only, no inference of any kind | Keeps §2.4's lift free: N2 stays intact and N6's cost ceiling is untouched. The moment context needs a model to produce it, the economics of the whole product change |
| **N10** | Jurisdiction packs are **data, not code**: adding a market ships no release, and no local institution name, rule or default is hard-coded into a flow. Packs are validated, versioned data the running system reads, so a human admin can later change them through a UI; that admin portal is not v1, but nothing in v1 may preclude it (§2.3) | Being opinionated is inherently local (§2.3). Fusing local facts into the engine makes v1 a Singapore app that cannot leave, and that is the expensive thing to retrofit |

## 8. Non-goals for v1

Budgeting, transaction feeds and categorisation · bank-feed aggregation of any kind · **income and
expense tracking** (see the risk below) · tax filing or NetNet-produced tax reporting · shared
household or advisor access · native iOS/Android apps · **an in-app AI chat or assistant, and any
advice generated by NetNet itself** — the agent is the user's own, running on their subscription
(N2) · automatic price or FX refresh (§4.2) · document upload or storage · NetNet-built forecasting
· billing, plans or entitlements · **financial-literacy education as content — explainers, courses,
coaching, "what is net worth" articles** (still a non-goal after the §2 widening; §2.1 replaces
literacy-as-selection with opinionated-defaults-plus-agent. NetNet may use plain language, state the
reason for a default, and show what a number does — it may not write a curriculum) · the mockups' Pro tier, legacy trend-graph toggles and
haptics · Net Worth Goals, notes on a value, and marking a value on a chart (all from the mockups) ·
**an admin portal for jurisdiction packs and setup guides** (future; v1 must not preclude it, §2.3).

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

### 9.5 Decisions taken 2026-09-24 — the §2 widening

Founder decision, overturning the single-beachhead choice made at the 2026-09-23 gate.
**Approved by the Founder 2026-09-24.**

5. **v1 targets three personas** (§2), not one. The expansion ladder is retired: its step 4 — the
   broad market who do not know what they are worth — is now P-A and in scope. §1 always described
   this person; §2 now agrees with §1.
6. **Literacy-as-selection is replaced by opinionated-defaults-plus-agent** (§2.1). NetNet still
   does not teach. It decides, states its reason, asks for facts rather than categories, and routes
   real judgement to the user's own agent. §8's education non-goal survives, qualified.
7. **New assumption A12 and new metric M11: the app must be worth using before an agent is
   connected** (§2.2, §3.2). Chosen over the alternative — treat the agent as the goal and convert
   beginners to a paid AI plan — primarily because it keeps the launch experiment readable. Under
   that alternative, P-A's low M3/M6/M7 would look like evidence against A1 and A4 when the
   experiment had simply never reached them.
8. **All metrics are reported per segment, and kill criteria are read on P-B and P-C, not on the
   blend** (§3.2, §3.3). P-A is held to M11 instead. `{segment}` rides on every event.
9. **Singapore is the launch region, not the design constraint** (§2.3, N10). Opinions about the
   interaction are universal; opinions about the world live in jurisdiction packs, which are data.
   Types are universal and only labels are local — NetNet ships a mandatory-retirement type, not
   "CPF". v1 carries the machinery, the SG pack and a first-class generic pack; further markets are
   data files. Raised by the Founder, who declined to have the app shaped permanently by its first
   market.
10. **Accessibility is never asked as a classification** (J2). This was the trigger for the whole
   revision: "illiquid or locked?" for a property is unanswerable without knowing whether the user
   lives in it, and a layman asked to classify either stalls or guesses wrong — both silent failures.

11. **The agent is a target user, and NetNet + agent must beat either half** (§2.4, A13, M12).
    Founder's framing, and the benchmark is the one P-C already runs monthly: identical data in a
    spreadsheet and in NetNet, the same question to two agents, and the NetNet answer must be better
    **even on a weak model**. That makes the claim falsifiable instead of aspirational. Two
    constraints were added rather than assumed: context is dense and ordered, never comprehensive,
    because bloat degrades weak models and breaches N1; and NetNet supplies facts and uncertainty,
    never judgement, which keeps §8 and N2 intact. N11 keeps the whole layer deterministic, so the
    differentiator costs nothing to run. Recorded honestly: the **compute is replicable** — the
    durable moat is the capture (§2.1) and the jurisdiction semantics (§2.3) that get accessibility,
    meaning and provenance recorded correctly, plus accumulated history.

**Correction to a §9.4 premise.** The claim that custom MCP connectors are paid-tier only is
**unverified and probably wrong** — the Founder connects Notion, Google Drive and other MCP servers
on a free ChatGPT account. One sub-question stays open: listed directory connectors may be gated
differently from a custom connector added by URL. Stage 3's existing obligation to verify each
client's requirements now carries more weight, because if free tiers can add custom connectors, P-A
reaches the core product on day one and the §2.2 risk shrinks considerably. A12 and M11 stand
regardless — standalone value was chosen for measurement reasons, not only for access reasons.
*Update, Stage 2 review:* Claude's and ChatGPT's free plans now allow custom MCP connectors, so the
connect flow carries no plan warning. Stage 3 confirms this when building.

### 9.6 Revisions during the Stage 2 review — 2026-09-24/25

Written into the requirements above; listed here so the gate can see what moved. They await the
Founder's approval with the prototype.

| # | What changed | Where |
|---|---|---|
| 12 | An **undecided** accessibility state: counts toward net worth, never toward what can be used, reported to the agent as incompleteness | J2 |
| 13 | G-D1 and G-D3 re-worded to §2.5; the launch must reach P-B and P-C in enough volume | §3.4 |
| 14 | `via` on `holding_created` (`guided` / `form`) | §3.5 |
| 15 | Net Worth Goals, value notes and chart marks out of v1 | §8 |
| 16 | Agent provenance is quiet: a mark, the client named on the opened value, full attribution in the log. The exchange rate is stored, exported and readable, not displayed | J2, J6 |
| 17 | Packs are administered content, with an admin portal later; four constraints binding now | §2.3, N10, §8 |
| 18 | Sign-up asks only for a way in (Google, Apple, email and password); email verification does not block; log-in resumes unfinished onboarding; the landing page is a marketing page with its own design; `{method}` on sign-up events | J1, §3.4, §3.5 |
| 19 | Where-you-live defaults to the country from IP, confirmed; every country listed alphabetically; the chosen country's currency becomes the default | §2.3, J2 |
| 20 | The basics are part of onboarding, one question per screen; an empty Home offers one primary action and one secondary alternative (the agent, below a rule); the starting tiles and `via: starter` are gone | J1, §3.5 |
| 21 | Packs carry their own default types and basics, with follow-ups after a yes; ten launch countries | §2.3, J2 |
| 22 | Onboarding offers the agent as its alternative route; one connect flow everywhere, per client and platform, with screenshots; connected ends onboarding on a blank Home with the starting prompt; agent prompts for empty and stale Home; `{entry}` on connection events | J1, J5, J6, §3.5 |
| 23 | Back on every question of the basics (correct an answer, change yes to no, or return to where the basics began); no agent offer inside the basics; the Connect button turns through the agents it works with; Grok and Muse listed once their connector support is confirmed | J1, J5 |
| 24 | Skip on every question of the basics; "Other agent" with a generic guide, so any MCP agent can connect; the connect flow drops its questions link (Back does it) | J1, J5 |
| 25 | A chart with too little data keeps its place as a labelled placeholder (a neutral sample under frosted glass, "Need more data", saying what makes it appear), on Home, a holding and Insights | J4, J11 |
| 26 | Muse is Meta's agent; its setup starts with a message sent in the chat, and a listing in Meta's connector directory is the better path | J5 |

**Assumption taken, flag if wrong:** FX for web-entered values uses a free daily reference rate at
entry time only, recorded on the entry, never a background refresh of past entries (§4.2 reserves
automated refresh). Exact source is a Stage 3 choice.

**Carried into Stage 2:** J11's behaviour is specified from the mockups README alone — the Insights
frames have never been seen. Review them with the Founder before building.
