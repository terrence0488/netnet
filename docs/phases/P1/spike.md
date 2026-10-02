# P1-T2 spike: real Claude and ChatGPT over OAuth to a stateless MCP server

Status: **done.** The Founder's run is in section 1.7, its evidence in section 3 (from the
workflow report of 2026-10-02 22:20 UTC), and the verdict in section 5.

| | |
|---|---|
| Spike server | https://netnet-p1-spike.vercel.app (Vercel preview, function in `sin1`, behind a stable alias). Deleted with its Neon branch by the cleanup run of 2026-10-02 22:28 UTC |
| Connector URL | `https://netnet-p1-spike.vercel.app/mcp` |
| Database | Neon project `netnet-preview`, branch `spike-p1-oauth-mcp`, database `netnet_spike` |
| Code | branch `spike/p1-oauth-mcp` (throwaway, never merged); workflow `.github/workflows/spike.yml` |
| Deployed by | [Spike P1-T2 run 3](https://github.com/terrence0488/netnet/actions/runs/36943679938), 2026-10-02 00:01 UTC |

## 1. Founder: the test to run

This is a throwaway test server with fictional data only. Use a made-up email and type nothing
real into it. Keep screenshots out of the repo (they become F11 later, cropped).

**Connector URL (paste exactly):** `https://netnet-p1-spike.vercel.app/mcp`

**Write down as you go, for each client:**

- every screen you pass through, in order, with the exact words on its headings and buttons (the
  first draft of the setup guides, P1-T3, and the shot list for F11);
- the name the client shows for our server;
- on our approval page, the three lines in the box: **Name the agent registered**, **How it
  identified itself**, **Returns to**;
- your plan on that client (Free, Pro, Plus…), and anything that went wrong, word for word.

### 1.1 Make the test account (once, on your computer)

1. Open https://netnet-p1-spike.vercel.app/spike/sign-in.
2. Under **New here? Create a test account**, enter any name, a made-up email such as
   `founder-test@example.com`, and a password of 8 or more characters. Press **Create account and
   continue**. You see "Signed in".

You sign in with this email and password whenever a client opens our page.

### 1.2 Claude on your computer (claude.ai or the Claude desktop app)

1. Open **Customize → Connectors**. Choose **+ Add**, then **Add custom connector**.
2. Name: `NetNet spike`. URL: the connector URL. Choose **Continue**.
3. Claude shows the authentication settings it detected: note them. Under **OAuth client**, choose
   **Use Claude's published identity (Recommended)**. Choose **Add**.
4. Choose **Connect**. Our sign-in page opens: sign in with the test account. Our approval page
   opens: note the three lines in the box, then press **Allow**. You return to Claude.
5. Start a new chat. Under **+ → Connectors**, make sure **NetNet spike** is on. Ask:
   **"Call ping, then save a note saying hello."** Allow the tool calls if Claude asks. Note
   whether it called both tools and what it answered.
6. Warm latency: in the same chat ask **"Call ping 10 times, one after another."**
7. Idle latency: leave NetNet alone for at least 6 minutes, then ask **"Call ping once."** Repeat
   (6 idle minutes, one ping) as many times as you can, up to 10.
8. If your plan allows a second custom connector, add the same URL again as `NetNet spike DCR`,
   and this time under **OAuth client** choose **Register automatically**. Connect, allow, and ask
   the step 5 question once. (On the free plan, which allows one custom connector, remove the first
   one before adding this one.)

### 1.3 Claude on your phone (the Claude app)

1. Open the Claude app on the same Claude account. Look for **NetNet spike** among its connectors
   (it may already be there from 1.2). If it asks you to connect, do: sign in on our page and press
   **Allow**, noting each screen.
2. If it is not there, try adding it from the phone (connector settings, **Add custom connector**,
   same name and URL). Note whether the phone allows this at all.
3. Ask: **"Call ping, then save a note saying hello."**

### 1.4 ChatGPT on your computer (Plus or above, developer mode on)

1. In ChatGPT open **Settings → Apps & Connectors** (note the wording you actually see). Under
   **Advanced settings**, turn **Developer mode** on.
2. Choose **Create**. Name: `NetNet spike`. MCP server URL: the connector URL. Authentication:
   **OAuth**. If it offers OAuth client fields, leave them empty and note what it offers. Tick that
   you trust the app, then **Create**.
3. Our sign-in page opens: sign in with the test account. On our approval page note the three lines,
   then press **Allow**.
4. Start a new chat. Under **+**, choose **Developer mode** and switch **NetNet spike** on. Ask:
   **"Call ping, then save a note saying hello."** Confirm the write if ChatGPT asks.
5. Latency: as in 1.2 steps 6 and 7.

### 1.5 ChatGPT on your phone (if your plan allows)

1. Open the ChatGPT app on the same account. See whether **NetNet spike** is offered in a chat
   (through **+** or the apps list). If it asks you to connect, connect and allow.
2. Ask: **"Call ping, then save a note saying hello."** Note it if the phone offers no
   developer-mode apps at all.

### 1.6 Report back

Send the notes from each section and the times you started and finished. The manager then runs
the spike workflow's **report** (section 4) and fills in the _Founder's run_ answers below.

### 1.7 Founder's run log

**Claude, desktop app (2026-10-02, about 21:35 UTC): connected, both tools called.**

1. Customize → Connectors, **Discover** tab: the card reads "NetNet spike · netnet-p1-spike.vercel.app
   · Custom" with a **+**.
2. Connect opens the browser at claude.ai: **"Finish connecting a connector?"** ("A link brought you
   here. Only continue if you started connecting a connector from Claude Desktop — a link on its
   own can never connect anything to your account."), **Show destination**, **Continue
   connecting** / **Not now**.
3. Our approval page (already signed in): "Allow Claude to use your NetNet?"; Name the agent
   registered: Claude; How it identified itself: Client ID Metadata Document; Client id
   `https://claude.ai/oauth/mcp-oauth-client-metadata`; Returns to `claude.ai`; Asks for
   `ledger.read ledger.write offline_access`. **Allow**.
4. claude.ai: **"Connected"**, "Taking you back to the desktop app. You can close this tab.",
   **Open desktop app**.
5. In a chat, "Call ping, then save a note saying hello.": Claude shows "Used NetNet spike" with
   "Loaded NetNet spike", "Used NetNet spike Ping" and "Used NetNet spike: Save a note hello", and
   answers with the server time and the saved note.

The first attempt stopped after step 2 on a page of JSON: §5 item 6, fixed the same day.

## 2. What the spike server is

- **Accounts:** Better Auth 1.7.7, email and password, tables generated by Better Auth's own
  migration. No email verification (no email provider in the spike).
- **OAuth:** `@better-auth/mcp` 1.7.7 (`mcp()`, which is `oauthProvider()` from
  `@better-auth/oauth-provider` 1.7.7 with the MCP resource bound and RFC 9728 metadata served),
  `@better-auth/cimd` 1.7.7 with `metadataProfile: "mcp-2026-07-28"` and its Node transport, the
  JWT plugin with `issuer` = the origin, DCR on and unauthenticated. Our own approval page at
  `/spike/approve`, sign-in page at `/spike/sign-in`.
- **MCP:** `POST /mcp`, our own JWT check (jose 6.2.12) in front of `createMcpHandler` from
  `@modelcontextprotocol/server` 2.2.0 with `legacy: "stateless"`. Tools `ping` (read: user id,
  server time, note count) and `note` (write: one row in `spike_note` under RLS).
- **Evidence:** every request writes a row to `spike_request_log` after the response (client name
  and version, protocol version from header and body, OAuth parameters without secrets, server-side
  duration, JWT-check and database timings, instance id and age, idle time, region).
- **Database:** app role `netnet_app` made by SQL (`NOBYPASSRLS`), connecting through Neon's
  pooler; `spike_note` with `ENABLE` and `FORCE ROW LEVEL SECURITY` and the architecture's policy.

| URL | What |
|---|---|
| `/mcp` | the connector URL |
| `/.well-known/oauth-protected-resource` (and `/mcp` suffix) | RFC 9728, served by `mcp()` |
| `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` | RFC 8414 / OIDC, issuer = origin |
| `/api/auth/oauth2/authorize`, `/token`, `/register`, `/api/auth/jwks` | Better Auth's endpoints, under its base path |
| `/spike/sign-in`, `/spike/approve`, `/spike/me`, `/spike/log`, `/spike/where` | bare pages, the log (signed-in only), the region |

**Scripted end-to-end run** (`apps/api/spike-scripts/roundtrip.ts`, run by the workflow from
GitHub's runner and from this session against the preview): **43 of 43 checks pass**. It signs up
a fictional user, registers by DCR and by CIMD (a metadata document the preview hosts at
`/spike/test-client.json`, fetched by Better Auth's CIMD transport over public HTTPS), goes through
our approval page, exchanges the code, verifies the JWT against the published JWKS, calls `ping` and
`note` over 2025-06-18, 2025-11-25 and 2026-07-28, rotates refresh tokens, and checks the negative
cases.

## 3. The seven questions

### Q1. OAuth

**Library capabilities: all present in Better Auth 1.7.7. No fallback library is needed.**

| Need (§7.6) | Result | Evidence |
|---|---|---|
| CIMD | Yes | Metadata `client_id_metadata_document_supported: true`; scripted CIMD client authorized end to end; stored with `clientDiscoveryId = "cimd"`; approval page showed "Client ID Metadata Document". Fetch limits: 5 s, 5 KB, no redirects, DNS-pinned public addresses only |
| DCR | Yes | `registration_endpoint` advertised; unauthenticated registration → 201, public client (`token_endpoint_auth_method: none`) |
| RFC 8707 `resource` | Yes, enforced at `/mcp` | `resource` → JWT `aud` = `/mcp` URL. Unknown resource → `invalid_target`. `resource` on authorize only → still a JWT for `/mcp`. **No `resource` at all → an opaque token, which `/mcp` rejects (401)**: the AS does not require it, our resource server does |
| PKCE S256 only | Yes | `code_challenge_methods_supported: ["S256"]`; `plain` → "code_challenge_method must be one of: S256"; none → "pkce is required for public clients" |
| RFC 9207 `iss` | Yes | `authorization_response_iss_parameter_supported: true`; every redirect carried `iss` = issuer |
| Refresh-token rotation | Yes | Each refresh returns a new refresh token. `mcp()` defaults a 30 s reuse window: the old token within 30 s replays the same response; after it, `invalid_grant` **and the whole family is revoked** (the newer token fails too). Each new refresh token gets a fresh `refreshTokenExpiresIn` (set to 90 days), so the lifetime slides |
| Our own approval page | Yes | `consentPage` option; the page verifies the signed query (`verifyOAuthQueryParams`) and posts `/api/auth/oauth2/consent {accept, oauth_query}` |

**Which registration each client uses:**

- **Claude:** its connector dialog offers both: "Use Claude's published identity (Recommended)"
  (CIMD) and "Register automatically" (DCR). Claude's documentation says it picks CIMD only when the
  AS metadata has both `client_id_metadata_document_supported: true` and `"none"` in
  `token_endpoint_auth_methods_supported`; ours has both. In the Founder's run both Claude
  connectors used CIMD; DCR was exercised by the scripted client only (Q7).
- **Codex:** CIMD (Q7).
- **ChatGPT:** not tested (Q7).

**Findings that P1-T13 (and P1-T11) must carry:**

1. **Endpoint paths.** Better Auth serves the OAuth endpoints under its base path:
   `/api/auth/oauth2/authorize`, `/token`, `/register` and `/api/auth/jwks`, not `/oauth2/*` as
   architecture §7.1 lists. Setting the JWT plugin's `issuer` to the origin makes the issuer the
   origin, and forwarding `/.well-known/*` to Better Auth's handler serves the metadata at the root.
   Clients follow the metadata, so nothing breaks. Settled (§5): §7.1 lists these paths.
2. **Consent is remembered.** A second authorization by the same client for the same scopes skips
   the approval page and redirects straight back with a code. With the architecture's "every Allow
   sends a security email" (J5), a reconnect sends none. Revocation must also delete the consent
   row, or the next connect is silent. Settled (§5): remembered consent is off.
3. **Better Auth's MCP docs recommend `legacy: "reject"`** on the MCP handler. That refuses every
   2025-era client; NetNet must keep `legacy: "stateless"` (Q3).
4. **Types.** Under our `exactOptionalPropertyTypes`, `mcp()`'s plugin type does not match
   `BetterAuthPlugin` (an `openapi` field typed `items?: undefined`); it needs one cast. It
   typechecks without the flag.
5. **Dependencies.** `better-call` 1.4.0 wants `@better-auth/utils` ^0.5.0 while
   `@better-auth/core` 1.7.7 pins 0.4.2, so pnpm makes two copies of core. Pinning
   `@better-auth/utils` 0.4.2, `@better-auth/core` 1.7.7 and `better-call` 1.4.0 in `apps/api`
   keeps one.
6. **Bundling.** The esbuild bundle needs `--external:pg-native` and a `createRequire` banner
   (`pg` is CommonJS and requires Node built-ins); the bundle is 3.9 MB.
7. The CIMD cache revalidates every 60 minutes by default (§7.6 allows up to 24 h;
   `metadataRevalidationInterval`). Email verification before Allow (§7.6) was not exercised.

### Q2. Tokens

**Yes.** Access tokens are JWTs we verify in the function against the JWKS with no database
lookup per request, and `aud` is the `/mcp` URL.

- Header `{"typ":"at+jwt","alg":"EdDSA","kid":…}` (Ed25519). Claims: `iss` = origin, `aud` =
  `https://netnet-p1-spike.vercel.app/mcp`, `sub` (user id), `client_id`, `azp`, `scope`, `sid`,
  `iat`, `exp` (`exp − iat` = 3600), `jti`.
- Our check: `jwtVerify` (jose) with `issuer` and `audience`; the JWKS comes from Better Auth's own
  handler in-process (one database read per function instance, no network hop), then jose caches
  it. Measured on the preview: **JWT check 0.5–1.7 ms** warm (one 6.7 ms outlier). The first
  authenticated request on each fresh instance (an `initialize`) took 51–57 ms server-side, against
  about 5 ms for the same call afterwards: the JWKS read plus first use of the code.
- A garbage token, a token without `aud`, or an opaque token → `401` with
  `WWW-Authenticate: Bearer error="invalid_token", …, resource_metadata="…"`.

### Q3. MCP

**SDK v2 serves all three protocol versions from one stateless handler. `mcp-handler` adds
nothing; do not use it.**

- `createMcpHandler(factory, { legacy: "stateless" })` (`@modelcontextprotocol/server` 2.2.0): a
  fresh server per request. 2026-07-28 traffic (`server/discover`, per-request `_meta`) is served
  natively and answered as JSON; 2025-era traffic (`initialize`) goes through the SDK's stateless
  fallback and is answered as SSE (`text/event-stream`), never with an `Mcp-Session-Id`.
- Measured on the preview: `initialize` with 2025-06-18 → server answers 2025-06-18; with
  2025-11-25 → 2025-11-25; the official v2 client pinned to 2026-07-28 → `server/discover`,
  negotiated 2026-07-28; the v2 client in `auto` mode picks 2026-07-28. `tools/list`, `ping` and
  `note` work on all three.
- The SDK's legacy list also accepts 2025-03-26, 2024-11-05 and 2024-10-07. To serve exactly the
  architecture's three, pass `supportedProtocolVersions` to `McpServer`.
- `mcp-handler` 2.2.0 is a 13 KB wrapper that calls the same `createMcpHandler` with
  `legacy: "stateless"`, plus bearer-auth and protected-resource helpers we get from Better Auth;
  it pulls a CLI (`commander`, `chalk`) and peers on Next.js (optional). With Hono the SDK's
  handler is already a `fetch` function.
- Claude's connector documentation says Claude follows the 2025-03-26, 2025-06-18 and 2025-11-25
  authorization specifications.
- **Per client** (`spike_request_log.protocol_header` / `protocol_body`):

| Client | Protocol version used | `clientInfo` name / version |
|---|---|---|
| Claude (computer and phone, through claude.ai) | **2026-07-28** (`server/discover`, then `tools/list` and `tools/call`; JSON responses). Its first, unauthenticated `initialize` offers 2025-11-25 | `Anthropic/ClaudeAI` 1.0.0 in chats; `Anthropic/Toolbox` 1.0.0 when loading tools |
| Codex (OpenAI's coding app; tried by the Founder, not in the plan) | **2025-06-18** (`initialize`, through the SDK's stateless fallback; SSE responses) | `codex-mcp-client` 0.159.0-alpha.12.1 |
| ChatGPT (computer and phone) | Not tested: ChatGPT's free plan allows no custom connector, and the Founder parked ChatGPT (§5) | — |

### Q4. Latency (N1: p95 under 1.5 s)

Server-side time is measured in the function, from the request arriving to the last byte of the
response; client-observed time adds the network between the client and Singapore.

| Run | Calls | Server-side | Client-observed |
|---|---|---|---|
| Scripted, warm (GitHub runner and this session, US East → `sin1`) | 42 tool calls | p50 13 ms, p95 15–18 ms, max 41 ms; database query 6–13 ms, JWT check < 2 ms | 255–290 ms (one 453 ms); the trans-Pacific round trip is almost all of it |
| Scripted, after 7 idle minutes (`latency.ts`, from this session) | 10 calls, 00:09–01:12 UTC | p50 1.0 s, **p95 1.37 s**, max 1.37 s | p50 2.2 s, **p95 2.65 s** |
| Claude, warm (10 pings, 21:36:21–21:36:48 UTC) | 10 tool calls | 11–14 ms each | Not measured: Claude calls from Anthropic's cloud |
| Claude, after idle (new instance, 21:44 and 22:11 UTC) | 2 tool calls | The first request on the new instance, Claude's `server/discover`, took **904 ms** and **1,044 ms**; the `ping` that followed took 26 and 43 ms | Not measured |
| Claude, all tool calls in the run | 19 | p50 13 ms, p95 32 ms, max 43 ms | |
| ChatGPT | Not tested (parked) | | |

What the idle calls show (server-side rows in `spike_request_log`):

- After 7 idle minutes Vercel had dropped the instance in 8 of 10 calls: each landed on a new one.
  On a new instance almost all the server time (0.79–1.28 s) is the **first token check**: our
  JWKS read goes through Better Auth's handler, which initialises Better Auth and opens the first
  database connection while Neon wakes. The tool's own query then takes 20–32 ms.
- In 1 call the instance survived: 683 ms server-side, of which 608 ms was opening a database
  connection to the waking Neon compute. (1 call found both warm: 88 ms; something else had woken
  them.)
- Client-observed minus server-side is about 0.26 s warm, 0.53 s with a surviving instance and
  about 1.2 s with a new one: the function's own cold start (a 3.9 MB bundle loading) and a new TLS
  connection, which the server-side timer cannot see.
- **Against N1:** warm calls are far inside 1.5 s. After idle, the server-side p95 (1.37 s) is just
  inside and the client-observed p95 from the US East coast (2.65 s) is outside. The architecture's
  estimate (0.7–1.5 s after 5 idle minutes, §5.1) is optimistic for a new instance. Two levers
  stay within the architecture: give the function the public JWKS (from configuration, so the
  token check never touches Better Auth or the database), which leaves Neon's wake (≈ 0.6 s) and
  the cold start; and risk 1's trigger (Neon Launch with scale-to-zero off). The real clients'
  numbers decide whether either is needed before launch.

### Q5. Vercel Hobby

- **Region `sin1` is honoured.** The function reports `VERCEL_REGION=sin1` and every response's
  `x-vercel-id` reads `‹edge›::sin1::…` (`iad1`, `cle1` edges from US callers). Builds run in
  `iad1`; that does not matter.
- **Cron entries (deploy results):** the six daily entries of §9.3 deploy. An hourly entry is
  rejected: _"Hobby accounts are limited to daily cron jobs. This cron expression (0 * * * *)
  would run more than once per day."_ 101 entries are rejected: _"You cannot create more than 100
  Cron Jobs per project."_ 100 daily entries deploy.
- **Start within the hour: not observable here.** Vercel calls crons only on the production
  deployment, and the spike is a preview. Vercel's documentation (Usage & Pricing for Cron Jobs,
  2026-07-15) states Hobby timing as "per-hour (±59 min)". The GitHub Actions fallback (§9.3) stays
  ready; first-hand timing needs the production deployment (P1-T18).
- **Limits** (Vercel's own documentation, which this environment can now reach, so the
  architecture's "never verified" note is out of date): function duration 300 s default and
  maximum; request and response body 4.5 MB; 1,000,000 invocations, 4 active-CPU hours and
  360 GB-hours of memory a month; 100 deployments a day; **runtime logs kept 1 hour**; Hobby is
  non-commercial. None blocks the plan. The 1-hour log retention is why the spike writes its
  evidence to the database.
- The project's Node setting (24.x) is overridden by `engines` (22.x), with a warning on each build.

### Q6. Neon

**Confirmed, from SQL in the workflow log (run 1 and run 3, `q6.ts`): all checks pass.**

| Check | Result |
|---|---|
| `netnet_app` made by SQL: `rolbypassrls` | `false` |
| `netnet_app` member of `neon_superuser` | no (`pg_has_role` → false; no `pg_auth_members` row) |
| `netnet_owner` (console-made) | `rolbypassrls = true` on the role itself, member of `neon_superuser`, `CREATEROLE`, `CREATEDB` |
| Pooled connection as `netnet_app` | works (PgBouncer, transaction mode, `…-pooler…` host) |
| `set_config('app.user_id', …, true)` | holds for the whole transaction (read twice, 50 ms apart); after `COMMIT` reads `''` |
| RLS through the pooler | user A sees 1 own row; user B sees 0; no user set sees 0; B writing A's row → "new row violates row-level security policy" |
| Leak hunt | 200 concurrent transactions on 8 client connections: 0 saw another's value inside, 0 saw any value outside a transaction |
| Contrast: `set_config(…, false)` | **40 of 40** later reads through the pool saw it: the session form leaks across pooled clients, which is why `withUser` must use `true` |

Other facts from the same run:

- **The `netnet-preview` project runs Postgres 18** (`PostgreSQL 18.6 … aarch64`), not 17 as F7,
  the architecture and CI's `postgres:17` service assumed. Settled: both projects run 18.6, and CI
  moved to `postgres:18`.
- Region `aws-ap-southeast-1`; default compute 0.25–2 CU, suspend after the plan default (5 min on
  Free).
- Making a role with `CREATEROLE` gives the maker membership of it (PostgreSQL 16+):
  `netnet_owner` is listed as a member of `netnet_app`. Harmless, but P1-T4's grants test should
  expect it.
- `ALTER ROLE … NOSUPERUSER` fails for a non-superuser even as a no-op, so the bootstrap's rerun
  path must leave `SUPERUSER` out.
- `pg` warns that `sslmode=require` is treated as `verify-full`; Neon's certificates pass.
- From GitHub's US runners a TCP handshake to Neon in Singapore sometimes takes longer than
  Node's default 250 ms per address (happy-eyeballs), and the connect fails with `ETIMEDOUT` /
  `ENETUNREACH` (one report run failed this way). Scripts run from Actions (migrations, the
  backup) should call `net.setDefaultAutoSelectFamilyAttemptTimeout(2000)` or equivalent.

### Q7. Clients

| Client | Name it registers and shows | Client id or redirect host (`matchHosts`) | Approval page: "How it identified itself" | Plan used; gating vs PRD §9 Q1 |
|---|---|---|---|---|
| Claude (computer, desktop app) | Claude | CIMD, `https://claude.ai/oauth/mcp-oauth-client-metadata`; returns to `claude.ai` | Client ID Metadata Document | Pro; custom connectors on every Claude plan |
| Claude (phone) | The same connector, synced from the account: no new authorization (both came from the Mac's browser). Its calls arrive from Anthropic's cloud as `Anthropic/ClaudeAI`, like the computer's | as above | as above | as above |
| Codex (OpenAI; not in the plan) | Codex | CIMD, `https://chatgpt.com/oauth/codex/client.json`; returns to a loopback address (`127.0.0.1`, `localhost`); also asks for `openid profile email` | Client ID Metadata Document | The Founder's ChatGPT account. The connection was added and listed the tools, but Codex could not call them from a chat |
| ChatGPT (computer and phone) | Not tested | | | The free plan allows no custom connector (the Founder's account). Parked until NetNet is live and listed in OpenAI's directory (§5) |

Known before the run: Claude's hosted apps redirect to `https://claude.ai/api/mcp/auth_callback`
and Claude Code's CIMD document is `https://claude.ai/oauth/claude-code-client-metadata`, so
`claude.ai` is the Claude host. Claude's Help Center (updated 2026-10-01) says custom connectors
work on Free, Pro, Max, Team and Enterprise, with Free limited to one; that matches PRD §9 Q1.
Claude connects from Anthropic's cloud on every surface, including mobile. Claude sent
`prompt=consent`, so the approval page showed on both authorizations. No client registered by DCR
in the Founder's run (the second Claude connector also used CIMD), so DCR stands on the scripted
client alone. ChatGPT: not tested, parked.

## 4. Reading the evidence after the Founder's run

- **Workflow report:** dispatch workflow **Spike P1-T2** (id `372505622`, file `spike.yml`) on ref
  `spike/p1-oauth-mcp` with inputs `action: report` and `report_since` = the Founder's start time
  (UTC), through the API (`gh workflow run spike.yml --ref spike/p1-oauth-mcp -f action=report
  -f report_since=…` or the GitHub tools); the workflow is not on `main`, so GitHub's web page may
  not offer a Run button. A push to the branch that touches anything outside `docs/` redeploys
  (put `[skip ci]` in the message to avoid it). The tables land in the run's summary: clients that authorized (client id, registered name, CIMD or DCR, redirect host, scopes,
  `resource`, PKCE, user agent), registrations, token calls (refresh issued, rotation), approval
  page views, discovery URLs tried, protocol versions and `clientInfo` per client, and per-call
  latency with JWT, database and instance detail.
- **In a browser:** sign in at `/spike/sign-in`, then `/spike/log` (JSON; `?kind=mcp`,
  `?kind=oauth`, `?limit=`).
- **Clean up after:** run the workflow with action `cleanup`. It deletes the spike's Vercel
  deployments (including the cron-probe ones), the alias, and the Neon branch.

## 5. Verdict

**The architecture holds.** Claude, on the computer and the phone, connected by CIMD, was
approved on our page and called both tools over protocol 2026-07-28. OpenAI's Codex connected the
same way (CIMD, 2025-06-18) and listed the tools, but could not call them from a chat. Better Auth 1.7.7 covers §7.6 without a fallback
library; JWTs verify without a database lookup; the stateless MCP SDK serves three protocol
versions; `sin1`, Hobby's cron limits and Neon's roles and pooler behave as planned.

**ChatGPT was not tested.** Its free plan allows no custom connector. The Founder parked ChatGPT:
it is tested and offered once NetNet is live and listed in OpenAI's directory.

Deviations, and how the Founder settled them (recorded in `docs/decisions.md`):

1. OAuth endpoints at `/api/auth/oauth2/*` and `/api/auth/jwks`, not `/oauth2/*` (§7.1).
   Settled: NetNet uses the library's paths, and architecture §7.1 lists them.
2. Remembered consent skips the approval page on reconnect, so no security email (§7.6, J5).
   Claude sends `prompt=consent` and so always saw the page; a client that does not would skip it.
   Settled: remembered consent is off, so every new connection shows the approval page and sends
   the security email.
3. `netnet-preview` is Postgres 18, not 17. Settled: both Neon projects run 18.6, and CI moved to 18.
4. Hobby cron timing within the hour cannot be confirmed until production exists (§9.3, risk 15).
   Settled: P1-T18 checks it on the production deployment.
5. After 5+ idle minutes the first request on a new instance takes about 0.9–1.4 s server-side
   (with Claude: its `server/discover`, 0.9–1.0 s; the tool call after it, under 50 ms) and
   2.1–2.7 s seen from the US by the scripted client, above §5.1's estimate (Q4). Settled:
   accepted for P1; `latency_ms` and P1-T18's probe measure it in production.
6. Better Auth's authorize answers a browser with JSON (`{"redirect": true, "url": …}`), which the
   browser shows as text; the Founder's first Claude run stopped there. The spike now answers every
   such GET with a 302, keeping its cookies (the browser's `Sec-Fetch-Mode` does not reach the
   function, so a navigation cannot be told apart). P1-T13 must do the same, and its E2E test must
   drive the flow in a browser, not a scripted client. Settled: in P1-T13's brief.
