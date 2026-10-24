# P3 Test Report

Stage 6, run in a fresh session that did not do the build. Task reports were not read before
testing. Tested against `docs/01-prd.md` §6 via the criteria `docs/04-plan.md` §P3 names, plus the
P1 and P2 criteria for regressions. Code under test: `main` at `2f2293a`; production runs
`de44516` (deploy run #28), which differs only in `docs/` and `ops/`.

## Summary

**Verdict: pass. Every P3 criterion passes. Three Low issues and one Info remain, none
blocking. One check is still open: no Reminders schedule has fired yet.**

- **Product.** Every issue the last report raised is fixed. Activity is a read-only log: undo is
  gone from the screen, the REST API and the MCP tool list, locally and on production. A
  default-currency change is one `system` entry, and a person's own exchange rate survives a
  round trip exactly. Deletion leaves no row behind, and Insights' first period shows no change.
  Home puts the stale note directly under Position and the push card after it. The reminder,
  push, export, isolation and the agent tools all behave as specified.
- **Found this time.** Three Low issues. Activity names types by internal keys (`car_loan`,
  `listed`). Insights' average can pair a falling amount with a rising percent. Every sign-out
  logs an after-response failure with no cause (issues 1–3).
- **Open.** The Reminders workflow merged at 04:12 UTC today, so 09:00 UTC was its first
  slot. No scheduled run had started by 12:31 UTC. GitHub starts this repository's schedules two
  to six hours late, so the slot is still within range (Suggested check 1). The manual run at
  07:00 UTC passed.

**Automated gates** (local, Postgres 16; CI uses 18):

| Gate | Result |
|---|---|
| Lint (ESLint + Prettier) | pass |
| Typecheck | pass |
| Migrations match the schema (`db:generate`) | pass, nothing generated |
| Unit + N10 deny-list scan | 1506 / 1506 pass (134 files) |
| Content check | pass (8 documents) |
| Integration | 737 / 737 pass (58 files) |
| Build | pass |
| E2E at 390 and 1280 px (320 px in-test) | 446 passed, 0 failed, 6 skipped, in a Chromium that can receive push |
| `pnpm audit --prod --audit-level high` | pass, no known vulnerabilities |

The 6 skips: the signed-unsubscribe test at both widths (it needs `LINK_SIGNING_SECRET`, which
CI doesn't set either; covered by hand below), and the 4 layout tests that run at one width only.

**Hands-on.** The built app (`e2e/server.ts`) ran against its own database as `netnet_app`, with
VAPID keys, a link-signing secret, `CRON_SECRET` and a fake HTTPS push service. Scripts drove the
REST API, OAuth (DCR, PKCE) and MCP, and a real Chromium drove the screens at 320, 390 and 1280
px. Push payloads were decrypted off the wire. All data was fictional, with made-up exchange
rates.

## Criteria results

`criterion · pass/fail · evidence`

### P3 criteria (Plan §P3)

- J2 change country afterwards · **pass** · SG→GB with a holding added `car_finance` and kept
  all 13 types and SGD. SG→MY had nothing to add (`car_loan` is already there) and kept
  everything. An empty account moved SG→GB came back in GBP on the GB pack.
- J2 a delete shown in the audit log · **pass** · "Deleted "QA Car"" by You. Its values went, and
  the Don't Show list dropped its id.
- J3 an edit shown in the audit log · **pass** · "Updated the value for 2026-10-20 · $700 → $710
  SGD".
- J4 the holding page's period bar chart · **pass** · Monthly / Quarterly / Yearly and paging.
  "carried" sits under the months with no entry, explained below the chart, and the first month
  is not drawn as a change. The short-history placeholder is covered by `holding.spec`.
- J5 revocation shown in Activity · **pass** · "Agent disconnected · Fictional QA Agent"; the
  next MCP call gets 401 "This agent connection was revoked".
- J7 newest-first log with what changed, old → new, client and time, web changes in the same
  log · **pass** · screen and API. Agent entries name the registered client; web entries say
  "You".
- J7 one agent turn read together · **pass** · two `record_values` items and a rename show as
  "Fictional QA Agent · 3 changes at once", with one `batch_id`.
- J7 a record only, nothing in it changes data · **pass** · no Undo on the screen.
  `POST /api/activity/:id/undo` → 404, locally and on production. The MCP `undo` tool → "Tool undo
  not found", and production lists 18 tools without it.
- J7 `value_corrected` when an agent-written value is edited or deleted · **pass** · both fire
  `{original_source: agent, age_at_correction: 0}`; web values fire `{original_source: web}`.
- Settings: default currency, every value re-derived, a person's own rates kept, one `system`
  entry · **pass** · S$1,000 cash, US$100 at the person's 1.35 and US$200 at the published 1.30.
  SGD→USD gave 769.23, 100 and 200. Back to SGD gave 1,000, 135 and 260 exactly, and the export
  kept `given_rate 1.35 → SGD`. Each change is one Activity entry: "Changed the default currency
  SGD → USD · 6 values recalculated · NetNet". Through the UI, Home read S$8,300, then
  US$6,314, then S$8,300 again, and Insights was unchanged.
- Settings: sign-out · **pass** · `push_disabled {by: signout}`, and the device then answers 404.
  Issue 3 concerns the log only.
- J10 export as JSON and CSV · **pass** · JSON has types, tags, holdings with access and reason,
  and every value with rate, rate date, source and given rate. The CSV header matches §7.2
  exactly and quotes commas, quotes and semicolons. Both buttons save `netnet-export.json` and
  `.csv` in Chromium, and the object URL now lives 60 s after the click. An unknown format → 400;
  no session → 401.
- J10 deletion · **pass** · a sign-in 11 minutes old → `REAUTH_REQUIRED`. The screen states 30
  days before the button. After deletion, 0 rows remain for the id in 19 tables, `core.profile`
  and `core.reminder_state` included. The old cookie gets 401, the agent 401 and its refresh
  token `invalid_grant`. Events are re-keyed (none left under the old id), and `account_deleted`
  carries the segment. No `push_disabled` fires.
- J10 no screen or response carries another user's data · **pass** · a second person gets 404 on
  the first's values, value edit, holding delete and connection revoke. None of the first's names
  appear in their Activity, export or snapshot. The integration isolation suites are green.
- J11 three views, newest first, the first period with no change · **pass** · hand-checked:
  June 5,000 (the first month, no change); July 6,300 (+1,300 through the stored rate); August
  7,300; September carried, no change; October 8,300. A back-dated May value made May the first
  month (9,000) and June −4,000. Quarterly and yearly agree, and the yearly view's one period has
  no change.
- J11 drivers, own filters, Don't Show persisting and leaving Home alone · **pass** · drivers
  rank by contribution. A Don't Show saved on one session reads back on a new one, Home's filter
  stays unset, and the agent's net worth is unchanged. `insights.spec` covers the screens. One
  Low wording issue: issue 2.
- J11 placeholders, value dates, carried marking, stored conversions · **pass** · periods
  follow value dates, months without an entry read "Carried", and conversions use the stored
  rate.
- J11 `insights_viewed {view}` · **pass** · monthly, quarterly and yearly each fire from the
  screen.
- J12 due at 30/60/90 with no check, never a fourth, any check restarts the clock · **pass** ·
  forced due dates. One run sent, a second run the same day sent nothing, and someone at 3 got
  nothing. A check set `sent_since_check` back to 0 and `next_due_on` to today + 30.
- J12 daytime only · **pass** · Tokyo at 21:23 got nothing; London at 13:23 got theirs. Push TTL
  was 27,402 s, the time to 21:00 London.
- J12 push where on, email otherwise, verified addresses only · **pass** · push went and no email.
  A 410 device was revoked (`push_disabled {by: browser}`) and that reminder went by email.
  Unverified, Reminders off and Email off each got nothing.
- J12 the exact wording, no amounts or names · **pass** · decrypted payload: title "NetNet",
  "Your net worth is due for an update. Just ask Fictional QA Agent." It carries no figure and no
  holding name, though the person's holding was named "QA Secret Holding" and held 123,456.78.
  It opens `/app/?r=…`.
- J12 the Home card rules · **pass** · with push undecided, the card reads "Want a gentle nudge
  on this device if you haven't looked in a while?" with Turn on and Not now. It sits below the
  stale note, which sits directly under Position, at 390 and 1280. `push.spec` and `home.spec`
  pass in a push-capable browser.
- J12 Settings → Notifications · **pass** · Reminders, this device, Email with its one-line rule,
  and Security emails "Always".
- J12 device lifecycle · **pass** · register (`push_enabled {platform}`), sign-out, removed → 404,
  browser-gone revocation.
- J12 unsubscribe and opened tracking · **pass** · the RFC 8058 one-click POST turns email off.
  `/api/reminders/opened` → 204 twice with one `reminder_opened {channel}`, and a forged token →
  404. A signed link leaves `last_checked_on` alone.
- Checkpoint 4, the reminder runs are GitHub Actions schedules · **open** · `vercel.json` carries
  no crons, and `cron-reminders.yml` has slots at 01:00, 09:00 and 17:00 UTC. Its manual run
  passed (07:00 UTC). No scheduled run yet: see the Summary.
- Checkpoint 6, every step fires its §3.5 event with `segment` · **pass** · every event in the
  runs carried a segment (`unknown` only before the question). No prop carried an amount,
  currency or name.

### Non-functional (P3)

- N1 the new tool carries `outcome` and `latency_ms` · **pass** · `agent_tool_called` for
  `get_period_changes` (8–11 ms locally).
- N3 auditability · **pass** · every write tried has its entry. The currency change is one
  entry, and corrections are new entries.
- N7 the sweep · **pass** · no horizontal scroll at 320, 390 or 1280 on Home, Insights, a
  holding, Activity, General, Notifications, Export, Delete and the Agent tab. No console error
  or page error on any of them.
- N9 · **pass** · events are enums. `/api/events` refuses a server-only name, an extra `amount`
  prop and a free-text `view`. Push wording carries no amounts or names.
- N10 · **pass** · deny-list scan in the unit run.
- N11 periods deterministic · **pass** · the same figures from the web and `get_period_changes`.
- J6 malformed calls · **pass** · a `record_values` with one bad item names it
  (`values[1].amount: SGD has 2 decimal places…`, `values[1].holdingId: There is no holding…`),
  and nothing is written: the data version and value count are unchanged.

### Regression check (P1 §3.2 and P2)

**pass**. E2E covered sign-up, providers, onboarding, the basics, Add, Home, holding, taxonomy,
agent connect and the shell (446 passed). Unit and integration suites are green. Agent connect
(DCR), the security email (`security_email_sent {client: other}`), the duplicate guard (J6) and
same-date replacement (`SAME_DATE_REPLACED`) were re-run by hand. 120 concurrent sign-up →
confirm → read sequences (480 requests) gave no 5xx.

### Production (what this session could reach)

This session's network refuses `netnetapp.io`, so public checks ran through the
`netnet-orcin.vercel.app` alias of the same deployment.

- Health `{ok:true}`. HSTS, CSP, X-Frame-Options, nosniff and Referrer-Policy on `/`, `/app/`
  and `/api/health`.
- `/mcp` answers 401 with `resource_metadata` on `https://netnetapp.io`, and the OAuth issuer is
  `https://netnetapp.io`.
- `/api/cron/*`, `/api/notifications/vapid-key`, `/api/activity`, `/api/export` and `/api/me`
  answer 401 without a session. `POST /api/activity/…/undo` → 404.
- `pnpm smoke` against the alias stops, as expected, at "the metadata issuer is not this origin".
- Deploy run #28's own smoke passed every step, including `tools/list` (18 tools) and
  `get_financial_context` (343 ms).
- The probe's scheduled run at 11:13 UTC passed. Its log shows `REFRESH_TOKEN: ***` and "the new
  token is in $GITHUB_OUTPUT (never shown)", as does deploy run #28's: the token no longer
  reaches a log.
- Through the NetNet connector, tool schemas only, no data read: 18 tools and no `undo`.
  `list_activity` says "A record only: correct a mistake with another change", and
  `get_period_changes` says the first period's change and % are null.
- Schedules today: Daily housekeeping started at 05:17 (slot 01:00); FX last started at 20:08
  yesterday (slot 17:00); Reminders as above.

## Issues found

1. **Low — Activity names types by their internal keys.** Steps: sign up, confirm Singapore,
   open Activity. Expected (J7, "what changed"; J2, labels follow the current pack): entries a
   person can read, such as "Added type "Car loan"". Actual: 13 entries, "Added type "car_loan"",
   "Added type "listed"" (shown as "Investments" everywhere else), "Added type "cash"" and so on,
   each by "You". These head the log of every new account. A move to GB adds "Added type
   "car_finance"". Value entries also read "Recorded a value for 2026-05-20", where every other
   date on the screen reads "Oct 24, 2026".
2. **Low — Insights' average can pair a falling amount with a rising percent.** Steps: monthly
   changes of −$4,000 (−44.4%), +$1,300 (+26%), +$1,000 (+15.9%), $0 and +$1,000 (+13.7%); open
   Insights → Monthly. Actual: "Averaging −$140 (+2.2%) a month over the last 5 months". The
   amount is the mean change, but the percent is the mean of the monthly percents, so they
   disagree in sign. Net worth fell from $9,000 to $8,300 over those months (−7.8%), so "+2.2% a
   month" misstates it. Expected: a percent with the same sign as the amount, such as the change
   over the window as a share of its start, or the compound monthly rate.
3. **Low — Every sign-out logs an after-response failure with no cause.** Steps: sign in, then
   `POST /api/auth/sign-out`. Actual: `{"event":"after_response_failed","route":"POST
   /api/auth/sign-out","errorCode":"INTERNAL"}`, four times out of four. Postgres logged no
   error. The failing task is the "checked NetNet" check-in (`touchCheckedOnSession`), which
   reads the session after sign-out has removed it. Nothing is lost, since the person's earlier
   requests already counted. But production will log a failure on every sign-out, and
   `afterResponse` logs no error class (architecture §10), so its cause cannot be read. This is
   the "T18 other logs" follow-up STATE names.
4. **Info — A country move with no new type leaves no Activity entry.** SG→MY changes the pack
   that every label follows, but Activity shows nothing. A move that adds a type logs only that
   type (issue 1). The criterion asks for no entry, so this is noted, not failed.

## What went well

- Every fix from the last round holds under direct attack. Deletion leaves nothing in 19 tables,
  even with the old cookie, agent and refresh token knocking afterwards. The currency round trip
  lands on the person's own rate to the cent, and undo is gone from all three surfaces and from
  production.
- The reminder machinery is still exact: the claim, no fourth, the TTL to 21:00 local to the
  second, the 410 fallback and revocation, verbatim wording with no figures, and signed links
  that don't count as checking.
- E2E is now green in a browser that can receive push, which the last round could not say.
- Isolation held on every route tried, and no screen threw or logged an error at any width.
- Insights and the agent tool agree to the dollar, and the figures check by hand.

## Suggested manual checks for the Founder

1. Actions → Reminders: confirm one green `schedule` run for each slot (09:00 today, then 17:00
   and 01:00), and record each first start in `ops/probe.md`'s schedule table. If 09:00 has not
   started by about 16:00 UTC, that slot was skipped. The design tolerates one, but say so.
2. `pnpm smoke --origin https://netnetapp.io` from your machine.
3. A real iPhone with NetNet on the Home Screen, and an Android phone: turn push on, receive a
   reminder, open it from the lock screen. On an iPhone in a Safari tab, no push option appears.
4. Export on an iPhone in Safari, JSON and CSV: the file saves.
5. Inbox delivery of a reminder email, and one-click unsubscribe from the mail client's own
   button.
6. Hands-on on production: change the default currency and back, then look at Activity (one
   entry each way) and Insights (unchanged). Revoke and reconnect your agent, and read Activity.
7. Insights → Monthly with a month that fell: read the average line (issue 2).
