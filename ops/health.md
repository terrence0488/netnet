# The daily health check

Once a day NetNet reads every free-tier limit that can stop or slow it, the N1 SLO, the email
allowance, unsent security emails and the FX dates, and emails the Founder when any upgrade trigger
fires — or when a figure cannot be read. **Silence means everything is fine.** Architecture §9.3
schedules it, §9.4 lists the triggers and their actions, and §10 adds the N1 SLO, the security email
and the FX fetch.

- **Workflow:** `.github/workflows/cron-health.yml`, daily at **01:00 UTC** (in the reminder run's
  database wake), and by hand with `workflow_dispatch`.
- **Handler:** `POST /api/cron/health`, guarded by `CRON_SECRET`.
- **Email:** one `ops.health_alert` per run at most, to **`OPS_EMAIL`**. It carries counts, sizes,
  percentages and dates only: no user id, address, name or amount.
- **Reader:** `pnpm health --env production` (`scripts/health.ts`) gathers the figures the function
  cannot read and posts them; the function adds the rest.

## What is read, and by whom

| Figure | Read by | Source |
|---|---|---|
| Neon compute (the billing period's CU-hours) and storage | the workflow, with `NEON_API_KEY` | Neon's API, `GET /projects/{id}`: `compute_time_seconds` / 3600. `synthetic_storage_size` is deprecated and reports 0, so the default branch's `logical_size` is used when it is 0: a lower bound on synthetic storage, which fires no later than the real 0.5 GB limit |
| N1 SLO: 7-day calls, success rate, p95 | the workflow, as `netnet_metrics` | `ops/metrics/n1-slo.sql` with `DATABASE_METRICS_URL`; `METRICS_EXCLUDE_USERS` omits the probe account |
| Emails Resend accepted: yesterday, today, this month | the function | `core.rate_limit`'s `email:sent:YYYY-MM-DD` windows |
| Whether the reminder's 60-a-day email cap was reached yesterday | the function | the reminder run's own count |
| Security emails unsent for more than 24 hours | the function | `core.agent_connection.security_email_sent_at` |
| The latest rate each FX source has | the function | `core.fx_rate` |
| Vercel Hobby usage | **a person** | Vercel's public API documents no Hobby usage endpoint, and the workflow holds no `VERCEL_TOKEN`; **check the dashboard weekly**, and whenever Vercel emails about a limit |

## The triggers

| Id | Fires when | What to do |
|---|---|---|
| `neon_compute` | compute ≥ **60** of the month's 100 CU-hours | Move `netnet-prod` to Neon Launch (a plan change) |
| `neon_storage` | storage ≥ **0.35 GB** of 0.5 GB | Neon Launch |
| `slo_latency` | the 7-day p95 is over **1,500 ms** | Neon Launch with scale-to-zero off |
| `slo_success` | the 7-day success rate is under **99.5%**, over at least 50 calls | Check the MCP probe and the failing tool calls (`ops/probe.md`) |
| `emails_day` | **70** or more emails yesterday | Resend's paid plan |
| `emails_month` | **2,100** or more emails this month | Resend's paid plan |
| `reminder_cap` | the reminder's **60-a-day** email cap was reached yesterday | Resend's paid plan; reminders resume at the next day's runs |
| `security_email_unsent` | any security email older than 24 h and younger than 7 days is still unsent | Check Resend and the reminder runs; the security email must go out |
| `fx_stale` | the ECB's latest rate is over **4 days** old, or the fallback's over **2** | Check the FX sources; the previous rate stays in use with its date (§6.6) |
| `vercel_limit` | a Hobby limit is at **70%** or more, when the API reports it | Vercel Pro |

A figure that cannot be read fires its own trigger instead of hiding:

| Id | Means |
|---|---|
| `unreadable_neon` | `NEON_API_KEY`/`NEON_PROD_PROJECT_ID` missing, or Neon answered badly |
| `unreadable_slo` | `DATABASE_METRICS_URL` missing or not `netnet_metrics`, the SQL failed, or 50+ calls came back without a rate |
| `unreadable_vercel` | the caller sent Vercel figures it could not read |
| `unreadable_emails`, `unreadable_reminders`, `unreadable_security`, `unreadable_fx` | the function could not read that figure from `core` |
| `unreadable_ops_email` | **`OPS_EMAIL` is not set**, so the alert has nowhere to go |

## `OPS_EMAIL` (F25)

The alert goes to `OPS_EMAIL`, a Vercel **Production** environment variable (F25). Without it the
check does not crash and does not try to send: it reports `unreadable_ops_email`, the workflow fails
with that trigger printed, and nothing reaches an inbox. Set it before relying on the daily email:

1. Vercel → the project → Settings → Environment Variables → Production → add `OPS_EMAIL` with the
   Founder's address.
2. Redeploy (or wait for the next deployment) so the function sees it.
3. Dispatch the health workflow with `test_alert` on; the test email should arrive.

Vercel's CLI is not the way to read or set this from a session: set it in the dashboard.

## Sending a test alert

- **GitHub Actions:** Actions → **Health check** → Run workflow → set `test_alert` to true. The
  subject is `NetNet health: test`; real triggers, if any, are still listed. The run fails if a
  real trigger fired.
- **Locally:** `pnpm health --env production --test-alert`, with `PUBLIC_ORIGIN`, `CRON_SECRET`,
  `NEON_API_KEY`, `NEON_PROD_PROJECT_ID` and `DATABASE_METRICS_URL` set. It prints the handler's
  response; exit 1 means a trigger fired.

## Reading a run

The step runs `pnpm health --env production` and prints the response:

```json
{ "triggers": ["emails_day"], "figures": { "...": "..." } }
```

Exit **0** means no trigger fired (silence, as intended). Exit **1** means a trigger fired, the
report could not be posted, or `OPS_EMAIL` is unset. Fix the figure or the configuration named in
the email, or take the action in the table. The email counter is kept indefinitely in
`core.rate_limit` (`email:sent:YYYY-MM-DD`), so yesterday's and the month's counts remain readable
long past the 35 days the check needs.

The reader never prints a secret, an address or a person's data: counts, sizes, percentages and
dates only.
