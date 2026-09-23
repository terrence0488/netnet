# 02 — Prototype notes

Status: **awaiting Founder review** · Stage owner: Product designer
Inputs: `docs/01-prd.md` (approved 2026-09-23), the Founder's iOS mockups (shared in-session,
deliberately not committed — see `docs/reference/mockups/README.md`)

---

## 1. How to open it

Open `docs/02-prototype/index.html` in a browser. No build, no server, no install — it is plain
HTML, CSS and JavaScript on purpose. Works offline.

- Try it at **phone width and desktop width**; the layout is genuinely different, not scaled.
- It follows your OS light/dark setting. The mockups are dark, so dark is the reference.
- The **PROTO** button (bottom right) resets to the sample account, switches to an empty
  first-run account, and shows the analytics events as they fire.
- State is kept in `localStorage`, so your changes survive a reload until you reset.

**All data in it is fictional.** It is shaped like the beachhead user in PRD §2 — ~S$1.84M across
12 holdings, SGD and USD, CPF, an HDB flat, unvested RSUs and a deliberately stale car — so the
prototype exercises the real cases. It is not anyone's real balance sheet and must never be
replaced with one.

## 2. Flows covered, against the PRD jobs

| Job | Where it is | Notes |
|---|---|---|
| **J1** first picture fast | Landing → Sign up → empty Home | Starting categories *and* "let your agent do it" offered as equals |
| **J2** track anything | Add Tracking → New Asset / New Liability; Manage Types; Manage Tags | User-defined taxonomy; accessibility field; rename/delete cascades to holdings |
| **J3** record and correct | Holding detail → Update / Add Value / Edit Value / Delete | Back-dating, same-date warning, note + mark-on-graph |
| **J4** see the picture | Home: trend, pie by type, pie assets-vs-liabilities, baseline, sort, filters | Every % on screen is relative to the chosen baseline, and the baseline is labelled |
| **J5** connect the agent | Agent tab | Per-client steps, connector URL, no token; connect, fail and revoke all simulated |
| **J6** agent assembles | Agent → Try it | Scripted turn: finds the existing holding rather than duplicating, then writes |
| **J7** verify and undo | Activity | Single undo and whole-turn batch undo; web and agent changes in one list |
| **J8** grounded advice | Agent → Try it (second half) | The affordability question answered off *accessible* money, with staleness and FX caveats |
| **J9** stay current | Stale chips on Home and detail; Account → Reminders | Cadence and a real opt-out |
| **J10** own the data | Account → Export / Delete account | Export actually downloads JSON and CSV |
| **J11** insights | Insights tab | Monthly/Quarterly/Yearly; Growth, Assets vs Liabilities, Distribution Over Time; Insights Filters with "Don't Show"; period drill-down |

Deliberately **not** built, because they are not design questions: real auth, real OAuth, a real
MCP server, email sending, and anything on the reserved list in PRD §4.2.

## 3. Design decisions

**Following the mockups**

1. **The chart carousel is kept.** Line → pie by type → pie assets-vs-liabilities, with page dots
   and the `$`/`%` toggle. On desktop it stops being a carousel and becomes three cards side by
   side — swiping is a phone gesture, and a desktop user should not have to hunt for the pies.
2. **Holding rows carry sparklines**, as in the mockups. The sparkline is coloured by the direction
   of the line it actually draws, inverted for liabilities so a shrinking loan reads as good news.
3. **Sort By, Comparison Options, Filters and Add Tracking** are the mockups' menus, with the same
   options — including Filters' `Show Only` / `Types` / `Tags` (OR-AND) / `Filter Archived` and
   the Reset / Cancel / Apply footer.
4. **The detail page** keeps the stat-pill row (Type, Last update, Started on, ATH, YTD), the
   monthly/quarterly/yearly bar chart, expandable value rows showing Default Currency, Original
   Value, Amount Change and Percentage Change, and the bottom **Update** button.
5. **Insights is the mockups' card stack**, not a list: stat cards, `<Period> Growth` bars with the
   change labelled above each bar, `Assets vs. Liabilities` trend, and `Distribution Over Time`
   stacked bars with liabilities below the zero line.

**Departing from the mockups, on purpose**

6. **Four tabs, not three.** The mockups predate the MCP layer entirely. Agent is a tab, not a
   settings page, because PRD §5 makes J5/J8 the point of the product — burying the connection
   would contradict the thing v1 exists to prove (M3, M9).
7. **Responsive, not a phone in a box.** Below 900px it is the mockups' single column with a bottom
   tab bar. At 900px and up it becomes a sidebar plus a 12-column grid, so Home shows the charts,
   the holdings list and the position summary at once. v1 is a web app (N7).
8. **Accessibility is a first-class field** (PRD §9.3) — Readily accessible / Illiquid / Locked, set
   on every asset, defaulting by type. It surfaces as a **Readily accessible** line on Home and is
   what the agent's affordability answer turns on. Not in the mockups at all.
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

**Prototype-only scaffolding**

17. The PROTO drawer shows the §3.5 analytics events as they fire, with their properties. It is
    there so the event contract is reviewable at design time rather than at build time, and it
    demonstrates the N9 constraint: names, counts and timings only, never amounts or holding names.

## 4. Decisions I need from you

1. **Net Worth Goals / "New Goal".** In the mockups' Add Tracking menu and Account settings, but
   nowhere in the approved PRD. I did not build it and left a note in the Add Tracking sheet.
   *Recommend:* leave out of v1 and add to a later phase — it is not needed by any of J1–J11, and
   goal-setting edges toward the forward-looking territory §4.2 reserves.
2. **Value "Note" and "Mark on graph".** In the mockups' Add Value sheet, not in the PRD. I built
   both because they cost nothing and make history legible. *Recommend:* keep, and add a line to
   J3 so Stage 6 tests them.
3. **Tags OR/AND toggle.** The mockups have it in both filter sheets. It is real complexity for a
   filter most users will use once. *Recommend:* keep — this audience is exactly the kind that
   will want `Long Term AND High Risk`, and it is cheap.
4. **The desktop layout.** This is the biggest thing the mockups could not tell me. I went with a
   sidebar and a multi-column Home. *Recommend:* confirm the direction now, because Stage 3 will
   price it and Stage 4 will schedule it.
5. **Accessibility wording.** "Readily accessible / Illiquid / Locked" — is that the right
   vocabulary for an SG audience, or should CPF-style holdings say something more specific?

## 5. Risks and open questions

- **The sample user is liquid, so the demo answer is "yes".** With S$1.04M readily accessible, the
  honest answer to "can I afford a S$120k car" is yes — the accessibility split changes *what the
  answer rests on*, not the verdict. If you want the sharper "no, that's CPF" story for testing,
  the sample balance sheet needs reshaping, not the feature.
- **"All+1" range semantics were guessed** from the Insights frames. It currently means "every
  period plus one earlier". Tell me what it means in the real app.
- **No pagination on value history.** A holding with 41 entries lists all 41. Fine for a prototype;
  Stage 3 should decide whether the API pages it.
- **Charts are hand-rolled SVG.** Deliberate, to avoid signalling a charting library — that is a
  Stage 3 choice. Do not read the implementation as a recommendation.
- **Nothing here is a stack opinion.** No framework, no database, no hosting. Stage 3 owns all of it.

## 6. User test script

Five people, 20–25 minutes each, from the beachhead in PRD §2: already track their net worth
somehow, already pay for ChatGPT or Claude, multi-currency, SG/SEA. Screen-share, think-aloud.
Hit **PROTO → empty account** before each session.

**Say first:** "This is a clickable prototype, not a real product — nothing you type is saved
anywhere and none of the money in it is real. Please think out loud, and tell me when something is
confusing. You cannot break it, and if something does not work that is my fault, not yours."

**Warm-up (2 min).** How do you track your net worth today? When did you last update it? *Listen
for staleness in their own words — that is the pitch (G-D1) being validated or not.*

**Task 1 — First picture (4 min).** "Sign up and get your actual situation into this, roughly."
*Watch: do they use the starting categories, type their own, or go to the agent? Do they hit the
accessibility field and does it make sense unprompted? How far do they get in 4 minutes?* (J1, J2, M2)

**Task 2 — Record a change (3 min).** "One of your holdings has changed since you last checked —
update it." *Watch: do they find Update? Do they expect the new number to replace the old, or to
join a history? Does the multi-currency conversion detail matter to them?* (J3)

**Task 3 — Read the picture (4 min).** Switch to the sample account. "You are looking at this after
three months away. How did the last quarter go, and what drove it?" *Watch: do they go to Insights
or stay on Home? Do they find the baseline control? Do they understand "carried forward"?* (J4, J11, A6)

**Task 4 — The agent (5 min).** "You want ChatGPT or Claude to be able to answer questions about
this. What would you do?" Then walk them through Agent → Try it. *Watch: do they find the Agent tab
without prompting? At the point they see the agent writing to their data — what is the reaction?
This is A1 and A2, the two things v1 exists to test, and the reaction here is the finding.* (J5, J6)

**Task 5 — Trust (3 min).** "The agent got a number wrong. Fix it." Then: "You have decided to stop
using this. What now?" *Watch: do they find Activity and undo? Does export/delete reassure or alarm?
This audience asks these questions before signing up (A7).* (J7, J10)

**Close (3 min).**
- Would you actually connect your agent to this? What would stop you?
- What is missing that would make you keep it current for six months?
- If this were free forever, what would you pay for? *(tests the §4.2 reserved list)*
- What would you call this, in one sentence, to a friend? *(tests the G-D1 pitch)*

**What would make me change the PRD, not the design:** nobody reaching for the agent unprompted in
Task 4 (A1 is wrong, and M3 will miss); people refusing agent writes in principle (A2 is wrong, and
the context layer cannot stay current); or everyone asking "can I afford this from my *income*",
which is the cash-flow risk already named in PRD §8.

Per the workflow, any learnings from these sessions go back into `01-prd.md` **before** this stage
is approved.
