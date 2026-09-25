# 02 — Prototype notes

Status: **awaiting Founder review** · Stage owner: Product designer
Reworked 2026-09-24 against the amended PRD: J1 (guided assembly, first picture, segment), J2
(accessibility as facts, never a classification) and §2.3 (jurisdiction packs, as data).
Inputs: `docs/01-prd.md` (approved as amended 2026-09-24), the Founder's iOS mockups (shared
in-session, deliberately not committed — see `docs/reference/mockups/README.md`)

---

## 1. How to open it

Open `docs/02-prototype/index.html` in a browser. No build, no server, no install — it is plain
HTML, CSS and JavaScript on purpose. Works offline.

- Try it at **phone width and desktop width**; the layout is genuinely different, not scaled.
- It follows your OS light/dark setting. The mockups are dark, so dark is the reference.
- The **PROTO** button (bottom right) resets to the sample account, switches to an empty
  first-run account, shows the analytics events as they fire, and can **pretend the browser is in
  Singapore, Malaysia, the UK, or nowhere**, so the region question can be tested from anywhere.
- State is kept in `localStorage`, so your changes survive a reload until you reset.

**Two ways in, one per kind of user.**

| Start from | Shaped like | What it shows |
|---|---|---|
| The sample account (default) | **P-C, Established** — ~S$1.84M, 12 holdings, SGD and USD, CPF, an HDB flat, unvested RSUs, a deliberately stale car | Everything at scale: Insights, history, agent writes, undo |
| PROTO → empty account → sign up | **P-A or P-B** — whoever you say you are | Sign-up, onboarding (region, segment, the basics), the first picture, fact-based accessibility |

**All data in it is fictional.** It is not anyone's real balance sheet and must never be replaced
with one.

## 2. Flows covered, against the PRD jobs

| Job | Where it is | Notes |
|---|---|---|
| **J1** first picture fast | Sign up → onboarding → empty Home | Sign-up is a provider (Google, Apple) or email then password; nothing else. Onboarding: where you live (inferred, one tap to confirm) and an optional segment, one per screen. Log out / log in from Account; logging in resumes onboarding where it was left. Then **the basics**, one question per screen, each yes saved at once, "Done for now" always available. Home shows the picture; an empty Home offers only "Add what you have" and a quiet link to the agent (Founder, 2026-09-25). The basics ask only "do you have this?" and "roughly how much?" |
| **J1** the first picture | Home, as soon as there is one holding | The **Position** ledger says what you could use this month, what needs selling first, what is locked, and what you owe. None of it was typed in |
| **J2** track anything | Add Tracking → New Asset / New Liability; Manage Types; Manage Tags | User-defined taxonomy on top of universal types; rename/delete cascades to holdings |
| **J2** accessibility | Add form, holding page, Home | A fact question only where the type is ambiguous; otherwise the default and its reason in one line, with **Change**. The consequence is shown, never the category. "Not sure" is always allowed and never blocks saving |
| **§2.3** jurisdiction packs | `packs.js`; Account → General → Where you live | SG pack and generic pack. Switching region relabels every type you have not renamed and re-words every reason, live |
| **J3** record and correct | Holding detail → Update / Add Value / Edit Value / Delete | Back-dating, same-date warning |
| **J4** see the picture | Home: trend, allocation, Position ledger (includes assets-vs-liabilities), baseline, sort, filters | Every % on screen is relative to the chosen baseline. Trend and change figures appear once there is history to show |
| **J5** connect the agent | Onboarding ("Or, connect your AI agent to start"), the empty Home, a holding's "Ask your agent", the Agent tab | One flow everywhere: choose the agent → verify the email if needed → steps for this platform (phone or computer, switchable), each with a screenshot slot → NetNet's approval page (**Allow** / Cancel) → done. Two outside events are stood in for by dashed "Prototype:" buttons: opening the verification link, and the agent opening the approval page. On the agent route, Allow ends onboarding on a blank Home whose hint is the starting prompt and **Let Claude do it** (opens claude.ai with the prompt typed in). Screenshots: drop them into `connect/` (see its README). Revoke on the Agent tab |
| **J6** agent assembles | Agent → Try it | Scripted turn: finds the existing holding rather than duplicating, then writes |
| **J7** verify and undo | Activity | Single undo and whole-turn batch undo; web and agent changes in one list |
| **J8** grounded advice | Agent → Try it (second half) | The affordability question answered off money you could use, with staleness caveats. **A scripted replay — see §8** |
| **J9** stay current | Stale chips on Home and detail; Account → Reminders | Cadence and a real opt-out |
| **J10** own the data | Account → Export / Delete account | Export downloads JSON and CSV, including accessibility and the answer behind it |
| **J11** insights | Insights tab | Monthly/Quarterly/Yearly; Growth, Assets vs Liabilities, Distribution Over Time; Insights Filters with "Don't Show"; period drill-down |
| **§3.5** segment on every event | PROTO → events | `{segment}` rides on every event: `unknown` until onboarding, then whatever was chosen, or `unknown` if skipped. `signup_started` and `account_created` carry `{method}` |

Deliberately **not** built, because they are not design questions: real auth, real OAuth, a real
MCP server, email sending, and anything on the reserved list in PRD §4.2.

## 3. Jurisdiction packs (PRD §2.3, N10)

**Where they live.** `packs.js` — a data file with no functions in it. `app.js` names no local
institution, rule or default; it reads the world only through the pack. Adding a market is a new
entry in `PACKS` plus a `COUNTRY_PACK` line pointing a country at it. No change to the flow. In the product, a
human admin will edit packs through a future admin portal (PRD §9.6 item 17); `packs.js` is the
shape that admin would be editing.

**What a pack supplies**, mapped to the PRD's list:

| PRD §2.3 says a pack supplies | Field | Notes |
|---|---|---|
| The starting-point checklist | `checklist` | The basics. `onlyIf` asks a follow-up only after a yes (SG: home → home loan, car → car loan); a follow-up shares its question's number, so "4 of 6" never jumps to "4 of 7". `type` files the answer under the pack's own type |
| Local labels for universal types | `labels`, `examples` | Types store no name until the user renames one, so labels always follow the current pack |
| Its own default types | `types` | Added on top of the universal ones, never instead: SG adds **Car loan** (a local name for a universal loan). Added when the country is confirmed; changing country later adds, never removes |
| Default accessibility per type, with the one-line reason | `defaults` | `{ access, reason, until }` — `until` is what Home prints beside a locked amount |
| The disambiguating question for each ambiguous type | `questions` | Each answer carries its own `access`, `reason`, `until` |
| Currency and date conventions | `locale`, `currency` | Generic uses the browser's own conventions; currency comes from the region |

**Resolution.** Current pack first, then generic, key by key. The generic pack is complete on its
own; SG overrides only what is genuinely local. The one behavioural difference is deliberate and
shows the machinery working: **generic asks** "could you take money out today without a penalty?"
for a tax-advantaged account, because ISAs and IRAs answer differently; **SG does not ask**, because
there that type is SRS and the answer is not in doubt.

| | Generic | SG |
|---|---|---|
| Mandatory retirement | "Retirement account" — locked until you're eligible to withdraw | "CPF" — same rule, reason names CPF |
| Tax-advantaged | "Tax-advantaged account" — asks the penalty question | "SRS" — locked by default, reason names SRS |
| The basics | Bank, pension, investments, own home, car, anything owed | Bank, CPF, investments, own home → home loan?, car → car loan?, anything else owed |
| Own default types | none | Car loan |
| Conventions | Browser locale; currency from region | `en-SG`, SGD |

**Where the region comes from.** In the product, the **country detected from the visitor's IP**,
looked up by NetNet's own server or CDN (Founder, 2026-09-25). It is pre-selected and then
**confirmed by one tap in onboarding**, never applied silently (§2.3 rule 2); IP is wrong behind a
VPN or while travelling. The prototype has no server, so PROTO → "Country detected from IP"
simulates the lookup (Singapore, Malaysia, UK, Germany, or not detected), and otherwise the
browser's time zone stands in for it. "Somewhere else" lists **every country** (ISO 3166-1, plus
Kosovo), alphabetically, with none pinned to the top. Each country brings its currency as the
default for totals. Changeable afterwards in Account → General. Any country without a pack gets
generic, and the country is still recorded — that is the demand signal for which pack to write next.

**A known edge, handled rather than hidden.** When a pack turns an ambiguous type into a default
(SG's SRS), a foreign instance of the same universal type inherits the local default — a UK ISA
filed under "SRS" would read as locked. The stated reason names SRS, which makes the mismatch
visible and one tap to override, and filing it under Other asks the universal question instead.
This is why reasons must always name the local instrument.

## 4. Accessibility, as the user meets it (PRD J2)

The data model is still accessible / illiquid / locked, plus **undecided** (see decision 1 in §7).
The user never sees those words. They meet one of three things:

| When | What they see | Types |
|---|---|---|
| The answer is not in doubt | The default and its reason in one line, with **Change** | Cash, listed investments, retirement, vehicle, crypto; SRS in SG |
| One fact settles it | One question they already know the answer to | Property: "Do you live in it?" · Employee shares: "Has it vested?" · Tax-advantaged (generic): "…without a penalty?" |
| Their own type, or overriding any default | The universal question: "If you needed this money, could you use it within a month?" — Yes / Only by selling it / No, it's tied up | Anything |

Every route also offers **Not sure**. It saves; the holding counts toward net worth and not toward
what you could use, shows as *not decided* on Home, and its page offers **Decide** or **Ask your
agent** (a ready-to-paste prompt, plus Connect if no agent is connected yet).

**The consequence, never the label** — the line always states the money:

- *Counts toward the $4,000 you could use this month — it's money in the bank.*
- *Counts toward your net worth, not the $4,000 you could use this month — it's your home.*
- *Counts toward your net worth. Not toward the $4,000 you could use this month until you decide.*

The templates are universal and live in `app.js`; every reason after the dash comes from the pack.

## 5. Design system

`design-system.md` is the spec; this is the short version of how it came about.

The prototype is built on **NetNet v1 — "Two Inks"**, chosen by the Founder on 2026-09-23 after
three rounds. The idea: *a ledger, typeset and printed in two inks — one ink is you, the other is
your agent.* Structure is typographic (hairline rules, no cards); colour is scarce and loud.
Fraunces sets every monetary amount, Inter sets everything else.

The first round was rejected outright, and the reason is worth keeping: it started from a palette
rather than an idea, and produced four recolourings of the same generic dashboard. `explorations/`
holds the whole record, including that failure.

**Decisions this locked in, beyond appearance**

- The agent's ink is a *structural* device, not a badge — a cyan rule in a reserved 24px gutter,
  used identically on Home, value history and the audit log.
- The allocation donut was replaced by a ranked list; its direct labels satisfy the light-mode
  relief rule the chart validator flagged.
- The trend line is the brand ink, never gain/loss.
- Every token is measured, not chosen by eye.

The rework added four components, all inside the system rather than beside it — the **Position
ledger**, the **choice row**, the **consequence line** and the **amount entry** (`design-system.md` §6).

**Still open** (`design-system.md` §9): whether Fraunces should set row amounts or the hero only;
whether the warm paper survives a landing page; and the wordmark, which is still a placeholder dot.

## 6. Design decisions

**Following the mockups**

1. **The chart carousel is kept on the holding page** — trend, then period bars, with page dots. On
   Home it became a trend line beside a ranked allocation list when the design system replaced the
   donuts (§5); the Position ledger now carries the assets-vs-liabilities split.
2. **Holding rows carry one change figure**, not the mockups' percentage-and-amount pair
   (design-system §2.1).
3. **Sort By, Comparison Options, Filters and Add Tracking** are the mockups' menus, with the same
   options — including Filters' `Show Only` / `Types` / `Tags` (OR-AND) / `Filter Archived` and
   the Reset / Cancel / Apply footer.
4. **The detail page** keeps the monthly/quarterly/yearly bar chart, expandable value rows and the
   bottom **Update** button. It drops the stat-pill row (Type, Last update, Started on, ATH, YTD):
   each pill repeated something already on the page, or was a statistic nobody asked for. An opened
   value shows only the original-currency amount and "Added 3 days ago by Claude", not the
   mockups' five labelled lines that restated the row (Founder review, 2026-09-25).
5. **Insights is the mockups' card stack**, not a list: `<Period> growth` bars with the change
   labelled above each bar, `Assets vs. liabilities` trend, and `Distribution` stacked bars with
   liabilities below the zero line. The stat cards became one sentence, the average change: the
   other two cards repeated Home's total and the first row of the period list.

**Departing from the mockups, on purpose**

6. **Four tabs, not three.** The mockups predate the MCP layer entirely. Agent is a tab, not a
   settings page, because PRD §5 makes J5/J8 the point of the product — burying the connection
   would contradict the thing v1 exists to prove (M3, M9).
7. **Responsive, not a phone in a box.** Below 900px it is the mockups' single column with a bottom
   tab bar. At 900px and up it becomes a sidebar plus a 12-column grid, so Home shows the charts,
   the holdings list and the position summary at once. v1 is a web app (N7).
8. **Accessibility is a first-class field, captured as facts** (§4 above). Not in the mockups at
   all. The first version asked "How accessible is it?" as a three-way choice; the amended J2
   forbids that, and it is gone.
9. **Agent provenance is visible everywhere.** Values written by an agent are badged with the client
   name on the list, the history row and the audit log (J6, J7).
10. **The audit log groups an agent's turn**, so one turn's writes can be undone together rather
    than row by row (J7).
11. **A period drill-down** was added — tap any period in Insights to see which holdings drove it,
    ranked by contribution. J11 requires it; the mockups have no such screen.
12. **Carried-forward is marked**, and the Insights copy states that periods derive from value dates,
    not entry dates. Both are J11 requirements that a visual mockup cannot express.
13. **"Don't Show" is explained, not just offered.** The exclusion note says in words that it changes
    Insights only and leaves Home's net worth alone, because that distinction is invisible otherwise.
14. **Staleness is surfaced**, not just labelled: Home shows a count of stale holdings with a route
    to the agent.

**Dropped from the mockups**

15. Pro tier and membership (monetisation deferred), haptic feedback (native-only), "Show Legacy
    Trend Graph" and "Use Old Logic in New Trend Graph" (compat cruft), and "Show currency update
    toast" — that last one belongs to background FX refresh, which PRD §4.2 reserves.
16. The old product name and branding throughout.

**What is deliberately NOT in the prototype**

17. **No design or scope commentary in the UI.** Notes explaining why something was or was not
    built belong in this document, not in the product. Four such notes were written into screens
    and then removed — on New Goal, on the mockup toggles that were dropped, on accessibility being
    an addition, and on Stage 3 re-checking the ChatGPT connector. A prototype is shown to users;
    anything addressed to the Founder is noise to them and makes the product look unfinished.
    The only text in the UI that speaks about the prototype is tester orientation (the agent replay
    banner, and the PROTO drawer), which a tester genuinely needs to read the screen correctly.

**Prototype-only scaffolding**

18. The PROTO drawer shows the §3.5 analytics events as they fire, with their properties. It is
    there so the event contract is reviewable at design time rather than at build time, and it
    demonstrates the N9 constraint: names, counts, timings and segment only, never amounts or holding
    names. It can also pretend the browser is somewhere else, so the region confirmation can be
    tested from anywhere.

**Added in the rework (amended J1, J2, §2.3)**

19. **The basics are the last part of onboarding, one question per screen** (Founder, 2026-09-25;
    this reverses the first version, which put them on Home beside the agent and a tile grid). Each
    "yes" creates the holding immediately and shows what it counts toward; **Done for now** on
    every screen loses nothing, so nothing here has to be finished. Home is left to show the
    picture. An empty Home has one action, "Add what you have", which reopens the basics.
20. **Facts are folded into the checklist question.** J1 allows only "do you have this?" and
    "roughly how much?"; J2 needs "do you live here?" for property. "Do you own **the home you live
    in**?" satisfies both — the fact is the question.
21. **The checklist skips what you already have** — add CPF with + first, and the CPF question is
    not asked. A follow-up is asked after a yes, or when the thing it follows is already there.
22. **The first picture is a sentence and a ledger.** Under the total: *You could use $4,000 of it
    this month.* Below: the Position ledger — could use / sell first / locked away with **until when**
    / not decided / assets / you owe, where "you owe" is also stated against what you could use
    ("3.0× what you could use this month"). This is PRD §2.2 made concrete: arithmetic and defaults
    only, no inference, and it is also the §2.4 "arithmetic already done" layer rendered for a person.
23. **No trend, no change figures and no baseline control until there is history.** For a new user
    those are "+$0 0.00%" and an empty chart — noise exactly where the first picture has to land.
24. **Sign-up is only a way in; region and segment come after it** (Founder, 2026-09-25). Sign-up
    is a provider or an email then a password. Then onboarding asks two questions, one per screen.
    Region is inferred and pre-selected, but the user must press Continue on it: the region decides
    the checklist on the next screen, so it cannot become a silent guess. Segment is J1's "one
    skippable question". Currency follows the region, and a **Change** link sits beside it rather
    than a third question.
25. **The segment answer changes nothing on screen.** Everyone sees the same flow. If the UI adapted
    by segment, per-segment differences in M2–M11 would be partly our own doing, and §3.3's
    per-segment kill reading would stop being clean.
26. **After adding a holding, you land on Home**, where it is listed under the total (J1), instead of
    on the holding's own page.
27. **Money and dates follow the pack's conventions** (the browser's own, for generic). A UK user
    sees £, a Malaysian sees RM — the generic pack does not degrade to dollar signs.
28. **The landing page is not in the prototype** (Founder, 2026-09-25). It is a marketing page and
    gets its own dedicated design; its call to action routes to `#/signup`. Its brief stands (PRD
    G-D1): lead with §2.5's line, *you can't get useful advice from an AI that doesn't know where
    you stand*, carry both proofs beneath it, and name no local institution, because nobody has
    said where they live yet.
29. **What the prototype fakes at sign-up.** It holds one account per browser. The providers' own
    consent screens are not simulated: Google or Apple signs in to that account, or creates it.
    Log-in accepts any password for the account's email. No password is ever stored, not even in
    this prototype's `localStorage`. The production build must use the providers' official
    sign-in buttons.

## 7. Decisions — status after the Founder's review (2026-09-24)

1. **Undecided accessibility state — decided: named in J2** (PRD §9.6 item 12). Undecided counts
   toward net worth, never toward what could be used this month, is marked "not decided" wherever
   it is listed, and is reported to the agent as incompleteness. The prototype already behaved this
   way; the PRD now says so.
2. **G-D1 and G-D3 — decided: re-worded to §2.5** (§9.6 item 13). The Founder delegated the wording,
   so it is AI-drafted and flagged for reading at this gate. G-D3 now also requires the launch to
   reach P-B and P-C in enough volume, since they carry the kill criteria.
3. **`via` on `holding_created` — decided and built** (§3.5, §9.6 item 14): `guided` or `form`,
   shown in the PROTO drawer. (`starter` went with the starting tiles, §9.6 item 20.)
4. **The desktop layout — open.** The Founder is reviewing the overall UI/UX; this gate waits on it.
5. **Net Worth Goals — out of v1**, nothing to build or test. **Tags AND/OR — kept.** **Value Note
   and Mark on graph — out of scope** (Founder, 2026-09-24): removed from the prototype along with
   the data they wrote, their seeded examples and the export column, so nothing implies they exist.

## 8. Risks and open questions

- **This prototype does not validate §2.4.** The Agent → Try it screen is a scripted replay. It
  shows what the context layer is *for*; it is not evidence that NetNet beats a spreadsheet upload
  on a weak model. A13 and M12 can only be tested against a real MCP server, in Stage 5/6.
- **The basics may feel slow to P-C.** Six yes/no questions are right for someone who has never
  added it up and possibly tedious for someone with 25 holdings. Everyone can stop, add something
  specific, or go to the agent — watch whether P-C does so unprompted, or plods through.
- **"Roughly how much, across all of them?" lumps things together.** One "Bank accounts" holding for
  three accounts is right for a first picture; whether people split it later — or ask the agent to —
  is a test question, not a design one.
- **The sample user is liquid, so the demo answer is "yes".** With ~S$1.04M usable, the honest
  answer to "can I afford a S$120k car" is yes. The empty-account path is now where the sharper
  story lives: a P-A with $4,000 usable and $12,000 owed sees it without an agent at all.
- **Region inference is a guess by design.** Many people in Singapore run en-US browsers, so time
  zone is read first. Either way the user confirms it.
- **"All+1" range semantics were guessed** from the Insights frames.
- **A pack edit must not reclassify existing holdings** (PRD §9.6 item 17). The prototype saves
  each holding's accessibility when it is created, but reads the reason shown beside it live from
  the pack. That is harmless while packs change only by release. Once an admin can edit a default,
  the two can contradict each other: a holding still counted as locked, now explained as "can be
  sold within days". Stage 3 should version packs and keep the applied reason with the outcome.
- **No pagination on value history.** Stage 3 should decide whether the API pages it.
- **Charts are hand-rolled SVG.** Deliberate — a charting library is a Stage 3 choice.
- **Nothing here is a stack opinion.** No framework, no database, no hosting. Stage 3 owns all of it.

## 9. User test script

**Who.** Five or six people across all three personas in PRD §2, SG/SEA: **two P-A** (first job,
has never added it up), **two P-B** (tracks it, misses months), **one or two P-C** (a spreadsheet,
a lot of holdings, uses ChatGPT or Claude on it already). At least one person who does *not* live
in Singapore, to test the generic pack. 20–25 minutes each, screen-share, think-aloud.

**Before each session:** PROTO → empty account. For the non-Singapore tester, PROTO → Browser
location → their country, or No hint at all.

**Say first:** "This is a clickable prototype, not a real product — nothing you type is saved
anywhere and none of the money in it is real. Please think out loud, and tell me when something is
confusing. You cannot break it, and if something does not work that is my fault, not yours."

**Warm-up (2 min).** Do you know roughly what you're worth? How would you find out? When did you
last look? *P-A: listen for "never". P-B/C: listen for staleness in their own words.*

**Task 1 — Sign up (2 min).** "Create an account." *Watch: do they read the region question or just
tap? Is the segment question neutral, or does anyone bristle at it? Does anyone want to skip region?*
(J1, §2.3 rule 2)

**Task 2 — First picture (5 min).** "Get your actual situation into this, roughly." *Watch: which
route — the basics to the end, "Done for now", or the agent? P-A: do they get to the end, or stop — and does what
was counted feel right? P-C: how fast do they leave the basics?* Then point at Home: **"What is this
telling you that you didn't already know?"** *This is the J1 first-picture criterion and A12/M11. If
the answer is "nothing", the first picture has failed, whatever else went well.* (J1, M2, M11)

**Task 3 — Something ambiguous (3 min).** "Add a property — say, a flat." Then: "Now add something
NetNet wouldn't know about — say, a loan you made to a relative." *Watch: is "Do you live in it?"
answered without hesitation? Is the consequence line read, and understood? Does anyone reach for
Not sure, and is that a relief or a worry?* (J2)

**Task 4 — Record a change (3 min).** Switch to the sample account. "One of these has changed since
you last checked — update it." *Watch: do they find Update? Do they expect the new number to replace
the old, or to join a history?* (J3)

**Task 5 — Read the picture (3 min).** "You are looking at this after three months away. How did the
last quarter go, and what drove it?" *Watch: Insights or Home? Do they find the baseline control? Do
they understand "carried forward"?* (J4, J11)

**Task 6 — The agent (4 min).** "You want ChatGPT or Claude to be able to answer questions about
this. What would you do?" Then walk them through Agent → Try it. *Watch: do they find the Agent tab
unprompted? At the point the agent writes to their data — what is the reaction?* (J5, J6, A1, A2)

**Task 7 — Trust (2 min).** "The agent got a number wrong. Fix it." Then: "You've decided to stop
using this. What now?" *Watch: Activity and undo; does export/delete reassure or alarm?* (J7, J10)

**Close (2 min).**
- Would you actually connect your agent to this? What would stop you?
- Would you come back to this before connecting an agent? Why? *(A12, M11)*
- If this were free forever, what would you pay for? *(tests §4.2)*
- What would you call this, in one sentence, to a friend? *(tests §2.5)*

**What would make me change the PRD, not the design:** P-A testers finding nothing new in the first
picture (A12 is wrong, and P-A should be dropped per §3.3); nobody reaching for the agent unprompted
(A1); people refusing agent writes in principle (A2); or everyone asking "can I afford this from my
*income*", which is the cash-flow risk PRD §8 already names.

Per the workflow, any learnings from these sessions go back into `01-prd.md` **before** this stage
is approved.
