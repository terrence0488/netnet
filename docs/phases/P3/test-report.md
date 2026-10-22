# P3 Test Report

Stage 6, run in a fresh session that did not do the build. Task reports were not read before
testing. Tested against `docs/01-prd.md` §6 via the criteria `docs/04-plan.md` §P3 names, plus the
P1 and P2 criteria for regressions. Code under test: `main` at `520c504`; production runs `82f7763`
(deploy run #27), which differs only in a workflow pin and docs.

## Summary

**Verdict: fail. Two High issues block approval, and the production checkpoint is not yet
verified.**

- **Product.** Most of P3 works end to end. Activity and undo, conflicts, revocation, export,
  isolation, the comeback reminder (timing, claim, channels, wording, signed links), push, Insights
  and the agent's `get_period_changes` all behave as specified. The default-currency change is the
  exception: it is not one undoable change, and undoing the entry Activity shows first leaves the
  totals wrong (issue 1). Four Medium defects follow it: account deletion leaves rows behind,
  `value_undone` can't measure M5, a user's own exchange rate is lost on a currency round trip,
  and the probe's refresh token is printed in workflow logs.
- **Operations.** GitHub Actions has run nothing since 2026-10-22 07:28 UTC (issue 2). The handoff
  read the probe and backup failures as a changed secret. They are not: every job in every
  workflow fails in 1–2 s before its first step, CI's included, and `backup.yml` never used the
  action #89 bumped. Production backups, the probe, FX rates, the daily sweep and CI have all
  stopped.
- **Unverified on production.** This session's network policy refuses `netnetapp.io`. Public
  checks ran through the `netnet-orcin.vercel.app` alias of the same deployment. Whether Vercel
  Cron fires `/api/cron/reminders` at all is open (issue 3): `decisions.md` records that Vercel's
  scheduler never fired production crons. P3-T10's deploy criterion stays unchecked.

**Automated gates** (local, Postgres 16; CI uses 18, and CI cannot run at present):

| Gate | Result |
|---|---|
| Lint (ESLint + Prettier) | pass |
| Typecheck | pass |
| Unit + N10 deny-list scan | 1459 / 1459 pass (129 files) |
| Content check | pass (8 documents) |
| Integration | 740 / 741: one intermittent 500, issue 10 |
| Build | pass |
| E2E at 390 and 1280 px (320 px in-test) | 384 passed, 4 failed, 6 skipped. 1 flake (passed on re-run), 3 from this browser supporting push (issue 9) |
| `pnpm audit --prod --audit-level high` | fail: 1 high, 5 moderate, 1 low, all dev-server packages (issue 8) |

**Hands-on.** The built app ran against its own database as `netnet_app`, with VAPID keys, a
link-signing secret, `CRON_SECRET` and a fake HTTPS push service. API and MCP scripts and a real
Chromium drove it, all with fictional data. Push payloads were decrypted off the wire to check the
exact wording.

## Criteria results

`criterion · pass/fail · evidence`

### P3 criteria (Plan §P3)

- J2 change country afterwards: with holdings, the new pack's types are added and none removed;
  an empty account starts over in the new currency · **pass** · SG→MY kept all 13 types and SGD;
  an empty account moved SG→GB came back in GBP; `settings.spec`
- J2 a delete shown in the audit log · **pass** · "Deleted "…"" by user; undo restores the holding
  and its values; totals recompute
- J3 an edit shown in the audit log · **pass** · old → new amounts on the entry; `activity.spec`
- J4 holding page's period bar chart: M/Q/Y switch, paging, carried marking, shared placeholder ·
  **pass** · screenshots at 390/1280; "Carried" explained under the chart; one-value holding shows
  "Need more data"
- J5 revocation shown in Activity · **pass** · "Agent disconnected by user"; the next MCP call
  gets 401
- J7 newest-first log with what, old → new, client and time; web changes in the same log ·
  **pass** · API and screen; agent entries name the registered client
- J7 undo of an entry: exact, itself logged · **pass** · amounts restored to the minor unit; the
  undo is an entry and can itself be undone; a superseded entry gets `UNDO_CONFLICT` naming the
  later change
- J7 undo of a batch, together · **pass** · one agent turn (2 values + a rename) = one batch,
  reverted together from the web; the agent's `undo` works too
- J7 `value_corrected` / `value_undone` on agent-written values · **partial** · `value_corrected
  {original_source: agent, age_at_correction}` is right; `value_undone` also fires for web values
  and carries nothing to tell them apart (issue 6)
- Settings: default currency re-derived from stored rates, one undoable `system` change · **fail**
  · re-derivation is right; one change is N+1 unbatched entries and the natural undo corrupts
  totals (issue 1); a user's own rate is lost on a round trip (issue 7)
- Settings: sign-out · **pass** · `settings.spec`; `DELETE …/endpoints/:id?by=signout` fires
  `push_disabled {by: signout}` and the device then answers 404
- J10 export as JSON and CSV · **pass** · JSON has types, tags, holdings and values with rates; the
  CSV header matches §7.2 exactly, one row per value; unknown format → 400; needs a session
- J10 deletion: recent sign-in, 30-day window first, everything erased, connections revoked,
  reminders stopped, events re-keyed, `account_deleted` · **fail** · a sign-in older than 10
  minutes → `REAUTH_REQUIRED`; the screen states 30 days before the button; ledger, sessions,
  identity, endpoints and connections are gone; events re-keyed; `account_deleted` with segment.
  But a `core.profile` and a `core.reminder_state` row are re-created for the deleted id
  (issue 4)
- J10 no screen or response carries another user's data · **pass** · a second user gets 404 on
  the first's values, edits, undo and devices; their Activity and export hold nothing of the
  first's; integration isolation suites green
- J11 three views, newest first · drivers per period · own filters · Don't Show persisting and
  leaving Home alone · placeholders with one statement · value dates, carried marking, stored
  conversions · `insights_viewed {view}` · **pass** · hand-checked figures (June 10,000 +
  1,000×1.30 − 5,000 = 6,300; the average +$1,400 / 5 months = +$280); exclusions survive a new
  session and Home's filter stays unset; a new user sees one statement and "Need more data" on
  every chart; `insights.spec`. One Low wording issue: issue 11
- J12 due at 30/60/90 with no check, never a fourth, any check restarts the clock · **pass** ·
  forced due dates and cron runs: 1, 2, 3 sent, the fourth refused; a check resets
  `sent_since_check` to 0; a second run the same day sends nothing
- J12 daytime only · **pass** · a Singapore person due at 21:23 local got nothing; London at 14:23
  got theirs; push TTL equals the seconds to 21:00 local
- J12 push where on, email otherwise, verified addresses only · **pass** · push → no email; a 410
  device is revoked (`push_disabled {by: browser}`) and that reminder goes by email; unverified,
  Reminders off and Email off each get nothing
- J12 the exact wording, no amounts or names · **pass** · decrypted payload: title "NetNet", body
  "Your net worth is due for an update.", "Just ask Fictional QA Agent." once an agent is
  connected; no figure or holding name; opens `/app/?r=…`
- J12 the Home card rules · **pass** (one design question, issue 9) · quiet card below Position
  with Turn on / Not now; `push_prompt_shown {entry: home}`; `push.spec`
- J12 Settings → Notifications · **pass** · Reminders, this device, Email with its one-line rule,
  Security emails "Always", device list with label and Remove
- J12 device lifecycle · **pass** · register (`push_enabled {platform}`), check-in, 404 after
  removal, sign-out, browser-gone; another person cannot remove someone's device
- J12 unsubscribe and opened tracking · **pass** · `/api/reminders/opened` 204 with
  `reminder_opened` exactly once; forged token refused; signed links don't count as checking;
  one-click unsubscribe (JSON and the RFC 8058 form) turns email off
- J12 email cap of 60 a UTC day · **pass** · the run sent up to 60 people and released the rest
  for a later run
- Checkpoint 6, every step fires its §3.5 event with `segment` · **pass** (except issue 6) ·
  every event in the run carried a segment; no prop carried an amount, currency or name

### Non-functional (P3)

- N1 the new tool carries `outcome` and `latency_ms` · **pass** · `agent_tool_called` for
  `get_period_changes`
- N3 undo completes auditability · **partial** · issue 1
- N7 the sweep · **pass** · no horizontal scroll at 320/390/1280 on Home, Activity, General,
  Notifications, Export, Delete, Insights and a holding; dark mode: 0 serious or critical axe
  findings on Activity, Insights, a holding and Notifications
- N9 · **pass** · events are enums; push and email wording carry no amounts or names
- N10 · **pass** · deny-list scan in the unit run
- N11 periods deterministic · **pass** · same figures from the web and `get_period_changes`

### Regression check (P1 §3.2 and P2)

**pass**. E2E covered sign-up, providers, onboarding, the basics, Add, Home, holding, taxonomy,
agent connect and the shell (384 passed). Unit and integration suites are green apart from issue
10. Agent connect, DCR naming, the security email (`security_email_sent {client}`) and revocation
were re-run by hand. The duplicate guard (J6) still fires.

### Production (what this session could reach)

Health `{ok:true}`. HSTS, CSP, X-Frame-Options, nosniff and Referrer-Policy on `/`, `/app/` and
`/api/*`. `/mcp` answers 401 with `resource_metadata` on `https://netnetapp.io`. `/api/cron/*` and
`/api/notifications/vapid-key` answer 401 without credentials. The OAuth issuer is
`https://netnetapp.io`. The production MCP lists `get_period_changes`, `list_activity` and `undo`
with the contracted schemas (tool list only, read through the Founder's connector; no data read).
Not run: `pnpm smoke` against `netnetapp.io` (network policy), anything that signs in, and the
cron runs.

## Issues found

1. **High — The default-currency change is not one undoable change, and undoing it as shown
   corrupts the totals.** Steps: an SGD ledger with an SGD and a USD holding; Settings → General →
   USD; open Activity. Expected (checkpoint 2, P3-T3 done criterion): one undoable `system`
   change. Actual: one "Changed the default currency" entry plus one entry per value, none in a
   batch, each with its own Undo, each reading "$23,700 → $23,700 SGD". Undoing the newest
   (currency) entry sets the base back to SGD but leaves every value's converted amount in USD.
   The S$1,000 cash then counts as 769.23, and Home's total is wrong with no warning. A real
   account would get hundreds of rows.
2. **High (operations) — GitHub Actions has run nothing since 2026-10-22 07:28 UTC.** Every job
   in every workflow fails in 1–2 s with no steps and no logs. That includes CI's "What changed"
   and `backup.yml`, which does not use the action #89 bumped. So it is not a changed secret, and
   it started in the 07:23–07:28 window after the heavy runs on PR #88. Most likely the account's
   included Actions minutes or spending limit ran out on this private repo (the run page's
   annotation will say). Consequences: no backup since 2026-10-21 07:53 UTC (Neon Free keeps 6
   hours), no MCP probe, no FX rates (new foreign values use stale rates), no attempt sweep, and
   no CI on any PR.
3. **Medium (open, unverified) — Reminders depend on Vercel Cron, which `decisions.md` records
   never fired in production.** The decision moved the daily and FX jobs to GitHub Actions and
   says "`vercel.json` carries no crons". `vercel.json` now carries the three reminder entries,
   so that entry is out of date. If Vercel still does not fire them, no reminder and no
   security-email retry ever goes. Clocks were started on deploy day (2026-10-15), so the first
   reminders are due around 2026-11-14. The fallback in architecture §9.3 is GitHub Actions,
   which issue 2 also blocks.
4. **Medium — Account deletion re-creates a profile and a reminder row for the deleted id.**
   Steps: sign in, `DELETE /api/account`, query `core.profile` and `core.reminder_state` for that
   id. Expected: nothing (checkpoint 3). Actual: one row each. The after-response "checked
   NetNet" hook (`touchCheckedOnSession` → `ensureProfile` + upsert) runs for the deletion
   request itself. Nothing is sent to that id (no address remains), but erasure is incomplete and
   orphans accumulate.
5. **Medium (security) — The probe's refresh token is printed in plain text in workflow logs.**
   The "Store the rotated token" steps in `deploy.yml` and `probe.yml` inline `${{
   steps.*.outputs.refresh_token }}` into their script. The runner prints the script before
   `::add-mask::` takes effect, as deploy run #27's log shows. The token logged by the last
   successful probe run is the live one. The repo is private, so exposure is limited to people
   and apps with read access. It grants `ledger.read/write` on the probe account. Fix: mask
   inside `scripts/probe.ts`/`smoke.ts` before writing `$GITHUB_OUTPUT`, then rotate the probe
   connection and delete the old run logs.
6. **Medium — `value_undone` cannot measure M5.** Steps: record and edit a value on the web, then
   undo the edit. Expected: `value_undone` for agent-written values (P3 table, architecture §6.8).
   Actual: it fires for web values too, with no props, so an agent undo and a web undo look the
   same and "within 48h" can't be read. `value_corrected` is right (it carries
   `original_source`).
7. **Medium — A person's own exchange rate is lost on a currency round trip.** Steps: a USD
   holding entered at rate 1.35 in an SGD ledger; switch the default to USD, then back to SGD.
   Expected: the stored conversion stays the person's (J2, J11). Actual: the rate becomes ECB's
   1.30 (`fx_source` user → ecb), and S$135 silently becomes S$130 in history and in every period.
8. **Low — The production dependency audit is red.** One high, five moderate and one low
   advisory, all in `vite` 8.3.0–8.3.2 (via better-auth → vitest) and `esbuild` ≤0.24.2 (via
   better-auth → drizzle-kit). These are dev-server tools that the API never runs, but CI's audit
   step fails on them. Fix: override `vite` to ≥8.3.3, or take it with PR #88.
9. **Low — E2E never renders Home in a browser that can receive push.** CI's headless shell has
   no `PushManager`. This session's Chromium does, so the push card shows and two Home tests fail
   (`session_started` also sees `push_prompt_shown`; the stale note sits 140 px below Position).
   On real desktop and Android Chrome the order is Position → push card → stale note. P2's rule
   puts the stale note directly beneath Position, and J12 puts the card below Position: which one
   comes first is a design call.
10. **Low — An intermittent 500 on `GET /api/me` right after confirming a country.** Seen once in
    the full integration run (`accounts.test.ts`, "lets an unverified person use the app"). It did
    not reproduce in 3 isolated runs or in 40 concurrent sign-up → confirm → read attempts.
    Locally the handler logs no cause (Sentry only), so it can't be diagnosed from logs.
11. **Low — Insights shows the first period's whole opening value as its change.** Examples:
    "November 2025 −$8K" for an account that opened at −$8K, and "+$500" for a new user's first
    month. `get_period_changes` returns `change` = `end_value` for it (with `change_pct` null). It
    reads as a gain or loss that never happened, and an agent may read it the same way. The
    averages already leave it out.
12. **Low — E2E flake.** `taxonomy.spec.ts:215` (phone) failed once and passed on re-run.
13. **Info — Push endpoints accept any `https:` host.** The reminder run then POSTs to it. Making
    the server reach arbitrary hosts is low risk (the body is encrypted, one post per reminder),
    but limiting endpoints to the known push services is standard hardening.
14. **Info — The export revokes its blob URL right after `click()`.** Safari has been known to
    cancel downloads like that, so it is worth checking on an iPhone (manual check 9).

## What went well

- The reminder machinery is exact. The claim held across runs, there was never a fourth reminder,
  the TTL ran to 21:00 local to the second, the 410 fallback and revocation worked, and the
  payload wording was verbatim and figure-free.
- Undo is precise: minor-unit restores, row-version conflicts that name the blocker, batches all
  or nothing, undo of an undo, and a clean 404 for unknown entries.
- Isolation held on every P3 route tried. Ten P3 routes refuse a missing session, and the four
  writes tried from a foreign origin were refused and changed nothing.
- Analytics is disciplined: every event carried `segment`, and no prop carried an amount, a
  currency or a name.
- Insights and the agent tool agree to the cent, and the figures check by hand.
- No horizontal scroll at 320 px anywhere tried. Dark mode has no serious axe findings, and no
  screen threw.

## Suggested manual checks for the Founder

1. **First:** GitHub → Settings → Billing (Actions) to clear issue 2. Then run Daily backup, MCP
   probe and FX by hand and confirm they are green.
2. Vercel → the project's Cron Jobs and Logs: confirm `/api/cron/reminders` actually runs at
   01:00, 09:00 and 17:00 UTC, before the first reminders fall due (~2026-11-14). This also closes
   P3-T10's open criterion.
3. `pnpm smoke --origin https://netnetapp.io` from your machine.
4. After issue 5's fix: revoke the probe's connection and re-run the one-time setup in
   `ops/probe.md`.
5. A real iPhone with NetNet on the Home Screen, and an Android phone: turn push on, receive a
   reminder, open it from the lock screen. On an iPhone in a Safari tab, no push option appears.
6. Inbox delivery of a reminder email, and one-click unsubscribe from the mail client's own
   button.
7. A daytime-only send (nothing overnight) and a revocation reading in Activity, on production.
8. Hands-on: undo an agent turn, change the default currency and look at Activity (issue 1),
   Insights M/Q/Y with filters and Don't Show, and the holding chart's paging.
9. Export on an iPhone in Safari (issue 14), and the push switch turning itself back on after
   signing in again (unit-covered only).
