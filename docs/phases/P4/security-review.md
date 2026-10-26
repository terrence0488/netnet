# P4-T13: The security review before launch

**Summary.** An independent review of NetNet as it will launch: the code, tests and workflows on
`main` at `6c95647` (P4-T4 merged; main CI run 40245726959 green), and production through its
unauthenticated public surface (deployed from the same commit by deploy run 40246336691). The
review found **no Critical**, **one High**, **two Medium**, **four Low** and **eight Info**
findings. The load-bearing controls hold: row-level security with `FORCE` and a catalog-driven
schema test, the REST/MCP/Ledger isolation registries, sessions (cookie flags, Origin check,
single-use tokens, re-authentication), agent OAuth (PKCE S256 only, exact redirect URIs,
`resource`/`iss`, audience and expiry, refresh rotation, revocation on the next call), MCP limits
and structures, secrets hygiene, headers, the privacy pipelines, and account deletion with its
30-day backup window. The High finding is a privacy-pipeline leak that contradicts N9 and the
published privacy policy and should be fixed before launch; the two Medium findings (unbounded
unauthenticated CIMD resolution, and a CIMD client shown under a self-chosen name with no host)
are small fixes that also belong before go-live. No code was changed by this review.

**Verdict: PASS WITH FINDINGS (conditional).** The tree is mergeable and the launch machinery is
sound; H-1 and M-1/M-2 should land before launch, and L-2 (`ledger_state`) and L-3 (`OPS_EMAIL`)
need a decision rather than a discovery in production. Nothing in the review blocks the docs-only
branch that carries it.

## Scope and method

- **Inputs read:** `docs/phases/P4/tasks/P4-T13.md` (the brief); architecture §6.1, §7 (7.1–7.10),
  §8, §9, §10; `CONVENTIONS.md` §3, §6, §7, §9, §11, §15; PRD N4, N5, N8, N9; `docs/decisions.md`;
  the code, tests and workflows on `main`; `ops/backup.md`, `ops/health.md`, `ops/probe.md`; the
  behaviour of the libraries and services the app delegates to (CIMD's transport and limits, the
  OAuth provider, Resend's and Neon's APIs).
- **Fresh session:** no P4 code was written here; the review read the tree as merged and changed
  only this document.
- **Local checks** (worktree at `6c95647`; `DATABASE_URL` copied from the main checkout's
  `.env.local` into the shell; local Postgres 18):
  - `pnpm install --frozen-lockfile` — ok.
  - `pnpm test` — 160 files, **1,806 tests passed** (includes the repo-level suites: headers,
    workflows, launch files, health, metrics, M12, N10).
  - `pnpm test:int` — 65 files, **892 tests passed** (RLS, grants, isolation, auth, OAuth, MCP,
    notifications, reminders, erasure).
  - `pnpm audit --prod` — **"No known vulnerabilities found"**.
  - `pnpm audit` (all, including dev) — 56 vulnerabilities (7 low, 27 moderate, 21 high, 1 critical):
    **all but one inside the `vercel` CLI's dev-dependency tree**, the exception a moderate `ajv`
    ReDoS in a direct devDependency; the production tree is clean (see I-7).
  - The `/api/me` race: the brief's test 60 times sequentially (**60/60 pass**) and two
    concurrent-confirmation probes (details in L-1).
  - Purpose-built, uncommitted probes (run with `npx tsx` against a scratch integration database
    or as a local HTTP probe) for the CIMD fetch, the approval API and the Sentry scrub; their
    outputs are quoted in the findings.
- **Production checks** used `curl` only, unauthenticated and non-destructive: `GET /`, `/privacy`,
  `/terms`, `/robots.txt`, `/app/`, `/app/sw.js`, `/app/connect/approve`, `/api/health`, `/api/geo`,
  `/api/auth/get-session`, `/api/auth/jwks`, `/.well-known/oauth-authorization-server`,
  `/.well-known/oauth-protected-resource` (and `/mcp`), `POST /mcp` without a token (401),
  `POST /api/cron/health` without a secret (401), and two `GET /api/auth/oauth2/authorize`
  requests that the OAuth server treats as an agent's (they made it fetch
  `https://example.com/client.json`, which answered 404; no account, email or data was created).
  **No accounts, emails, uploads or destructive requests were made in production.**
- **One method note:** the first, heavily parallel repeat of the `/api/me` test (8 vitest processes
  at once) produced 42 failures — all `28P01 password authentication failed for user
  "netnet_app"`. The integration harness creates a fresh database per file but the roles are
  cluster-wide, so parallel *files* fight over `netnet_app`'s password. Those failures are a
  harness limitation, not the app; CI runs integration files sequentially
  (`fileParallelism: false`), and the probe that measures the race runs in one process against one
  database.

## Findings

| ID | Severity | Finding |
|---|---|---|
| H-1 | **High** | Sentry receives SQL text and bound parameter values on an unexpected database error |
| M-1 | **Medium** | Unauthenticated CIMD resolution is unbounded: any caller can make the function fetch a URL and store a new `oauth_client` row |
| M-2 | **Medium** | A CIMD client's self-chosen name is shown as verified, without its host, on the approval page and in the security email |
| L-1 | Low | `/api/me` first confirmation: a concurrent second confirmation can run `changeCountry` over the fresh ledger |
| L-2 | Low | `ledger.ledger_state` has no key to `core.user`, so a racing first confirmation can leave a ledger for an erased id (P3-T13's note) |
| L-3 | Low | `OPS_EMAIL` (F25) is unverified; without it every health alert is undeliverable |
| L-4 | Low | No purge of DCR/CIMD clients, expired codes, consents or refresh tokens (§6.2 says DCR clients go after 30 days) |
| I-1 | Info | `landing_view` and `signup_started` can be inflated by any caller (M10) |
| I-2 | Info | The OAuth metadata advertises an introspection endpoint NetNet does not serve |
| I-3 | Info | Two defence-in-depth checks in the approval path are looser than they read |
| I-4 | Info | `POST /api/cron/health` has no body-size limit (behind `CRON_SECRET`) |
| I-5 | Info | `pnpm db:seed` has no production guard |
| I-6 | Info | No rate limit on `/api/auth/oauth2/revoke` or `POST /api/agent/attempts` |
| I-7 | Info | The dev-dependency tree carries the dev advisories (mostly the `vercel` CLI); the production tree is clean |
| I-8 | Info | Production's deploy gate is one person's manual dispatch (accepted; recorded) |

### H-1 — Sentry receives SQL text and bound parameter values on an unexpected database error

- **Where:** `apps/api/src/lib/sentry.ts:47-50` and its web mirror `apps/web/src/sentry.ts:47-50`.
  `scrubSentryEvent()` redacts email addresses in `event.message` and in each
  `exception.values[].value`, and drops request bodies, query strings, cookies, headers and
  breadcrumb text — but the exception value itself is kept, minus emails.
- **Why it matters:** Drizzle's errors carry the SQL and its bound parameters in the message. The
  local run of the brief's own flaky test printed exactly that shape:
  `DrizzleQueryError: Failed query: select "country", … from "core"."profile" where … = $1 limit $2  params: usr_…,1`.
  Replace that `select` with an insert whose parameters are a holding name and an amount (a tag
  rename that races its unique index, an uncaught `23505`, a dropped connection mid-write), and
  the message carries the person's words and figures. `reportError()` (`sentry.ts:95-100`) sends
  that error to Sentry on every unexpected failure, when Sentry is enabled. This contradicts N9, CONVENTIONS §6, and the
  published policy's "Amounts, names or text in analytics, logs or error reports" never
  (`apps/landing/privacy.html`, "What NetNet never receives"). The log line is safe — `errorClass()`
  keeps only the class name and SQLSTATE — so the leak is Sentry's alone.
- **Reproduce (local, no DSN needed):**

  ```ts
  // npx tsx, importing apps/api/src/lib/sentry.ts
  scrubSentryEvent({
    exception: {
      values: [
        {
          type: 'DrizzleQueryError',
          value:
            'Failed query: insert into "ledger"."holding" ("name", "amount_minor") values ($1, $2) ' +
            'params: Harborview Global Index Fund,2384117',
        },
      ],
    },
  });
  ```

  Actual (quoted from the probe): `apiExceptionValue` and `webExceptionValue` both still contain
  `… params: Harborview Global Index Fund,2384117`. Expected: no holding name, amount or free
  text in any field sent to Sentry.
- **Expected vs actual:** expected a scrub that drops exception values (or keeps only the class),
  as it already drops bodies and breadcrumbs; actual keeps them.
- **Proposed fix (S):** in both scrubs, replace every `exception.values[].value` with a fixed
  placeholder (keep `type` and the stack; drop `event.extra` and `event.contexts` too), and add
  the probe above to `sentry.test.ts` on both sides. Two files, one test each. (This is High while
  `SENTRY_DSN` is set in production — the architecture says it is, §10; I could not read Vercel's
  environment variables. If the DSN is unset, the finding drops to Info, because nothing leaves
  the process.)
- **Task:** suggested P4-T16.

### M-1 — Unauthenticated CIMD resolution is unbounded

- **Where:** `apps/api/src/auth/oauth-routes.ts` (`GET /oauth2/authorize`, no rate limit) with
  `apps/api/src/auth/oauth.ts`'s CIMD plugin. The library resolves an unknown `client_id` URL
  inside the authorize request, **before** it looks for a session (the provider's authorize
  handler calls `getClient(...)` before `getSessionFromCtx`), and persists a valid document as a
  `core.oauth_client` row. DCR is limited to 10 an hour per IP (`REGISTRATIONS_PER_HOUR`); the
  authorize path that a CIMD client uses is not limited at all.
- **Impact:** an unauthenticated script can (a) make the function issue a GET to any public HTTPS
  URL it names (5 s timeout, 5 KB, no redirects, private addresses refused — the transport is
  sound; the volume is not), and (b) create one `core.oauth_client` row per unique URL that serves
  a valid document. Neither is purged (L-4). On Neon Free's 0.5 GB that is a storage-exhaustion
  path, alerted at 0.35 GB (the health check) but not stopped; it also spends function time and
  outbound requests.
- **Reproduce:** a probe over the integration harness serves 25 valid CIMD documents at 25 unique
  `https://agent.example/cimd/client-N.json` URLs and calls `GET /api/auth/oauth2/authorize` for
  each with **no cookie** (valid `response_type`, `redirect_uri`, `resource`, PKCE S256). Result:
  `{"requests":25,"cimdFetches":25,"oauthClientRows":25}` and 25 `302`s to the login page. In
  production, `GET /api/auth/oauth2/authorize?client_id=https://example.com/client.json&…` answered
  `302 …?error=invalid_client&error_description=Metadata+document+fetch+returned+HTTP+404` (a real
  fetch, no row because example.com has no document), and a repeat immediately after answered
  `error=temporarily_unavailable&error_description=metadata+document+fetch+is+within+the+per-client+minimum+interval`
  — the per-client interval limits repeats of *one* URL, not distinct ones.
- **Expected vs actual:** expected a bounded, purgeable path (as DCR is); actual unbounded
  distinct URLs and persisted rows.
- **Proposed fix (S–M):** (1) rate-limit authorize per IP in `oauthRoutes`, e.g. 60/min
  (one `deps.rateLimit('oauth-authorize:ip:…', 60, 60)` line, same as the other routes); (2) cap
  new CIMD clients, e.g. 60 an hour globally, and refuse with a plain `temporarily_unavailable`;
  (3) add the 30-day purge from L-4. Tests: the existing OAuth suite plus a new case for the
  limit.
- **Task:** suggested P4-T17.

### M-2 — A CIMD client's self-chosen name is shown as verified, without its host

- **Where:** `apps/api/src/auth/approval.ts:175` (`nameVerified: p.registration === 'cimd'`) and
  the page's use of it, `apps/web/src/routes/connect/Approve.tsx:84-92`, which shows the caveat
  "NetNet can't verify this name" **only when `nameVerified` is false**. The same field drives
  the security email (`apps/api/src/notify/templates/security.ts`), which appends "(the name it
  gave; NetNet can't verify it)" only for DCR.
- **Why it matters:** a CIMD name is no more verified than a DCR one — it is text in a document
  the client hosts at a URL it chose. An attacker can host a CIMD document at
  `https://attacker.example/client.json` whose `client_name` is "Claude", send a signed-in, email-verified person
  the authorize URL, and NetNet's own page (real origin, real TLS) says **"Claude wants to connect
  to your NetNet"**, with no caveat, no host and no classification, above the Allow button that
  grants `ledger.read` and `ledger.write`. The API already returns `host` and `client`, so the
  page is discarding the two facts that would let a person tell.
- **Reproduce:** a probe over the integration harness signs a person up, serves a CIMD document at
  `https://attacker.example/client.json` named "Claude", runs the authorize request and reads
  `GET /api/agent/approval?‹the signed query›` as the person. Actual:

  ```json
  {
    "clientName": "Claude",
    "registration": "cimd",
    "nameVerified": true,
    "client": "other",
    "host": "attacker.example",
    "scopes": ["ledger.read", "ledger.write", "offline_access"]
  }
  ```

  The page then renders no caveat and no host (`Approve.test.tsx:78` pins "shows no caveat for a
  verified name"), and the security email names "Claude" without the caveat.
- **Expected vs actual:** expected the page (and email) to show *who* is asking in a way a person
  can judge — the host, and the caveat for any name not tied to a named guide's host; actual a
  bare, attacker-chosen name marked verified.
- **Proposed fix (S):** pass `host` and `client` through to the page and show the host under the
  title ("Requests come from attacker.example"), and treat `nameVerified` as true only when the
  classification is `claude`/`chatgpt` (the host matched that guide's `matchHosts`); otherwise
  show the existing caveat. In the email, use the same rule for the caveat. UI + one template
  change, with tests.
- **Task:** suggested P4-T18.

### L-1 — `/api/me` first confirmation: a concurrent second confirmation can run `changeCountry`

- **Where:** `apps/api/src/http/me.ts:216-239`. The handler reads `before` (the profile) at the
  start, then, after `updateProfile`, decides between "make the ledger" and "move it" from a
  **separate** read of the ledger's base currency (`:232`), comparing `before?.country` (`:235`).
  Two concurrent first confirmations can interleave so that the second request's `before` still
  says `country: null` while its later base-currency read sees the first request's new ledger:
  the second then calls `changeLedgerCountry` for the *same* country.
  `apps/api/src/ledger/taxonomy.ts:95-121` is race-safe for the row itself
  (`INSERT … ON CONFLICT DO NOTHING`; the loser returns), but `changeCountry` is a second write.
- **Reproduce:** the brief's test, 60 times sequentially: **60/60 pass** (`npx vitest run --project
  integration apps/api/test/http/me-init.test.ts -t "makes one ledger when two first confirmations
  arrive at once"`). A probe that fires 5 simultaneous confirmations per person over 400 people
  found **1 anomaly** (`{"n":1,"v":2,"c":"EUR"}` with audit
  `ledger create 1, type create 26, type delete 13`): one ledger, **`data_version` 2** instead of
  1, the first types deleted and 13 new ones created. 1,000 two-way pairs found none (0/1,000),
  which matches why CI sees this rarely; the interleaving needs the second request's profile read
  before the first's commit and its currency read after.
- **Expected vs actual:** expected one init, `data_version` 1, the first type ids; actual
  sometimes a duplicate "move country" write, a bumped version and replaced type ids. The test's
  assertion is therefore legitimate, not a flaky harness; the 42 parallel-vitest failures I saw
  separately were a different, test-only cause (see the method note).
- **Proposed fix (S):** make `init` report whether it created the ledger (it already knows:
  `created` in `taxonomy.ts:100`) and have the handler skip `changeLedgerCountry` when it did;
  or decide from one value (e.g. the `RETURNING` profile's previous country inside the update).
  No schema change; one route + one Ledger signature, with the existing test and one new
  concurrent case.
- **Task:** suggested P4-T19 (or fold into the L-2 task).

### L-2 — `ledger.ledger_state` has no key to `core.user`

- **Where:** `apps/api/src/ledger/schema.ts:78-94` — `ledger_state.user_id` is a primary key with a
  `usr_` check, and every other `ledger` table hangs off it, but nothing ties it to
  `core."user"`. `apps/api/test/rls/schema.test.ts` deliberately rejects a `ledger` foreign key
  that points outside `ledger` (its "points outside ledger, at core.profile" rule), so the
  obvious FK is not available inside the current isolation design. This is P3-T13's open note.
- **Why it matters:** `DELETE /api/account` (`apps/api/src/http/account.ts`) destroys the ledger
  and then deletes the user row in one transaction. A `PATCH /api/me {country}` already in flight
  (a session that is still valid for that request) can commit its `init` after that transaction,
  because nothing in the init touches `core.user` and no lock stops it: the result is a ledger
  row (and types) for an erased id. It is unreachable (RLS, no session, no account) and carries
  no one else's data, but it outlives the stated 30-day window, against J10 and the privacy page.
  The erasure test searches every text column of `core` and `ledger` for the id
  (`apps/api/test/support/erasure.ts`) but never races an init, so it does not catch this.
- **Reproduce:** hold `DELETE /api/account` just before commit (the test's `holdTheDeletion()`
  seam), start `PATCH /api/me {country}` from the same session, then let the deletion commit; the
  ledger row from the init is still there. Expected: nothing carrying the erased id; actual: a
  ledger with the erased id can be committed after the deletion.
- **Expected vs actual / recommendation:** the window is narrow (one in-flight first confirmation),
  but closing it is cheap and it is a deletion-promise gap, so **close it before launch** rather
  than record it: (1) in the deletion transaction, delete the `core.user` row *before*
  `destroy()` (the ledger delete then runs after the exclusive lock is held, so a write that got
  in first is swept); (2) in `withUser`'s write path, take a `FOR SHARE` lock on the account row
  (`select id from core."user" where id = $1 for share` via a `db/**` helper, which is where
  `core` belongs per CONVENTIONS §3) before the ledger lock: a write then either blocks the
  deletion (and is swept after) or finds no account and fails. If the Founder prefers to accept
  it, record it in `decisions.md` as an accepted narrow race; do not leave it unstated.
- **Proposed fix (M):** the two changes above, a test that races a first confirmation against the
  deletion, and a line in architecture §6.3/§8. No change to the RLS model.
- **Task:** suggested P4-T19.

### L-3 — `OPS_EMAIL` (F25) is unverified; without it every health alert is undeliverable

- **Where:** `apps/api/src/jobs/health.ts` (`opsEmailConfigured`, the `unreadable_ops_email`
  trigger), `apps/api/src/notify/notify.ts` (`notifyOperator` returns `nowhere` and logs when the
  address is empty), `ops/health.md` §"`OPS_EMAIL` (F25)".
- **Why it matters:** the daily health check's whole purpose is to email the Founder when a limit
  or a figure needs attention. With `OPS_EMAIL` unset in Vercel Production the check still answers
  and the workflow still goes red with `unreadable_ops_email` in its log, but no email is sent —
  and this review could not read Vercel's environment (CLI logged out, and reading secrets is out
  of scope). F25's own text says the value is unverified.
- **Reproduce:** there is no way to prove the absence from here; the proof is positive: set it,
  then `gh workflow run cron-health.yml -f test_alert=true` (or Actions → Health check → Run
  workflow with `test_alert`) and confirm the "NetNet health: test" email arrives.
- **Expected vs actual:** expected a verified alert address before launch; actual unknown.
- **Proposed fix (XS):** set `OPS_EMAIL` in Vercel Production (Founder), dispatch the test alert
  once, and add the result to the F25 checklist. If it cannot be set, accept that the red run is
  the only signal and say so in `ops/health.md`.
- **Task:** no code; Founder checklist.

### L-4 — No purge of DCR/CIMD clients, expired codes, consents or refresh tokens

- **Where:** architecture §6.2 promises "DCR clients unused for 30 days are purged"; P1-T13's
  report recorded it as not done (`docs/phases/P1/tasks/P1-T13.md:230`), and nothing since
  implements it: `apps/api/src/jobs/daily.ts` sweeps connection attempts and visitor salts only,
  and no code deletes `core.oauth_client`, `oauth_client_resource`, `oauth_consent`,
  `oauth_access_token` or `oauth_refresh_token` rows.
- **Why it matters:** rows accumulate forever (the CIMD path in M-1 can create them
  unauthenticated); expired codes/tokens and old clients are noise whose growth is bounded only
  by the damage already done. The health check would alert at 0.35 GB but cannot stop it.
- **Reproduce:** `grep -rn "delete(oauthClient\|purge" apps/api/src` → nothing; run two DCR
  registrations and see the rows remain after their clients are gone.
- **Expected vs actual:** expected a sweep per §6.2; actual none.
- **Proposed fix (M):** extend `jobs/daily.ts` with (a) CIMD/DCR clients with no use and no token
  older than 30 days, (b) expired codes and access tokens, (c) revoked/rotated refresh tokens
  past expiry, (d) consents with no connection; each as one statement + a count in the daily
  response, with tests. It also gives M-1 a backstop.
- **Task:** suggested P4-T20.

### I-1 — `landing_view` and `signup_started` can be inflated by any caller

- **Where:** `apps/api/src/http/events.ts:114-137`, `apps/api/src/db/visitor.ts:66-73`.
- **Detail:** the limits are 60 events a minute per IP, and the visitor is
  `sha256(daily salt ‖ ip ‖ user-agent)` truncated to 16 hex characters: the same IP with a
  different `User-Agent` counts as another unique visitor; `signup_started` needs no session.
  Any script can inflate M10's denominator (and the denominator of the "≥1,200 visits" target),
  and a botnet inflates it further. It is analytics only: no financial data moves, and the typed
  event schemas keep the rest intact.
- **Reproduce:** against a local app, send `POST /api/events` with
  `{"name":"signup_started","props":{}}` and no cookie 60 times a minute from one IP, and the same
  for `{"name":"landing_view","props":{}}` with a changing `User-Agent`: every one is accepted
  (204) and each new user agent counts as another visitor in `analytics.event` (M10's `daily_visitors`).
- **Proposed fix (XS):** accept and note it in `ops/metrics/m10-funnel.sql` (the safer direction: it can
  only make conversion look worse), or dedupe visitors by IP/day (coarser) and require a
  same-site `Origin` (already required by the Origin check for POST). Not a launch blocker.

### I-2 — The OAuth metadata advertises an introspection endpoint NetNet does not serve

- **Where:** production `/.well-known/oauth-authorization-server` lists
  `introspection_endpoint` and `introspection_endpoint_auth_methods_supported`; `POST
  /api/auth/oauth2/introspect` answers **404** (checked). P1-T13 recorded the same for
  back-channel logout (which DCR refuses: `oauth-routes.ts`'s `asksForBackChannelLogout`).
- **Detail:** harmless (clients that follow the metadata will get a 404 and fall back to JWT
  verification), but a hand-built metadata document later could leave both out.
- **Reproduce:** `curl -s https://netnetapp.io/.well-known/oauth-authorization-server | jq
  .introspection_endpoint` prints the URL; `curl -s -o /dev/null -w '%{http_code}' -X POST
  https://netnetapp.io/api/auth/oauth2/introspect -d token=x` prints `404`.
- **Proposed fix (S):** none needed now; record in the OAuth notes.

### I-3 — Two defence-in-depth checks in the approval path are looser than they read

- **Where:** `apps/api/src/auth/approval.ts:215` (`url.startsWith(redirectUri)`) and `:140`
  (`Date.now() - signedInAt > Number(maxAge) * 1000`).
- **Detail:** the redirect check compares prefixes, so a URL that merely *starts with* the
  registered URI would pass; the library already enforces an exact registered redirect URI (tested
  in `oauth.test.ts`), so this is belt-and-braces. A non-numeric `max_age` makes `Number(maxAge)`
  `NaN`, and the comparison false, so a malformed `max_age` is treated as satisfied; the value
  arrives inside the query NetNet signed, so a caller cannot change it afterwards, and the
  library's own validation is what keeps a non-numeric one out in practice.
- **Reproduce:** read the two lines; reaching either with a caller's own value needs a query the
  library signed, which is why this is Info and not a finding. A unit test can pass a `url` that
  merely starts with the registered URI and a non-numeric `max_age` to show the checks pass.
- **Proposed fix (XS):** parse `url` and compare `origin + pathname + search` to the registered URI; check
  `Number.isInteger(maxAge) && maxAge >= 0` before using it.

### I-4 — `POST /api/cron/health` has no body-size limit

- **Where:** `apps/api/src/app.ts` (`app.post('/api/cron/health', healthJob())`),
  `apps/api/src/jobs/health.ts` (`c.req.json()`).
- **Detail:** every other body-taking route has a `bodyLimit`; this one is behind `CRON_SECRET`
  (timing-safe, and a missing secret admits nothing), so only a secret holder can send a large
  body. Vercel's own request limit caps the damage.
- **Reproduce:** locally with `CRON_SECRET` set, `POST /api/cron/health` with a body of several
  megabytes and the correct bearer is read in full (no 413); without the bearer it is 401 before
  the body is read. Every other route answers the same size with `VALIDATION_FAILED`.
- **Proposed fix (XS):** add `bodyLimit({ maxSize: 8 * 1024 })`, as the health script's payload is a few
  hundred bytes.

### I-5 — `pnpm db:seed` has no production guard

- **Where:** `scripts/db-seed.ts`, `apps/api/src/db/seed.ts`.
- **Detail:** the seed creates `demo@example.com` (no password row, so it cannot sign in), a
  fictional agent connection, FX rows and a ledger. No workflow runs it against production, but a
  mistaken manual run with the production `DATABASE_URL` (a repository secret) would add them.
- **Reproduce:** `pnpm db:seed` against a scratch database twice: `demo@example.com`,
  `con_01K1G4KX00DEM…`, the FX rows and the ledger appear, and running it again changes nothing.
  There is no check of `VERCEL_ENV` or a `--env` flag.
- **Proposed fix (XS):** refuse when `VERCEL_ENV=production` unless `--force`, as `content:publish` does
  with `--strict` and reviews.

### I-6 — No rate limit on `/api/auth/oauth2/revoke` or `POST /api/agent/attempts`

- **Where:** `apps/api/src/auth/oauth-routes.ts` (revoke), `apps/api/src/http/agent.ts:74`
  (attempts).
- **Detail:** revoke is cheap and needs a live token; attempts need a verified session. Both are
  DB writes a holder can repeat (rows, not data exposure). Low volume in practice.
- **Reproduce:** locally, send 100 `POST /api/agent/attempts` in a minute with a verified session
  (all 201, no 429) and 100 revoke requests with a live token (all answered, no 429); each writes
  a `core.connection_attempt` or touches the token tables.
- **Proposed fix (XS):** add the same fixed-window limits as their neighbours (e.g. 60/min per IP,
  30/min per user) if the triage wants belt-and-braces.

### I-7 — The dev-dependency tree carries the dev advisories (mostly the `vercel` CLI)

- **Where:** `pnpm audit` (all) → 56 vulnerabilities, 1 critical, 21 high: 55 under
  `.>vercel>…` (`undici`, `tar`, `js-yaml`, `minimatch`, `zod` and others in the CLI's own tree),
  and one moderate `ajv` ReDoS (`$data`, GHSA-2g4f-4pwh-qvx6) in the root's `ajv` 8.6.3, a
  devDependency used by `content:check` (fixed in 8.18.0). `pnpm audit --prod` → none, and CI
  gates on `--prod --audit-level high`.
- **Detail:** the function, the web app and the shared packages are clean; the CLI runs only on
  CI/deploy runners, with the Vercel token, and never ships. Still worth clearing: Renovate
  #129 (vercel 65.2.0) is open and its Checks are green.
- **Reproduce:** `pnpm audit` (56 vulnerabilities) and `pnpm audit --prod` (none); the JSON's
  finding paths are all `.>vercel>…` but the `ajv` one.
- **Proposed fix (XS):** merge #134 (which takes `ajv` to 8.20.0), #129 (`vercel` 65), #135, #128
  and #131 (all green); close #130 (pnpm 12), whose Checks are failing.

### I-8 — Production's deploy gate is one person's manual dispatch (accepted)

- **Where:** `.github/workflows/deploy.yml` (`workflow_dispatch` only, `if:
  github.ref == 'refs/heads/main'`, `environment: Production` with no required reviewers);
  `docs/decisions.md` records the choice (a private repository on the free plan cannot have
  required reviewers).
- **Detail:** nothing deploys unless the Founder runs it, but anyone with repository write (or a
  stolen session) could dispatch it; the `Production` environment holds no secrets, and the
  repository's deploy secrets are repository-level so the schedules run unattended. This is the
  accepted design; noting it so the trade-off is visible at launch.
- **Reproduce:** read `.github/workflows/deploy.yml` (`on: workflow_dispatch`, the `main`-only
  `if`, `environment: Production` with no reviewers) and `docs/decisions.md`'s "Production
  deploys are gated by manual dispatch only" row.
- **Proposed fix:** none until the plan allows an environment reviewer; no code change.

## What holds

Every scope item of the brief, with the evidence that settles it:

| Scope item | Evidence | Result |
|---|---|---|
| RLS on every `ledger` table (`FORCE`, one policy, `user_id` in the PK, composite keys) | `apps/api/test/rls/schema.test.ts` (catalog-driven; a planted rogue table is caught by 14 named rules, and P4 adds no `ledger` table — a new one is checked without editing the test), `rls.test.ts` (raw SQL as `netnet_app`, A/B, inserts/updates refused with `42501`, no setting sees nothing), `apps/api/test/rls/grants.test.ts` (roles, ownership, grants, no `BYPASSRLS`, `TRUNCATE` refused, `netnet_metrics` analytics-only) | **Holds** |
| A test fails on a new table/route/tool/method without a case | `rls/schema.test.ts` (catalog), `http/isolation.test.ts:184-215` (every route of `app.routes`, or a reason), `mcp/isolation.test.ts:421` (`TOOL_REGISTRY`), `ledger/isolation.test.ts:258` (every Ledger method) | **Holds** |
| Every REST route and MCP tool as B with A's ids → `NOT_FOUND`, no marker strings, A's ledger unchanged | `http/isolation.test.ts`, `isolation/me.test.ts`, `isolation/agent.test.ts`, `mcp/isolation.test.ts`; all in the 892-test run | **Holds** |
| New P4 route `/api/cron/health` | `http/isolation.test.ts` `NO_USER_DATA` entry; `jobs/cron.ts` constant-time `CRON_SECRET`; production `POST` without it → **401** | **Holds** |
| New `landing_view` and its cookie-less visitor | `http/events.test.ts`, `events/visitor.test.ts` (no `Set-Cookie`; salt per UTC day, past salts deleted; `visitor` 16 hex, no user) | **Holds** (M10 inflation in I-1) |
| `demo:load` | `db/demo.ts` (verified account only, no existing holding, one `withUser` transaction, counts printed, no PII), `test/ledger/demo.test.ts` incl. "writes nothing to, and reads nothing of, another account's ledger"; workflow masks the email from the event payload | **Holds** |
| Sessions: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Secure-` prefix, 30 days sliding, token never in a body | `test/auth/accounts.test.ts:112-115` asserts `__Secure-netnet.session_token`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`; `:316-340` no token in any JSON; `auth.ts` `session: {expiresIn: 30d, updateAge: 1d}`; `withoutSessionToken()` | **Holds** |
| Sign-out, reset and verification tokens (single use, expiry) | `accounts.test.ts:371-393` (sign-out kills cookie and row), `:229-266` (verification marks once; a second click changes nothing), `:414-450` (reset once, every session revoked, wrong password refused); `resetPasswordTokenExpiresIn: 1h`, verification `expiresIn: 1d` | **Holds** |
| Re-authentication before deletion | `requireRecentSignIn` (10 min, unknown age refuses); `account-deletion.test.ts` (fresh deletes, old refuses with `REAUTH_REQUIRED`) | **Holds** |
| Rate limits as §8 states them | `routes.ts` sign-up 5/min/IP, sign-in 10/min/IP+email, reset/verify 5/min/IP; `oauth-routes.ts` DCR 10/h/IP; `mcp/route.ts` 120/min + 5,000/day per connection; `record_values` 1–200; tests at `accounts.test.ts:454-506`, `oauth.test.ts:266-292`, `mcp/lifecycle.test.ts:351-417` | **Holds** |
| Account-existence responses beyond the settled sign-up 422 | sign-in unknown vs wrong password: same 401 and byte-identical body (`accounts.test.ts:345-356`); reset identical 200/body, email only to a real account (`:395-407`); `send-verification-email` without a session returns the same `{status:true}` after a 500 ms floor, and with a session compares to the session's own address first | **Holds** |
| Origin check on every state-changing route | `origin-check.ts` on `*` for `POST/PUT/PATCH/DELETE` under `/api`, exempting the three cookie-less OAuth endpoints; `accounts.test.ts:508-560` (evil Origin refused on sign-in, `PATCH /api/me`, `/api/events`; `Sec-Fetch-Site` without Origin; neither header passes) | **Holds** |
| OAuth: CIMD fetch limits | `@better-auth/cimd` node transport: HTTPS only, all DNS answers public-routable, pinned address, no redirects; plugin 5 KB, 5 s, JSON content type; `oauth.test.ts:400-450` (HTTP, private/link-local refused before a fetch; >5 KB refused) | **Holds** (volume: M-1) |
| OAuth: DCR | Unauthenticated by design, 10/h/IP, public clients, back-channel logout refused; `oauth.test.ts:219-311` | **Holds** |
| OAuth: redirect URI matching, PKCE S256, `resource`, `iss` | Provider: exact match (loopback-port allowance for native), S256 only, PKCE required for public clients; NetNet refuses a missing `resource` before the library (production: `302 …?error=invalid_target`), metadata advertises `code_challenge_methods_supported: ["S256"]` and `authorization_response_iss_parameter_supported: true`; tests `oauth.test.ts:313-397` | **Holds** |
| OAuth: audience and expiry, refresh rotation, revocation | `mcp-token.ts` verifies signature (EdDSA), issuer, `aud` = `/mcp`, `typ` `at+jwt`, `exp`, `sub`/`client_id`/`scope`/`connection_id`; unit tests refuse another audience/issuer/key, an ID token, expiry, no connection, no scope (`mcp-token.test.ts`). Refresh rotation and replay revocation: `oauth.test.ts:241-264`. Revocation reaches the next call: `mcp/route.ts` + `withUser`'s `isConnectionActive`; `connections.test.ts:706-800` | **Holds** |
| OAuth: approval page framing, signed query, fresh sign-in | CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY` on `/app/connect/approve` (production checked); `verifyOAuthQueryParams` with a 10-minute expiry, tampering refused (`connections.test.ts:155-183`), `prompt=login`/`max_age` (`:166-183`) | **Holds** |
| OpenID scopes dropped | `agentScope()` drops `profile`/`email`, keeps `openid`, adds both ledger scopes when none named; metadata advertises only the ledger scopes and `offline_access` (production checked); `oauth.test.ts:177-217` (Codex connects, never learns name/email) | **Holds** |
| MCP: per-connection limits, input bounds, error leakage, prompt injection | `mcp/route.ts` 120/min + 5,000/day; `packages/contracts/src/mcp/shared.ts` (ids 64, names `MAX_NAME_LENGTH`, cursors 200, limits ≤100/500/100, cadence ≤3,650, amounts checked against the currency and 10¹⁵ minor in the Ledger, dates as calendar dates at most a day ahead), `record-values.ts` 1..200; `errors.ts` answers INTERNAL with a request id only; tool text is `JSON.stringify(structuredContent)` (`server.ts` `asText`), so user text is always a JSON string value, quoted in the context's notes (`wording.ts` "…"); descriptions are constants; no `dangerouslySetInnerHTML` in the web app or the landing page | **Holds** (residual: user names in prose notes are still user text — inherent, and quoted) |
| Outbound requests and caller-steerable URLs | Fixed endpoints only: Frankfurter FX, Resend, Neon (health script), Vercel (workflows), Sentry SDK; push endpoints are restricted to `PUSH_SERVICE_HOSTS` with `redirect: 'error'` and IP literals/userinfo/ports refused; CIMD is the only caller-named URL and its transport is sound (volume: M-1); no other fetch takes a request value | **Holds** |
| Secrets: repo and history, workflow masking, least privilege, pinned actions, no untrusted input in a shell | Full-history scan (`git log --all -p`, 293k lines) for private-key blocks, `ghp_/gho_/ghs_/github_pat_/ntn_/sk_live/sk-proj/AKIA/re_…/xoxb-`: **none**; only `.env.example` was ever tracked; `.env.example` lists names only. Every `uses:` is a 40-hex commit (zero unpinned); no `pull_request_target`; every workflow `permissions: contents: read` (+ `pull-requests: read` on preview/cleanup); `test/workflows/scan.test.ts` finds no token-carrying `${{ }}` in a `run:`; probe/CI mask generated secrets (`::add-mask::`), and the demo-load email is read from the event payload and masked | **Holds** |
| Headers and the browser: CSP, HSTS, framing, service worker, `landing_view` abuse | `vercel.json` + `test/headers/headers.test.ts`; production checked on `/`, `/privacy`, `/app/`, `/app/connect/approve`: CSP (no `unsafe-`, `frame-ancestors 'none'`, Sentry ingest only), HSTS 2 years + subdomains, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, no-store on `/api`, `/mcp` and `/.well-known`, no-cache pages, immutable hashed assets. `/app/sw.js` is byte-identical to the repo, handles `push` and `notificationclick` only, no `fetch`/`caches`, same-origin tap targets; the landing page sets no cookie (`landing_view` with `credentials: 'omit'`). A CSP probe in Chromium confirmed `style-src 'self'` blocks an inline **style attribute**, but React's `style={{…}}` writes through CSSOM and is **not** blocked (probe: height 123 px applied from an external script), so the 19 inline `style={{…}}` usages in the web app are unaffected | **Holds** |
| Privacy pipelines: `track()`, `log()`, Sentry scrub, `notify()` and `ops.health_alert`, metrics, M12 | `events.ts` in contracts has no free-text prop (every prop is an enum or number); `track()` re-checks the schema, attaches `segment`/`user_id`/`visitor`/`app_version`, writes an account-less user only while the account exists (or a re-keyed id), and never throws; `log.ts` whitelists 13 fields with exact forms (`errorName`, SQLSTATE) and drops messages; `templates.test.ts` runs the privacy check over every message kind including `ops.health_alert` (no user id, address, name or amount); `health-alert.ts` formats counts/sizes/percentages/dates only; `ops/metrics/*.sql` read `analytics.event` only (no `ledger` or `core` reference); M12 uses only `content/demo/household.json` (fictional), runs a scratch database, and its transcripts stay out of git | **Holds except H-1** |
| Data lifecycle: deletion completeness, export, 30-day backups | `account.ts` (recent sign-in; one transaction: revoke connections, `destroy()` the ledger, endpoints, reminder state, attempts, profile, user row, re-key events; `account_deleted` after commit on the random id); `account-deletion.test.ts` scans **every text column of `core` and `ledger`** for the erased id (`rowsCarrying`), including a request that races the deletion, and asserts the `core` schema ties every user-keyed table to `core.user` (catalog); `export.ts` carries types, tags, holdings (with access and basis), every value with currency, base, rate, rate date and given rate, as JSON or CSV; `backup.yml` dumps all schemas, encrypts with `age` to `BACKUP_PUBLIC_KEY`, keeps 30 days; `ops/backup.md` records a proven restore (2026-10-08, fictional) and the offline private key. P3-T13's `ledger_state` note: L-2 | **Holds except L-2** |
| Dependencies | `pnpm audit --prod`: no known vulnerabilities; Renovate #128, #129, #131, #134, #135 green; #130 (pnpm 12) red | **Holds** (I-7) |
| Operations: backup encryption, restore path, Founder-only deploy | `backup.yml` + `ops/backup.md` (age, 30 days, restore steps, proof); `deploy.yml` (dispatch only, `refs/heads/main`, `Production` environment, migrate → content → deploy → moved check → smoke → rollback); `cron-*.yml` require `CRON_SECRET`; the Neon key stays in GitHub and never in the function (`grep` of the function's env); the health check's alert is the only operator email | **Holds** (L-3, I-8) |
| Production public surface | `/` 200 with `noindex`, `/privacy` 200, `/terms` 200, `/api/health` `{"ok":true}`, `/mcp` 401 with `WWW-Authenticate: Bearer resource_metadata="…"`, `POST /api/cron/health` 401 without a secret, `/.well-known/*` metadata correct (`issuer`, `resource`, scopes), `/api/auth/jwks` Ed25519, `/api/auth/get-session` null without a cookie, `/app/sw.js` identical to the repo, `/app/connect/approve` 200 with `frame-ancestors 'none'` | **Holds** |

## Checks the Founder should run by hand

1. **`OPS_EMAIL` (L-3):** set it in Vercel → Production, then Actions → **Health check** → Run
   workflow with `test_alert`, and confirm the "NetNet health: test" email arrives. If it does
   not, the daily alert has no channel and that is a launch decision.
2. **Sentry (H-1):** confirm `SENTRY_DSN` is set in Vercel Production (the architecture says it
   is), then, after the scrub fix, trigger one deliberate server error and check the event in
   Sentry: no SQL, no parameters, no names or amounts. If the DSN is not set, say so — the
   finding is then Info.
3. **Production env, presence only:** `BETTER_AUTH_SECRET`, `RESEND_API_KEY` + `EMAIL_FROM`,
   `OPS_EMAIL`, `LINK_SIGNING_SECRET`, the three `VAPID_*`, `CRON_SECRET`, `DATABASE_URL` and
   `SENTRY_DSN` (F19/F25 and the rest). The review could not read Vercel's environment.
4. **One real agent connection against production:** connect Claude, check the approval page shows
   the client and the security email arrives, then revoke it in the Agent tab and confirm the
   next call is rejected. Do this after M-2's fix so the page shows the host.
5. **The restore drill (P4-T14):** run `ops/backup.md`'s steps on a scratch branch from the latest
   artifact, and confirm the private key is offline and the artifact was 30-day retention.
6. **Dependencies:** merge Renovate #134, #135, #128, #129, #131 after a read; close #130 until
   pnpm 12 is supported.
7. **Repository access:** confirm who can run Actions / push to `main`, and that the `Production`
   environment's lack of a reviewer is still the accepted decision (`decisions.md`).
8. **The `/api/me` race (L-1):** after the fix, run the brief's test 30–50 times
   (`npx vitest run --project integration apps/api/test/http/me-init.test.ts -t "makes one
   ledger…"`), and the 5-way probe once.

## What this review could not reach

- **Vercel's environment variables** (all of them: `OPS_EMAIL`, `SENTRY_DSN`, `VAPID_*`,
  `LINK_SIGNING_SECRET`, `RESEND_API_KEY`, `BETTER_AUTH_SECRET`, `DATABASE_URL`): the CLI is
  logged out and the brief says not to read Vercel secrets. F25 is therefore reported (L-3), not
  proven.
- **Authenticated production flows:** no account was created, no email sent, no data uploaded.
  Every authenticated flow was exercised against the local app and the integration database
  instead, which is what the brief asks.
- **Neon's console and API** (compute, storage, branches, restore history): no credentials. The
  restore path is `ops/backup.md`'s recorded proof, not a drill this session ran; P4-T14 runs it.
- **GitHub repository settings** (branch protection, environment reviewers, collaborator list,
  secret values): only the workflows were read. The "Founder-only" deploy is `workflow_dispatch`
  plus write access, not a setting this session could verify.
- **A real MCP call with a production token, a real DCR registration, a real CIMD client and a
  real agent connection**: all would write to production or send email; they are covered by the
  integration suites instead (and the production `/mcp` 401 challenge was read).
- **Google and Apple sign-in** (F17/F18 are pending): the unconfigured path is tested
  (`providers-unconfigured.test.ts`); a live round trip was not possible.
- **Sentry's project settings**, DNS/TLS details beyond the HTTP responses, and the M12 harness's
  paid run (no spend): code and tests were read instead.

## What happens next

The fixes above become P4 tasks written by the triage that follows (WORKFLOW Stage 7; P4-T16
onward) — suggested mapping: H-1 → P4-T16, M-1 → P4-T17, M-2 → P4-T18, L-1/L-2 → P4-T19,
L-4 → P4-T20. Every Low and Info the Founder does not fix goes into `docs/decisions.md` as
accepted, with its reason. No code, brief or decision file was changed by this review; the only write is this
document.

— Reviewed 2026-10-26 against `main` at `6c95647` and production deployed from it (deploy run
40246336691).
