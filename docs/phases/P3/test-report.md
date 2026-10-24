# P3 Test Report

Stage 6, run in a fresh session that did not do the build. Task reports were not read before
testing. Tested against `docs/01-prd.md` §6 via the criteria `docs/04-plan.md` §P3 names, plus the
P1 and P2 criteria for regressions. Code under test: `main` at `4e0a4ff`; production runs
`67db806` (deploy run #29), which differs only in `docs/` and `ops/`.

## Summary

**Verdict: pass. Every P3 criterion passes. One Low issue and two Info remain, none blocking.
Two Reminders schedule slots have not started yet.**

- **Product.** The three issues the last report raised are fixed. Activity names types by their
  labels ("Added type "Car loan"", "Investments") and reads value dates as the rest of the
  screen does ("Recorded a value for Oct 10, 2026"). Insights' average now carries the amount's
  sign: "Averaging −$140 (−1.6%) a month", where the last run read "+2.2%". A sign-out logs
  nothing, and a failure log names its error class. Everything else holds: the read-only log,
  the one-entry currency change with a person's own rate kept, deletion, export, the reminder
  and push machinery, isolation and the agent tools.
- **Found this time.** One Low issue: an agent's error message names a field the tool does not
  have (`holdingId` for `holding_id`). Two Info: after a country move, two types can share the
  label "Loan"; a carried month's zero change reads "—" in Insights and "$0" on the holding's
  chart (issues 1–3).
- **Open.** The Reminders 09:00 slot ran on schedule (started 13:03 UTC today, green). The 17:00
  slot had not started by 19:05 UTC, and today's FX run, on the same 17:00 slot, had not either;
  FX usually starts between 18:56 and 23:20. The 01:00 slot cannot start before 01:00 UTC on
  2026-10-25. Suggested check 1.

**Automated gates** (local, Postgres 16; CI uses 18):

| Gate | Result |
|---|---|
| Lint (ESLint + Prettier) | pass |
| Typecheck | pass |
| Migrations match the schema (`db:generate`) | pass, nothing generated |
| Unit + N10 deny-list scan | 1545 / 1545 pass (137 files) |
| Content check | pass (8 documents) |
| Integration | 750 / 750 pass (58 files) |
| Build | pass |
| E2E at 390 and 1280 px (320 px in-test) | 456 passed, 0 failed, 4 skipped |
| `pnpm audit --prod --audit-level high` | pass, no known vulnerabilities |

The 4 skips are the layout tests that run at one width only. The run set `LINK_SIGNING_SECRET`,
which CI does not, so the signed-unsubscribe test ran at both widths and passed. CI is green on
`4e0a4ff`, and in every lane on `15478b3`, the last code merge.

**Hands-on.** The built app (`e2e/server.ts`) ran against its own database as `netnet_app`, with
VAPID keys, a link-signing secret, `CRON_SECRET` and a fake HTTPS push service. Scripts drove the
REST API, OAuth (DCR, PKCE) and MCP, and a real Chromium drove the screens at 320, 390 and 1280
px. Push payloads were decrypted off the wire. All data was fictional, with made-up exchange
rates.

## Criteria results

`criterion · pass/fail · evidence`

### Re-checks of the last report's issues

- Issue 1, Activity reads types by their labels and dates as the screen does · **pass** · a new
  SG account's log reads "Added type "Car loan"", "Investments", "CPF", "Cash" and so on, by API
  and on screen. Value entries read "Recorded a value for Oct 10, 2026" and "Updated the value
  for Jul 1, 2026 · $1,000 → $1,010 SGD". After a move to GB the same entries read the GB pack's
  labels ("Pension", "Cash & savings"). The API's `summary`, which the agent reads, keeps
  `YYYY-MM-DD` dates.
- Issue 2, Insights' average agrees with its amount · **pass** · the last report's own months
  (9,000 in May, then 5,000, 6,300, 7,300, carried, 8,300) read "Averaging −$140 (−1.6%) a month
  over the last 5 months": −140 / 9,000. Quarterly reads "+$2K (+33%) a quarter over the last 2
  quarters" (+1,650 / 5,000). With an Insights exclusion and a loan it reads "−$540 (−6%)",
  again on the 9,000 opening.
- Issue 3, a sign-out logs nothing, and failure logs name their cause · **pass** · four sign-ups
  then sign-outs: 200 each, `/api/me` 401 after, and no `after_response_failed` line. With the
  database stopped, `GET /api/me` → 500 with `{"event":"request_failed",…,"errorName":"APIError3"}`
  and `{"event":"auth_error",…,"errorName":"_DrizzleQueryError"}`. The app recovered once it
  restarted.

### P3 criteria (Plan §P3)

- J2 change country afterwards · **pass** · SG→GB with holdings added "Car finance" (13 → 14
  types) and kept SGD. SG→MY added nothing and kept SGD. An empty account moved SG→GB came back
  in GBP on the GB pack. Info issue 2 concerns a label after the move.
- J2 a delete shown in the audit log · **pass** · "Deleted "QA Car"" by You.
- J3 an edit shown in the audit log · **pass** · "Updated the value for Jul 1, 2026 · $1,000 →
  $1,010 SGD". A same-date value replaced the first with the `SAME_DATE_REPLACED` warning.
- J4 the holding page's period bar chart · **pass** · Monthly / Quarterly / Yearly and paging
  ("Jun – Oct 2026"). Sep is marked "carried", explained under the chart, and the first month is
  not drawn as a change. The short-history placeholder is covered by `holding.spec` (54 passed).
- J5 revocation shown in Activity · **pass** · "Agent disconnected · Fictional QA Agent". The next
  MCP call gets 401 "This agent connection was revoked", and the refresh token `invalid_grant`.
- J7 newest-first log with what changed, old → new, client and time, web changes in the same
  log · **pass** · screen and API. Agent entries name the registered client; web entries say
  "You"; the currency change says "NetNet".
- J7 one agent turn read together · **pass** · two `record_values` items and a rename show as
  "Fictional QA Agent · 3 changes at once", with one `batch_id`.
- J7 a record only, nothing in it changes data · **pass** · no Undo on the screen.
  `POST /api/activity/…/undo` → 404 locally and on production. The tool list has 18 tools and no
  `undo`, locally, on production (deploy #29's smoke) and through the NetNet connector.
- J7 `value_corrected` when an agent-written value is edited or deleted · **pass** · both fire
  `{original_source: agent, age_at_correction: 0}`; web values fire `{original_source: web}`.
- Settings: default currency, every value re-derived, a person's own rates kept, one `system`
  entry · **pass** · S$1,000 cash, S$50,000 car, US$100 at the person's 1.35 and US$200 at the
  published 1.30. SGD→USD gave 769.23, 38,461.54, 100 and 200. Back to SGD gave 1,000, 50,000,
  135 and 260 exactly, with `given_rate 1.35 → SGD` kept. Each change is one entry: "Changed the
  default currency SGD → USD · 4 values recalculated · NetNet".
- Settings: country, and sign-out · **pass** · General shows the country (249, alphabetical) and
  the currency (152); the Account screen ends with Log out. Sign-out revokes this device's push
  (`push_disabled {by: signout}`), after which it answers 404.
- J10 export as JSON and CSV · **pass** · JSON has types, tags, holdings with access and reason,
  and every value with rate, rate date, source and given rate. The CSV header carries
  `given_rate,given_rate_into`, type labels and quotes `QA ""Quoted"", Name; semi` correctly.
  `export.spec` saves both files. An unknown format → 400; no session → 401.
- J10 deletion · **pass** · a sign-in 11 minutes old → `REAUTH_REQUIRED` ("…from the last 10
  minutes"). The screen states the 30 days before the button. After deletion, 0 rows remain for
  the id in the 27 user-keyed columns of `core`, `ledger` and `analytics`, profile and reminder
  state included, even after the old cookie (401), the agent (401) and its refresh token
  (`invalid_grant`) knocked. Events are re-keyed, `account_deleted` carries the segment, and no
  `push_disabled` fires.
- J10 no screen or response carries another user's data · **pass** · a second person gets 404 on
  the first's values (read, add, edit, delete), holding (edit, delete) and connection revoke, and
  an empty page for the first's agent turn. None of the first's names appear in their snapshot,
  Activity, export, connections or notification settings. The first's data was unchanged. The
  integration isolation suites are green.
- J11 three views, newest first, the first period with no change · **pass** · hand-checked: May
  "First month" 9,000; June −4,000 (−44.4%); July +1,300 (+26%); August +1,000 (+15.9%);
  September carried; October +1,000 (+13.7%). Quarterly: Q2 first quarter 5,000, Q3 +2,300
  (+46%), Q4 +1,000. Yearly: 2026 "First year" with "Need more data".
- J11 drivers, own filters, Don't Show persisting and leaving Home alone · **pass** · excluding a
  type reads "Hidden here: Investments. Your net worth on Home is unchanged." and recomputes every
  figure. A new session reads the exclusion back; Home reads $7,550 and the agent's
  `net_worth` 7,550. `get_period_changes` ranks drivers by contribution (490, then 13).
  `insights.spec` (32 passed) covers the screens.
- J11 placeholders, value dates, carried marking, stored conversions · **pass** · periods follow
  value dates, months with no entry read "Carried", and conversions use the stored rate (the
  person's 1.35, the published 1.30, a given 1.25).
- J11 `insights_viewed {view}` · **pass** · monthly, quarterly and yearly each fire from the
  screen.
- J12 due at 30/60/90 with no check, never a fourth, any check restarts the clock · **pass** ·
  forced due dates: one run sent, a second run the same day sent nothing, and someone at 3 got
  nothing. A check 31 days after the last one set `sent_since_check` to 0 and `next_due_on` to
  today + 30.
- J12 daytime only · **pass** · Tokyo at 03:57 got nothing; New York at 14:57 got theirs, with a
  push TTL of 21,807 s, the time to 21:00 New York.
- J12 push where on, email otherwise, verified addresses only · **pass** · push went and no email.
  A 410 device was revoked (`push_disabled {by: browser}`) and that reminder went by email.
  Unverified, Reminders off and Email off each got nothing.
- J12 the exact wording, no amounts or names · **pass** · decrypted payload: title "NetNet",
  "Your net worth is due for an update. Just ask Fictional QA Agent.", `urgency: normal`, VAPID
  signed. It carries no figure and no holding name, though the holding was named "QA Secret
  Holding" and held 123,456.78. It opens `/app/?r=…`.
- J12 the Home card rules · **pass** · `push.spec` (28 passed) and `home.spec` (120 passed) in a
  Chromium that can receive push: the card, its wording, Turn on and Not now, its place below
  the stale note.
- J12 Settings → Notifications · **pass** · Reminders, this device (in a browser that blocked
  notifications, the one-line pointer to the settings), Email with its one-line rule, and
  Security emails "Always".
- J12 device lifecycle · **pass** · register (`push_enabled {platform}`), sign-out
  (`push_disabled {by: signout}`), then 404 on delete and on update; browser-gone revocation.
- J12 unsubscribe and opened tracking · **pass** · the RFC 8058 one-click POST → 204 and turns
  email off; a forged token → 404. `/api/reminders/opened` → 204
  twice with one `reminder_opened {channel: push}`; forged → 404, missing → 400. The signed link
  leaves `last_checked_on` alone.
- Checkpoint 4, the reminder runs are GitHub Actions schedules · **pass** · `vercel.json` carries
  no crons, the job refuses a call without `CRON_SECRET` (401), and the 09:00 slot ran as a
  `schedule` event at 13:03 UTC, green. The 17:00 and 01:00 slots are still to start (Summary).
- Checkpoint 6, every step fires its §3.5 event with `segment` · **pass** · every event row has a
  segment (`unknown` only before the question). No prop carries an amount, a currency or a name.

### Non-functional (P3)

- N1 the new tool carries `outcome` and `latency_ms` · **pass** · `agent_tool_called` for
  `get_period_changes` (12 ms locally; 1 ms with `outcome: VALIDATION_FAILED` for a bad view).
- N3 auditability · **pass** · every write tried has its entry. The currency change is one
  entry, and corrections are new entries.
- N7 the sweep · **pass** · no horizontal scroll at 320, 390 or 1280 on Home, Insights, a
  holding, Activity, Account, General, Notifications, Export, Delete, Types and tags and the
  Agent tab. No console error or page error on any of them.
- N9 · **pass** · event props are enums and ids; push wording carries no amounts or names.
- N10 · **pass** · deny-list scan in the unit run.
- N11 periods deterministic · **pass** · the same figures from the web and `get_period_changes`.
- J6 malformed calls · **pass** · a `record_values` with two bad items names both
  (`values[0].amount: SGD has 2 decimal places…`, and an unknown holding), and nothing is written:
  the data version is unchanged. Issue 1 concerns a field name in that message.

### Regression check (P1 §3.2 and P2)

**pass**. E2E covered sign-up, providers, onboarding, the basics, Add, Home, holding, taxonomy,
agent connect and the shell (456 passed). Unit and integration suites are green. Agent connect
(DCR, the approval page naming the client), the security email (`security_email_sent {client:
other}`), the duplicate guard (`LIKELY_DUPLICATE` with candidates) and same-date replacement were
re-run by hand. 120 concurrent sign-up → me → snapshot → activity sequences gave no 5xx.

### Production (what this session could reach)

This session's network refuses `netnetapp.io`, so public checks ran through the
`netnet-orcin.vercel.app` alias of the same deployment.

- Health `{ok:true}`. HSTS, CSP, X-Frame-Options, nosniff and Referrer-Policy on `/`, `/app/`
  and `/api/health`.
- `/mcp` answers 401 with `resource_metadata` on `https://netnetapp.io`, and the OAuth issuer is
  `https://netnetapp.io`.
- `/api/cron/reminders`, `/api/cron/daily`, `/api/notifications/vapid-key`, `/api/activity`,
  `/api/export`, `/api/me`, `/api/snapshot` and `DELETE /api/account` answer 401 without a
  session. `POST /api/activity/…/undo` → 404.
- `pnpm smoke` against the alias stops, as expected, at "the metadata issuer is not this origin".
- Deploy run #29 (`67db806`, which carries T19, T20 and T21) passed its smoke: `tools/list` (18
  tools) and `get_financial_context` (370 ms client, 131 ms server). Its log shows
  `REFRESH_TOKEN: ***` and "the new token is in $GITHUB_OUTPUT (never shown)".
- The probe's scheduled run at 16:03 UTC passed.
- Through the NetNet connector, tool schemas only, no data read: 18 tools and no `undo`.
  `list_activity` says "A record only: correct a mistake with another change", and
  `get_period_changes` says the first period's change and % are null.
- Schedules today: Daily housekeeping started at 05:17 (slot 01:00); FX last started at 20:08
  yesterday (slot 17:00); Reminders as in the Summary.

## Issues found

1. **Low — An agent's error message names a field the tool does not have.** Steps: through MCP,
   call `record_values` with a value whose `holding_id` names no holding in the account. Actual:
   the message reads `values[1].holdingId: There is no holding "hld_…" in this account.`, while
   the same error's `fields` key is `values[1].holding_id`, and the tool's schema has only
   `holding_id`. Expected (J6, an error specific enough for the agent to correct itself): the
   message names the tool's own field, as `fields` does. A weak model (M12) may try `holdingId`,
   which the tool then refuses as "not a field here". The fault predates P3.
2. **Info — After a country move, two types can share the label "Loan".** Steps: an SG account
   with a holding moves to GB. Actual: SG's car-loan type, which the GB pack does not know, reads
   by its universal label "Loan", next to the universal "Loan", in Types and tags and in Activity
   (its "Added type "Car loan"" now reads "Added type "Loan""). This is what J2 ("labels follow
   the current pack") and architecture §6.7 (current pack, then generic) specify, and a rename
   tells them apart, so it is noted, not failed.
3. **Info — A carried month with no change reads two ways.** Insights shows it as "—" (in the
   Monthly growth chart and the period list); the holding's period chart shows "$0" with
   "carried". Both mean no change.

## What went well

- All three fixes hold under direct attack, on screen and through the API, and the average now
  checks by hand in every view, filtered or not.
- The currency round trip still lands on the person's own rate to the cent, as one entry each
  way, and deletion still leaves nothing in 27 user-keyed columns with the old cookie, agent and
  refresh token knocking afterwards.
- The reminder machinery is exact: the claim, no fourth, the TTL to 21:00 local, the 410
  fallback and revocation, verbatim wording with no figures, and signed links that do not count
  as checking.
- E2E ran fully green in a browser that can receive push, the signed-unsubscribe test included.
- No screen threw or logged an error at any width, and 120 concurrent new accounts gave no 5xx.

## Suggested manual checks for the Founder

1. Actions → Reminders: confirm one green `schedule` run for the 17:00 slot (expected by about
   23:00 UTC today) and the 01:00 slot (expected by about 07:00 UTC on 2026-10-25), and record
   each first start in `ops/probe.md`'s schedule table (P3-T10's open box).
2. `pnpm smoke --origin https://netnetapp.io` from your machine.
3. Vercel's logs: sign out once on production and see no `after_response_failed` line; any
   failure line carries `errorName`.
4. A real iPhone with NetNet on the Home Screen, and an Android phone: turn push on, receive a
   reminder, open it from the lock screen. On an iPhone in a Safari tab, no push option appears.
5. Export on an iPhone in Safari, JSON and CSV: the file saves.
6. Inbox delivery of a reminder email, and one-click unsubscribe from the mail client's own
   button.
7. Hands-on on production: Activity reads types by name and value dates as "Oct 10, 2026";
   Insights → Monthly with a month that fell reads an average whose percent has the amount's
   sign; revoke and reconnect your agent, and read Activity.
