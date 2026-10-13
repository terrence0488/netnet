# P2 Test Report

Stage 6, run in a fresh session that did not do the build. Task reports were not read before
testing. Tested against `docs/01-prd.md` §6 via the criteria `docs/04-plan.md` §P2 names, plus the
P1 criteria for regressions.

## Summary

**Verdict: pass with one known open item (T8, blocked on the Founder).** Every automated gate is
green on `p2-t10` (commit `30e7188`): unit 1250/1250, integration 571/571 against scratch
Postgres 18, E2E 292 passed / 4 intentionally skipped at phone 390px and computer 1280px (with
in-test checks at 320px), lint, typecheck, and content check (8 documents valid). The N10
deny-list scan passes (3/3). The only failing P2 checkpoint item is the connect guides' phone
screenshots (P2-T8, `todo`), which need the Founder's F11 files; the guides degrade to a neutral
placeholder, never a broken image.

The first E2E run in this session failed 43 tests with sign-up returning 500: the session had no
`DATABASE_URL`. That was environment, not product — after preparing a scratch database with the
CI recipe (bootstrap, migrate, seed, `content:publish --env local`) the full suite passed. The
report below is based on that green run plus the unit and integration suites. No hands-on browser
click-through was done in this session (no browser tool); the E2E suite drives a real browser
against the built app and a real database, and the gate still needs the Founder's hands-on pass.

## Criteria results

`criterion · pass/fail · evidence`

### P2 criteria (Plan §P2)

- J1 Google and Apple sign-up/sign-in, verified, official buttons, `method` on events · **pass** · `providers.spec` 8/8 (official buttons start each flow, starts counted, log-in keeps `?next=`, failure returns plainly), unit `ProviderButtons`
- J1 "Let's start" screen and the basics (pack checklist, follow-ups only after a yes, each answer saved at once, Skip, Back with removal, "Done for now", `via: guided`, resume, P-A walk-through) · **pass** · `onboarding-basics.spec` 12/12 + `basics-skip.spec` 4/4, unit `basics`/`onboarding`
- J1 agent route from onboarding and the blank Home after it · **pass** · "ends on a blank Home with no waiting state once connected", both projects
- J1 empty Home's full rule, with and without an agent · **pass** · "one primary action, and the agent below a rule"; "with an agent connected, the starting prompt with add-it-yourself as the alternative"
- J2 tags in the Add form · **pass** · taxonomy "the Add form takes tags for an asset / for a liability"
- J2 add, rename, merge and delete types and tags, holdings follow, nothing orphaned · **pass** · `taxonomy.spec` 22/22 (rename follows on Home, delete with moveTo, merge with mergeInto, taken names refused plainly)
- J2 archive and unarchive · **pass** · holding "archives and unarchives the holding"; home "including archived lists archived holdings too", "the list foot reaches Archived"
- J2 delete from the web, audited in the rows · **pass** · "deletes the holding only after it asks, then leaves for Home"; audit rows covered by the integration suite (571 green)
- J3 edit a value on the web (amount, date, currency), recompute, audited, `value_corrected` · **pass** · "edits a value's amount, date and currency"; unit `values`/`holding-data`; integration green
- J4 total, trend and allocation (carousel; side by side on a computer), position ledger · **pass** · "net worth with what it means", "the trend and the allocation, switchable between money and percent", "on a computer, the holdings sit beside the position", "with one card, the trend stands full width"
- J4 six baselines, every figure relative and labelled, name-is-control · **pass** · "net worth against the baseline in force, labelled everywhere it appears"; "the baseline selector moves every change figure, and saves the choice"
- J4 trend ranges · **pass** · "the trend covers the range bar's span" (Home and holding)
- J4 holding trend with range bar, newest-first expandable history, top-right menu (period bar chart waits for P5) · **pass** · `holding.spec` 48/48 incl. "the menu offers Edit, Archive and Delete in that order" and the Edit screen titles; no bar chart shipped, none claimed
- J4 trend read by hover, tap, drag and arrow keys; plain swipe still scrolls · **pass** · unit `charts.test`, `chart.test`, `format.test` (all green); recommend the Founder feel this hands-on
- J4 "Need more data" placeholder · **pass** · "with one value each, the trend waits as a placeholder"
- J4 sort and filter sheet (Show Only, chips, AND/OR, Don't Show, archived, Apply), active filter visible · **pass** · "sort by value either way, name, type, change or last updated"; "filter drafts Show Only, chips and archived, applying together"; "tag chips match any or all of the tags"; choices persist across sessions
- J4 phone usable without sideways scrolling; computer side-by-side layout · **pass** · every spec ends "a sound screen at phone and computer widths"; shell checks at 320/390/1280; shared axe, tap-target and text-size checks
- J5 same connect flow from onboarding and from a holding, `entry` carried · **pass** · "the connect flow starts here with the holding entry"; start-screen agent route; `agent.spec` flow titles
- J5 prompt handoff for an empty or stale Home (starting/update prompts, prefill or Copy, no financial data in prompts) · **pass** · "where the client has no prefill address, the prompt copies instead" (both prompts); "with no financial data" titles; unit `prompts.test`
- J9 staleness labels on list and detail; stale count handed to a connected agent or offering to connect; no scheduled stale-holding message · **pass** · unit `StaleNote`; "rows carry staleness, and the stale count offers to connect an agent"; "with an agent, the stale count hands the update across in one tap"; no P2 code path sends messages (reminders are P3)
- Checkpoint: phone screenshots render in the connect guides · **fail (open, blocked)** · P2-T8 `todo`, needs Founder files (F11); "missing screenshots show a neutral placeholder, never a broken image" passes

Non-functional in P2: N7 sweep · **pass** (320/390/1280, axe, 44/36px targets, ≥11px text, shared checks every spec) · N9 enum props and no amounts · **pass** (unit `events`, `prompts`; "no financial data" E2E titles) · N10 deny-list · **pass** (3/3) · N11 pure `core` figures · **pass** (unit `chart`/`core` suites, import-rules test) · N1 `outcome`/`latency_ms` on tools · **pass** (event-schema unit tests, no failures).

### P1 regression check (Plan §3.2)

- J1 email sign-up asks nothing else, verification without waiting, resume, one holding → total, first picture states something untyped, no amounts in events, unverified cannot connect, segment carried · **pass** · `auth.spec` 18/18, `onboarding.spec` 12/12, home "net worth with what it means"
- J2 add asset/liability, liabilities subtract, four accessibility states, fact questions, pack defaults with reasons, generic pack, country confirm/alphabetical/currency, consequence shown, never blocks, undecided incompleteness, foreign original+conversion · **pass** · `add.spec` 18/18, onboarding country titles, unit `packs`/`AccessBlock`
- J3 dated values, last-write-wins with warning, `value_recorded`/`value_corrected` with source · **pass** · "adds a value from the floating Update, warning when it replaces the same date", "a back-dated value is accepted"
- J5 guides per client/platform, Other agent, Back, logos, same flow every entry, verify-first with resend, self-advancing approval, active with client+time, plain failures, revoke rejects, security email, M9 funnel · **pass** · `agent.spec` 48/48 + `agent-connect.spec` 2/2 (full OAuth with the fake agent, then revoked); connect-button logo titles
- J6 full MCP CRUD, conversational assembly with checklist/fact questions, agent mark quiet with client on the value, duplicate surfacing, precise errors, `agent_tool_called` + J3 events · **pass** · unit + integration suites green (MCP tools, Ledger, compileContext)
- J8 summary with all four §2.4 layers, small and ordered, deterministic, as-of/staleness/completeness, reads modify nothing, reads countable after week 1 · **pass** · unit + integration suites green (M12 waits for P4)
- J10 no other user's data on any screen or response · **pass** · integration isolation suites (in the 571)

## Issues found

1. **Medium — Connect guides still show placeholders where the phone screenshots go (T8 open).**
   Steps: open Connect your agent, choose Claude, switch to the phone platform steps. Expected: the
   3 Claude phone setup screenshots (F11). Actual: neutral placeholders. The placeholder behaviour
   itself is correct and tested; closing this needs only the Founder's files, and the plan never
   blocks the checkpoint on it.
2. **Low — Build warns the web chunk exceeds 500 kB after minification (655 kB, gzip 203 kB).**
   Steps: `pnpm build`. Expected/actual: advisory warning only; the build succeeds and no PRD budget
   covers bundle size (N1 budgets tool latency, not bytes). Watch item if the bundle keeps growing.

No product defect was found in any P2 flow. The 43 failures in this session's first E2E run were
the missing `DATABASE_URL` (environment), resolved before the reported green run.

## What went well

- The full gate is green in one place for the first time this phase: 1250 unit + 571 integration +
  292 E2E, plus lint, typecheck and content validation.
- CI's E2E recipe (bootstrap, migrate, seed, publish) reproduced locally on the first attempt, so
  the DB-backed specs — auth, onboarding, basics, providers — are now runnable in a cloud session.
- Failure behaviour is graceful where checked: missing screenshots placeholder, unknown holdings
  with a way back, provider failures returning plainly, delete confirmations.
- `shell.spec` "no screen logs an error or throws" passes on both projects: no console errors
  anywhere in the app.

## Suggested manual checks for the Founder

1. A real Google and a real Apple sign-in on production (needs F17/F18 live on Vercel).
2. Inbox delivery of the verification email and the J5 security email (carry-over P1 check).
3. The F16 external monitor watching `/api/health` and the OAuth metadata (carry-over P1 check).
4. Hands-on pass: the basics end to end, the Home carousel/ledger/baseline/filter, a holding's
   trend/history/menu/Edit screen, the connect flow from a holding, and the stale-handoff copy.
5. Feel-check the trend reading (hover, tap, drag, arrow keys) and the iOS Safari look (open since
   the build handoff).
6. Supply the 3 Claude phone screenshots (F11) to close T8.
