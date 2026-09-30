# 02 — Prototype notes

Status: **approved** · Stage owner: Product designer
Inputs: `docs/01-prd.md`, the Founder's iOS mockups (shared in-session, deliberately not committed —
see `docs/reference/mockups/README.md`)

---

## 1. How to open it

Open `docs/02-prototype/index.html` in a browser. No build, no server, no install — it is plain
HTML, CSS and JavaScript on purpose. Works offline.

- Try it at **phone width and desktop width**; the layout is genuinely different, not scaled.
- It follows your OS light/dark setting. Light (cream) is the reference theme.
- The **PROTO** button (bottom left) resets to the sample account, switches to an empty first-run
  account, shows the analytics events as they fire, and can **pretend the browser is in
  Singapore, Malaysia, the UK, Germany, or nowhere**, so the region question can be tested from
  anywhere. It also runs the **comeback reminder**: skip 30 days, let the agent check NetNet, make
  push fail, pretend this browser can or cannot receive push, and open what NetNet sent outside
  itself (§7).
- State is kept in `localStorage`, so your changes survive a reload until you reset.

**Two ways in, one per kind of user.**

| Start from | Shaped like | What it shows |
|---|---|---|
| The sample account (default) | **P-C, Established** — ~S$1.84M, 12 holdings, SGD and USD, CPF, an HDB flat, unvested RSUs, a deliberately stale car | Everything at scale: Insights, history, agent writes, undo, reminders |
| PROTO → empty account → sign up | **P-A or P-B** — whoever you say you are | Sign-up, onboarding (region, segment, the basics), the first picture, fact-based accessibility |

**All data in it is fictional.** It is not anyone's real balance sheet and must never be replaced
with one.

## 2. Flows covered, against the PRD jobs

| Job | Where it is | Notes |
|---|---|---|
| **J1** first picture fast | Sign up → onboarding → Home | Sign-up is a provider (Google, Apple) or email then password; nothing else. Onboarding: where you live (inferred, one tap to confirm) and an optional segment, one per screen. Then the intro screen: **Start** opens **the basics**; below a rule, "Let your AI agent do this" with an outlined **Connect to agent**. The basics: one question per screen, each yes saved at once, "Done for now" always available, **Skip** on every question and its amount, **‹ Back** on every question (correct an answer, or change yes to no, which removes what it added and its follow-ups; from the first question, back to the intro). An empty Home offers "Add what you have" and the same agent block. Log out / log in from Account; logging in resumes onboarding where it was left |
| **J1** the first picture | Home, as soon as there is one holding | The **Position** ledger says what you could use this month, what you'd have to sell first, what is locked away, what is not decided, and what you owe. None of it was typed in |
| **J2** track anything | Add Tracking → New Asset / New Liability; Manage Types; Manage Tags | User-defined taxonomy on top of universal types; rename/delete cascades to holdings |
| **J2** accessibility | Add form, holding page, Home | A fact question only where the type is ambiguous; otherwise the default and its reason in one line, with **Change**. The consequence is shown, never the category. "Not sure" is always allowed and never blocks saving (§4) |
| **§2.3** jurisdiction packs | `packs.js`; Account → General → Where you live | Generic, SG, MY and UK packs. Switching region relabels every type you have not renamed and re-words every reason, live (§3) |
| **J3** record and correct | Holding detail → Update / Add Value / Edit Value / Delete | Back-dating, same-date warning |
| **J4** see the picture | Home: trend and allocation carousel, Position ledger (includes assets vs liabilities), holdings, baseline, sort, filters (Show Only and Don't Show) | Every % on screen is relative to the chosen baseline. Change figures appear once there is history; until then the trend (and a holding's chart) hold their place as a frosted "Need more data" placeholder saying what makes them appear. Line charts read point by point |
| **J5** connect the agent | The intro screen, the empty Home, a holding's "Ask your agent", the Agent tab | One flow everywhere: choose the agent (ChatGPT, Claude, Other agent) → verify the email if needed → steps for this platform (phone or computer, switchable), each with a screenshot slot → NetNet's approval page (**Allow** / Cancel) → done, with no "I've done it" button. **Other agent** gets a generic guide (the address, "add a custom connector"), no platform switch or screenshots. Back returns step by step to where you began. On the agent route, Allow ends onboarding on a blank Home whose hint is the starting prompt and **Let Claude do it** (opens claude.ai with the prompt typed in). The **Connect to agent** icon turns through ChatGPT and Claude every two seconds. Grok and Muse are `parked` in `connectors.js`, reachable by no list or address. Revoke on the Agent tab. Two outside events are stood in for by dashed "Prototype:" buttons: opening the verification link, and the agent opening the approval page |
| **J5** security email | Sent on every **Allow**; PROTO → Sent outside NetNet | "Claude was connected to your NetNet", when, and "Not you? Revoke it" to the Agent tab. Email only, cannot be turned off; listed under Account → Notifications → Security as "Always" |
| **J6** agent assembles | Agent → Try it | Scripted turn: finds the existing holding rather than duplicating, then writes |
| **J7** verify and undo | Activity | Single undo and whole-turn batch undo; web and agent changes in one list |
| **J8** grounded advice | Agent → Try it (second half) | The affordability question answered off money you could use, with staleness caveats. **A scripted replay — see §8** |
| **J9** stay current | Stale chips on Home and detail; the out-of-date note on Home | In the app only. The note hands the job to a connected agent ("Ask Claude to update it", a prompt with no data in it), or offers to connect one |
| **J10** own the data | Account → Export / Delete account | Export downloads JSON and CSV, including accessibility and the answer behind it |
| **J11** insights | Insights tab | Monthly/Quarterly/Yearly; Growth, Assets vs Liabilities, Distribution Over Time; Insights Filters with "Don't Show"; period drill-down. With too little history, each chart is a frosted placeholder and the summary line says what a comparison needs |
| **J12** comeback reminder | Home's one-time card below the Position ledger; Account → Notifications; PROTO → Comeback reminder | See §7 |
| **§3.5** events | PROTO → events | `{segment}` rides on every event: `unknown` until onboarding, then whatever was chosen, or `unknown` if skipped. `signup_started` and `account_created` carry `{method}` |

Deliberately **not** built, because they are not design questions: real auth, real OAuth, a real
MCP server, email sending, a service worker and real web push, the landing page (a separate
marketing design, PRD G-D1, whose call to action routes to `#/signup`), and anything on the
reserved list in PRD §4.2.

## 3. Jurisdiction packs (PRD §2.3, N10)

**Where they live.** `packs.js` — a data file with no functions in it. `app.js` names no local
institution, rule or default; it reads the world only through the pack. Adding a market is a new
entry in `PACKS` plus a `COUNTRY_PACK` line pointing a country at it. No change to the flow.
`packs.js` is the shape a human admin would edit in the future admin portal (PRD §2.3).

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
own; a country pack overrides only what is genuinely local. **Generic asks** "could you take money
out today without a penalty?" for a tax-advantaged account, because ISAs and IRAs answer
differently; **SG does not ask**, because there that type is SRS and the answer is not in doubt.

The prototype carries three country packs, **Singapore, Malaysia and the UK**, chosen to show the
machinery's range; the other launch countries (PRD §2.3) are content for production. Any other
country, Germany for example, runs on the generic pack.

| | Generic | SG | MY | UK |
|---|---|---|---|---|
| Mandatory retirement | "Retirement account" — locked until you're eligible to withdraw | "CPF" — same rule, reason names CPF | "EPF" — **asks** "Is this your EPF Akaun Fleksibel?": Fleksibel is usable, the rest locked. A pack asking where the common default decides | "Pension" — locked until you can start drawing it |
| Tax-advantaged | "Tax-advantaged account" — asks the penalty question | "SRS" — locked, reason names SRS | "PRS" — locked, tax penalty before retirement age | "ISA" — asks the penalty question (a Lifetime ISA differs from the rest) |
| The basics | Bank, pension, investments, own home, car, anything owed | Bank, CPF, investments, own home → home loan?, car → car loan?, anything else owed | Bank, EPF → Akaun Fleksibel?, investments, own home → home loan?, car → car loan?, anything else (PTPTN) | Bank or savings, pension, investments (incl. ISAs), own home → mortgage?, car → finance?, anything else owed |
| Own default types | none | Car loan | Car loan | Car finance |
| Conventions | Browser locale; currency from region | `en-SG`, SGD | `en-MY`, MYR | `en-GB`, GBP |

**Where the region comes from.** In the product, the **country detected from the visitor's IP**,
looked up by NetNet's own server or CDN. It is pre-selected and then **confirmed by one tap in
onboarding**, never applied silently (§2.3 rule 2); IP is wrong behind a VPN or while travelling.
The prototype has no server, so PROTO → "Country detected from IP" simulates the lookup, and
otherwise the browser's time zone stands in for it. "Somewhere else" lists **every country** (ISO
3166-1, plus Kosovo), alphabetically, with none pinned to the top. Each country brings its currency
as the default for totals. Changeable afterwards in Account → General. Any country without a pack
gets generic, and the country is still recorded — that is the demand signal for which pack to write
next.

**A known edge, handled rather than hidden.** When a pack turns an ambiguous type into a default
(SG's SRS), a foreign instance of the same universal type inherits the local default — a UK ISA
filed under "SRS" would read as locked. The stated reason names SRS, which makes the mismatch
visible and one tap to override, and filing it under Other asks the universal question instead.
This is why reasons must always name the local instrument.

## 4. Accessibility, as the user meets it (PRD J2)

The data model is accessible / illiquid / locked, plus **undecided**. The user never sees those
words. They meet one of three things:

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

`design-system.md` is the spec: **"Poster"**, cream stock, black outlines, hard offset shadows, one
tomato ink, Unbounded + Space Grotesk. Decisions it locks in beyond appearance:

- The agent's ink is a *structural* device, not a badge — a blue bar on a row's inner edge, used
  identically on Home, value history and the audit log.
- The allocation is a ranked list, not a donut; its direct labels satisfy the light-mode relief rule.
- The trend line is the brand ink, never gain/loss.
- Every token is measured, not chosen by eye.

Components made for this product: the **Position ledger**, **choice row**, **consequence line**,
**amount entry**, **prompt card**, **floating action** and **nudge card** (`design-system.md` §6).
Still open (`design-system.md` §9): the wordmark, and dark mode checked on a real phone.

## 6. Design decisions

**Following the mockups**

1. **Home's trend and allocation share one place under the total**: a carousel swiped sideways on
   a phone, side by side on a computer. The allocation is a ranked list. The Position ledger
   carries the assets-vs-liabilities split. **The holding page stacks its two charts**, trend then
   period bars, so both are visible without swiping.
2. **Holding rows carry one change figure**, not the mockups' percentage-and-amount pair
   (design-system §2.1).
3. **Sort By, Comparison Options, Filters and Add Tracking** are the mockups' menus, with the same
   options — including Filters' `Show Only` / `Types` / `Tags` (OR-AND) / `Filter Archived` and
   the Reset / Cancel / Apply footer.
4. **The detail page** keeps the monthly/quarterly/yearly bar chart and expandable value rows. Its
   **Update** floats bottom-right, so a long history never pushes it out of reach, and sinks behind
   the tab bar at the very bottom so it never covers the last value. There is no stat-pill row
   (Type, Last update, Started on, ATH, YTD): each pill repeated the page or was a statistic no job
   asks for. An opened value shows only the original-currency amount and "Added 3 days ago by
   Claude".
5. **Insights is the mockups' card stack**: `<Period> growth` bars with the change labelled above
   each bar, `Assets vs. liabilities` trend, and `Distribution` stacked bars with liabilities below
   the zero line. The stat cards are one sentence, the average change.

**Departing from the mockups, on purpose**

6. **Four tabs, not three.** The mockups predate the MCP layer. Agent is a tab, not a settings page,
   because PRD §5 makes J5/J8 the point of the product (M3, M9).
7. **Responsive, not a phone in a box.** Below 900px it is a single column with a bottom tab bar.
   At 900px and up it is a sidebar plus a 12-column grid, so Home shows the charts, the holdings
   list and the position summary at once (N7).
8. **Accessibility is a first-class field, captured as facts** (§4). Not in the mockups at all.
9. **Agent provenance is quiet.** An agent-written value carries the blue mark on its row; the
   client is named only when the value is opened ("Added 3 days ago by Claude"); the Activity log
   keeps full attribution (J6, J7).
10. **The audit log groups an agent's turn**, so one turn's writes can be undone together (J7).
11. **A period drill-down**: tap any period in Insights to see which holdings drove it, ranked by
    contribution. J11 requires it; the mockups have no such screen.
12. **Carried-forward is marked**, and the Insights copy states that periods derive from value dates,
    not entry dates (J11).
13. **"Don't Show" is explained, not just offered.** Home's filter and Insights' each have it, and
    each sheet says it hides from that screen only. Picking a type or tag under one half takes it
    off the other.
14. **Staleness is surfaced**, not just labelled: Home shows a count of stale holdings with a route
    to the agent.

**Dropped from the mockups**

15. Pro tier and membership, haptic feedback (native-only), "Show Legacy Trend Graph", "Use Old
    Logic in New Trend Graph", and "Show currency update toast" (background FX refresh is reserved,
    PRD §4.2). Net Worth Goals, notes on a value and marking a value on a chart are out of v1 and
    absent from the prototype and its data, so nothing implies they exist.
16. The old product name and branding throughout.

**Prototype-only scaffolding**

17. The PROTO sheet shows the §3.5 analytics events as they fire, with their properties, so the
    event contract is reviewable at design time. It demonstrates N9: names, counts, timings and
    segment only, never amounts or holding names. All scaffolding stays in PROTO or in dashed
    "Prototype:" stand-ins (design-system §2.1 rules 9 and 11).

**Onboarding and the first picture (J1, J2, §2.3)**

18. **The basics are the last part of onboarding, one question per screen.** Each "yes" creates the
    holding immediately and shows what it counts toward; **Done for now** on every screen loses
    nothing. An empty Home has one action, "Add what you have", which reopens the basics.
19. **Facts are folded into the checklist question.** "Do you own **the home you live in**?"
    satisfies J1's "do you have this?" and J2's "do you live here?" at once.
20. **The checklist skips what you already have** — add CPF with + first, and the CPF question is
    not asked. A follow-up is asked after a yes, or when the thing it follows is already there.
21. **The first picture is the Position ledger**: you could use this month / you'd have to sell
    first / locked away / not decided yet / you owe, each with what is in it beneath. This is PRD
    §2.2 made concrete (arithmetic and defaults only) and the §2.4 "arithmetic already done" layer
    rendered for a person.
22. **No change figures and no baseline control until there is history.** For a new user those are
    "+$0 0.00%" — noise exactly where the first picture has to land. The trend keeps its place as a
    placeholder (item 29).
23. **Sign-up is only a way in; region and segment come after it**, one question per screen.
    Region is pre-selected but the user must press Continue: it decides the checklist on the next
    screen. Currency follows the region, with a **Change** link rather than a third question.
24. **The segment answer changes nothing on screen.** If the UI adapted by segment, per-segment
    differences in M2–M11 would be partly our own doing, and §3.3's per-segment kill reading would
    stop being clean.
25. **After adding a holding, you land on Home**, where it is listed under the total (J1).
26. **Money and dates follow the pack's conventions** (the browser's own, for generic). A UK user
    sees £, a Malaysian sees RM.
27. **What the prototype fakes at sign-up.** It holds one account per browser. The providers' consent
    screens are not simulated: Google or Apple signs in to that account, or creates it. Log-in
    accepts any password for the account's email. No password is ever stored, not even in
    `localStorage`. The production build uses the providers' official sign-in buttons.

**Charts, prompts and type**

28. **Line charts can be read point by point**: hover, tap, press-and-drag, or the arrow keys, on
    Home's trend, a holding's trend and Insights' assets vs. liabilities (design-system §5). Bar
    charts already carry their values, so they get no readout.
29. **A chart with too little data is a placeholder, not a gap.** Each chart keeps its place: a fixed
    sample of its shape in neutral ink under frosted glass, labelled "Need more data". Home and the
    holding page add one line saying what makes it appear, a later update or an earlier value. The
    holding page shows one placeholder, not two. Insights says the reason once, in the summary line.
    Range bar, pager and legend are not shown on a placeholder. "Nothing to show" when Insights
    filters leave nothing; "Pick a longer range" when history exists but the range holds too little.
30. **A prompt is a prompt card**: a card with a mustard tab and Copy inside, so the one thing the
    user must take to their agent reads as an object to pick up, not part of the page. Used for the
    blank Home's starting prompt and "Ask your agent".
31. **Text is 15% larger on a phone, with an 11px floor** (design-system §3). Every phone screen is
    checked at 390px and 320px wide for sideways scrolling, colliding siblings and wrapping labels.
    Chart axes show three dates on a phone instead of four.

**The comeback reminder and the security email (J5, J12)**

32. **The Home card is a note, not a card with a shadow.** Outlined, no hard shadow, one outlined
    button and a link: the quietest object that still asks. It sits below the Position ledger, so
    the first picture is read before anything is asked.
33. **The confirmation lives where the tap was.** Granted and blocked are one line in the card (or
    under the switch) until the person leaves the screen; no toast, no second screen.
34. **Blocked is final on Home, explained in Settings.** Once the browser says no, NetNet cannot ask
    again, so the switch is dimmed and says where to allow it.
35. **"Your browser will ask you first."** under the undecided switch: the browser's prompt is the
    one thing NetNet does not control, so the person is told it is coming.
36. **Reminders off hides the channels.** The page shows "no reminder by any channel" itself rather
    than leaving switches that no longer do anything.
37. **The security email is listed in Settings as "Always"**, with no switch. Someone who turns
    Reminders off and then gets an email when they connect ChatGPT would otherwise doubt the switch.
38. **The email explains itself in its footer**: "after a month away … never more than once a
    month". No count of days, no "you haven't …".
39. **The previews are scaffolding in a sheet**, opened from PROTO, with a dashed caption saying who
    was reached, when and why. The lock screen and the inbox row keep the OS's and the mail app's own
    look; the email itself is NetNet's.

## 7. The comeback reminder and the security email

**Try it.** Sample account → Home: the card is below the Position ledger. Account → Notifications
for the settings. PROTO → **Skip 30 days without checking NetNet** to see a reminder arrive; PROTO
→ **Sent outside NetNet** lists everything sent so far, including the security email from when
Claude was connected. To see the email path, remove the Android phone in Settings first, or pick
PROTO → "No, like Safari in an iPhone tab".

| Where | What |
|---|---|
| **Home** | A quiet card below the Position ledger (and the out-of-date note): a bell, "Want a gentle nudge on this device if you haven't looked in a while?", an outlined **Turn on** and a **Not now** link. It appears only with a first picture, on a browser that can receive push, where this device has not decided and Reminders is on. Never on an empty Home, never during sign-up or the basics |
| **Turn on** | The browser's own prompt follows the tap, stood in for by a dashed "Prototype: the browser's own prompt" box with **Block** and **Allow**. Allow: the card becomes one line, "Notifications are on for this device." Block: one line, "Notifications are blocked in this browser. To allow them, tap the icon beside the address, then Permissions." (a computer says "click … and turn on Notifications"; an installed app says "in your phone's settings"). Either way the card is gone on the next visit, and NetNet never asks again |
| **Not now** | Hides the card for 30 days; a second Not now hides it for good. The switch stays in Settings |
| **Account → Notifications** | **Reminders** (the master switch). Under "How they reach you": **Notifications on this device** (only where the browser can receive push; blocked shows the where-to-allow line in `attention` and the switch dimmed) and **Email reminders** ("Only when no device has notifications on. Sent to …"). **Other devices** with Remove. "Reminders never include an amount or a holding name." Then **Security**: "Email when an agent is connected · Always", with no switch. Reminders off hides the channels and devices |
| **The push** (PROTO) | A phone's lock screen: "Chrome · netnet.app · now", title **NetNet**, "Your net worth is due for an update. Just ask Claude." A computer that was reached gets a notification banner too. Tapping it opens Home as a new visit |
| **The email** (PROTO) | The inbox row (subject is the same line), then the email opened: wordmark, the line in the display face, "Just ask Claude.", one button **Open NetNet**, and a footer: "We send this after a month away from NetNet, and never more than once a month. Turn off reminder emails" (one click) |
| **The security email** (PROTO) | "Claude was connected to your NetNet"; "On 5 Aug 2026 at 5:32 am, you allowed Claude to see your holdings and their history, and to add or update them."; "Not you? **Revoke it**" to the Agent tab; "We send this every time an agent is connected. It can't be turned off." Sent on every Allow, whatever the Reminders settings |

**The rules the prototype runs** (watch them in PROTO):

- **Checking** is opening NetNet (a new session) or the connected agent reading or writing through
  it. PROTO's "Claude reads NetNet" and the agent demo's tool calls both restart the clock.
- **Who gets what:** push to every device where it is on (this one and the others); email only when
  none is on, or when every push fails (PROTO → "every push fails" drops the devices with
  `push_disabled {by: browser}` and falls back to email). Email only to a verified address. Nothing
  at all when Reminders is off, or when there is no push and no usable email; PROTO says which.
- **Monthly while away, at most three times:** each 30 days without checking sends the next one
  (days 30, 60 and 90). After the third, NetNet stays silent until the person checks it again, which
  makes three available again. PROTO says when a skip sends nothing for this reason.
- **Daytime only:** a reminder due at night goes at 08:00 their time; in the daytime it goes then.
- **The agent named** is the connected one used most recently; with none, the line stands alone.
- **Sign-out** turns this device's push off (`push_disabled {by: signout}`). Signed in again, the
  card does not come back (the browser already decided) and the switch turns it on without a prompt.
- Dates on the Agent tab and in the security email are in the person's own time zone.

**Events:** `push_prompt_shown {entry: home|settings}` (settings: Notifications opened with this
device undecided), `push_prompt_result {entry, result: granted|denied|not_now}`, `push_enabled
{platform}`, `push_disabled {platform, by}`, `reminder_sent {channel}`, `reminder_opened {channel}`,
`security_email_sent {client}`. None carries an amount or any message text (tested).

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
  answer to "can I afford a S$120k car" is yes. The empty-account path is where the sharper story
  lives: a P-A with $4,000 usable and $12,000 owed sees it without an agent at all.
- **Region is a guess by design.** In the product it comes from the visitor's IP, which is wrong
  behind a VPN or abroad; either way the user confirms it.

## 9. User test script

Not yet run; it carries forward to the build. Learnings that change requirements go into
`01-prd.md`.

**Who.** Five or six people across all three personas in PRD §2, SG/SEA: **two P-A** (first job,
has never added it up), **two P-B** (tracks it, misses months), **one or two P-C** (a spreadsheet,
a lot of holdings, uses ChatGPT or Claude on it already). At least one person who does *not* live
in Singapore, to test the generic pack. 20–25 minutes each, screen-share, think-aloud.

**Before each session:** PROTO → empty account. For the non-Singapore tester, PROTO → Country
detected from IP → their country, or not detected.

**Say first:** "This is a clickable prototype, not a real product — nothing you type is saved
anywhere and none of the money in it is real. Please think out loud, and tell me when something is
confusing. You cannot break it, and if something does not work that is my fault, not yours."

**Warm-up (2 min).** Do you know roughly what you're worth? How would you find out? When did you
last look? *P-A: listen for "never". P-B/C: listen for staleness in their own words.*

**Task 1 — Sign up (2 min).** "Create an account." *Watch: do they read the region question or just
tap? Is the segment question neutral, or does anyone bristle at it? Does anyone want to skip region?*
(J1, §2.3 rule 2)

**Task 2 — First picture (5 min).** "Get your actual situation into this, roughly." *Watch: which
route — the basics to the end, "Done for now", or the agent? P-A: do they get to the end, or stop —
and does what was counted feel right? P-C: how fast do they leave the basics?* Then point at Home:
**"What is this telling you that you didn't already know?"** *This is the J1 first-picture
criterion and A12/M11. If the answer is "nothing", the first picture has failed, whatever else went
well.* (J1, M2, M11)

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

**Task 8 — Coming back (2 min).** Sample account, Home. "What is this card asking you?" *Watch: do
they read it as a nudge or a nag? Do they expect Turn on to show something from the browser?* Then
PROTO → skip 30 days, show the lock screen, then the email. "You got this after a month away. What
do you do? Is there anything on it you wouldn't want someone else to see?" *Watch: tone (A14);
whether "Just ask Claude." is understood; that nothing on it feels private (N9).* (J12, M13)

**Close (2 min).**
- Would you actually connect your agent to this? What would stop you?
- Would you come back to this before connecting an agent? Why? *(A12, M11)*
- If this were free forever, what would you pay for? *(tests §4.2)*
- What would you call this, in one sentence, to a friend? *(tests §2.5)*

**What would make me change the PRD, not the design:** P-A testers finding nothing new in the first
picture (A12 is wrong, and P-A should be dropped per §3.3); nobody reaching for the agent unprompted
(A1); people refusing agent writes in principle (A2); or everyone asking "can I afford this from my
*income*", which is the cash-flow risk PRD §8 already names.
