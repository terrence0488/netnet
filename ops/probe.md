# The MCP probe

Every 6 hours (hourly after Neon Launch), `probe.yml` walks the whole MCP path on
production — refresh, `tools/list`, `get_financial_context` — on the probe account's one
long-lived connection, and writes the rotated refresh token back to the
`PROBE_REFRESH_TOKEN` secret. Each call logs its client-observed time next to the function's
`Server-Timing`: the production measure of the first call after idle (architecture §10, spike
Q4). It never registers or authorizes, so it never creates a connection per run — each would
send a security email and spend Resend's 100 a day.

## One-time setup (F15)

Do this once, after the first production deploy. Everything the probe account holds is
fictional; type nothing real into it.

1. **The account.** In a browser, sign up at `https://‹domain›/app` with a dedicated address
   (for example `your-address+netnet-probe@…`), and verify it through the email.
2. **Its ledger.** In the app, choose the country, then add one holding with one value,
   both plainly fictional (for example a type and holding named `Probe …`). The probe reads
   this back every run; it must stay non-empty and fictional.
3. **The client.** Register the probe as a DCR client (the redirect never loads — the code is
   copied from the address bar in step 5):
   ```sh
   curl -s -X POST https://‹domain›/api/auth/oauth2/register \
     -H 'Content-Type: application/json' \
     -d '{"client_name":"NetNet probe","redirect_uris":["http://127.0.0.1/callback"],
          "grant_types":["authorization_code","refresh_token"],"response_types":["code"],
          "token_endpoint_auth_method":"none"}'
   ```
   Keep the `client_id`: it becomes the `PROBE_CLIENT_ID` secret.
4. **A PKCE pair.** In node:
   ```sh
   node -e 'const {randomBytes,createHash}=require("node:crypto");
   const v=randomBytes(32).toString("base64url");
   console.log("verifier="+v+"\nchallenge="+createHash("sha256").update(v).digest("base64url"))'
   ```
5. **Approve.** Still signed in as the probe account, open this URL (one line, with the
   `client_id` and challenge from above):
   ```
   https://‹domain›/api/auth/oauth2/authorize?response_type=code&client_id=…&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&scope=ledger.read%20ledger.write%20offline_access&state=probe1&code_challenge=…&code_challenge_method=S256&resource=https%3A%2F%2F‹domain›%2Fmcp
   ```
   Read the approval page, press Allow — the expected security email arrives at the probe
   address — and copy the `code` from the loopback address the browser fails to load.
6. **The tokens.** Exchange the code (with the verifier, within 10 minutes):
   ```sh
   curl -s -X POST https://‹domain›/api/auth/oauth2/token \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     --data-urlencode grant_type=authorization_code --data-urlencode code=… \
     --data-urlencode redirect_uri=http://127.0.0.1/callback \
     --data-urlencode client_id=… --data-urlencode code_verifier=… \
     --data-urlencode resource=https://‹domain›/mcp
   ```
   The `refresh_token` becomes the `PROBE_REFRESH_TOKEN` secret, in the `production`
   environment next to `PROBE_CLIENT_ID`.
7. **The writer.** Make a fine-grained personal access token with the Secrets permission
   (read and write) on this repository only, and store it as the repository secret
   `PROBE_SECRETS_TOKEN`. The probe and deploy workflows use it to write the rotated token
   back. It expires after at most a year: renew it before then, or the next rotation fails.
8. **Prove it.** Dispatch the MCP probe workflow by hand. It passes, and the run stores a
   fresh `PROBE_REFRESH_TOKEN`.

## Running it by hand

```sh
pnpm probe --origin https://‹domain›   # with PROBE_CLIENT_ID and PROBE_REFRESH_TOKEN set
```

A local run rotates the server-side token too: store the printed token as the secret at once
(the old one dies after its short reuse window), or the next run is refused.

## When it fails

- A red run still stores its rotated token (the script emits it right after refresh), so the
  next run is unaffected. A failure is production failing, not the probe: investigate first.
- `invalid_grant` means the family is dead (the connection was revoked, or a token was stored
  out of order): repeat steps 3–6, which makes a new connection and a new security email. The
  old connection can be revoked in the app.
- Never run two probes at once: the workflows serialise themselves (the `probe-refresh-token`
  group, shared with the deploy's smoke tests), so do not dispatch one by hand while another
  runs.

## Pass log

The brief asks for two green runs in a row, rotating the token. (Blocked: F12, F15.)

| # | Run (UTC) | Result | Token rotated |
|---|---|---|---|
| 1 | — | — | — |
| 2 | — | — | — |

## Cron timing log

Vercel runs crons only on production, and Hobby starts each "within its hour" (spike Q5).
After production exists, read each cron's first start in the dashboard (the project → Cron
Jobs → the run's start time) and record it here. If any starts outside its hour, the reminder
runs move to GitHub Actions schedules calling the same handler with `CRON_SECRET` (architecture
§9.3), and the fallback is recorded in `docs/decisions.md`.

| Cron (`vercel.json`) | Scheduled (UTC) | First start observed (UTC) | Within its hour? |
|---|---|---|---|
| `GET /api/cron/daily` | daily 01:00 | — | — |
| `GET /api/cron/fx` | daily 17:00 | — | — |
