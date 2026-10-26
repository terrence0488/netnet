# Launch readiness

P4-T14's checklist, with what is proven, what is still open and what only the Founder can do.
Production stays unannounced (`noindex`) until Stage 8; this file never marks a stage or phase
approved.

Status: **in-progress** — T14's boxes are not all met, and since 2026-10-26 00:50 UTC **no GitHub
Actions job can start at all** (billing, N2): CI, the deploy and every schedule fail before their
first step. Last checked: 2026-10-26 (UTC 01:10), on `main` at `b396356`.

## Checklist

| # | Criterion | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | Sweep: landing, `/privacy`, `/terms` at 390 and 1280 px, no horizontal scroll at 320 px, axe clean; full E2E suite green | not run | T14's sweep |
| 2 | The deploy waits for `main`'s green `Checks`, proven by a workflow test and one real run | not built | `deploy.yml` today has no green-main check (its header comment says so on purpose). T14 rewrites it and `docs/decisions.md`'s delivery row |
| 3a | Landing live with `noindex` | pass | `curl https://netnetapp.io/` → 200, `<meta name="robots" content="noindex" />` (2026-10-25 22:49 UTC) |
| 3b | `/privacy` and `/terms` live | pass | both answer 200 on production after the 2026-10-26 deploy (`6c95647`) |
| 3c | `landing_view` rows with a cookie-less `visitor`, read through `pnpm metrics` | not checked | needs `DATABASE_METRICS_URL` (a repository secret); T14 reads it after the deploy |
| 3d | The metrics workflow's summary per segment | not checked | dispatched by hand; T14 records one run |
| 3e | The health check's scheduled run green and one test alert in the Founder's inbox | test alert sent; the SLO reading is explained; the schedule needs billing and a Founder decision | `test_alert` dispatch 40246450413 returned `opsEmailConfigured: true` (F25 set) and fired a real `slo_success`: 86 calls, 83 ok, 96.5% against ≥ 99.5%, p95 176 ms. **Attributed** on 2026-10-26 by dispatch 40251193056: all three non-ok events are one account, `usr_01M5QMPG1S63Y8FQ4NHJWD3RHE`, `create_holding`, client `claude`, `LIKELY_DUPLICATE` ×2 and `VALIDATION_FAILED` ×1, at 19:13:16–19Z on 2026-10-24, 14–24 ms, **not** covered by `METRICS_EXCLUDE_USERS` (1 id). Nothing in the metric, the target or the trigger was changed. Open: N1 (Founder decision) and N2 (billing) — the 01:00 schedule has produced no run since the block. The Founder must also confirm the inbox |
| 3f | The FX staleness trigger proven with a fixed clock | pass (tests) | P4-T4's `fx_stale` tests cover ECB > 4 days and fallback > 2; production's latest dates were ECB `2026-10-23` and fallback `2026-10-25`, neither stale |
| 4 | All ten packs live with review records | blocked | F20: `content/reviews.json` is `{}`; the seven new packs are still in `content/packs/drafts/` (AU, HK, ID, IN, PH, TH, VN). SG, MY and GB are live |
| 5 | Guides current, P2-T8 done, listing materials complete | listings ready; guides blocked on F11 | P4-T7 merged (#141): `ops/launch/listings.md`, `ops/launch/server.json`, `pnpm listing:tools` and three listing screenshots from the demo household are in. Of F11's six Claude screenshots only the three **computer** images are real; the three phone images are 70-byte 1×1 stand-ins (commit `fbe2f1b`). Claude's computer step 2 now names **Continue**; the phone steps are unverified, so P2-T8 stays open |
| 6 | The launch note ready to paste, checked by the Founder | note ready, check open | `ops/launch-note.md` (P4-T10); the Founder's paste check is a Founder step |
| 7 | One M12 run reported, its spend recorded, the blind sheet scored, result stated against the 80% line | blocked | F22: no `ANTHROPIC_API_KEY` repository secret and no spend cap approved in writing. `ops/m12/README.md` documents `--dry-run` as the only path until then |
| 8 | The security review's Critical, High and Medium fixes merged and deployed | review done; fixes in review | P4-T13's report is merged (#143, `e69de27`): no Critical, 1 High (Sentry keeps SQL and bound parameters), 2 Medium (unbounded CIMD resolution; a CIMD name shown as verified without its host), 4 Low, 8 Info. The fixes are P4-T16–T20, dispatched 2026-10-26 in five isolated worktrees; none can be merged while no CI job can start (N2) |

## Founder steps (only the Founder can do these)

| Step | Why it is theirs | Recorded at |
|---|---|---|
| **N2: raise the GitHub Actions spending limit / settle the failed payment** | account settings and money | **new, 2026-10-26** — every job fails before its first step; blocks all merging, the deploy and every schedule |
| **N1(a): decide whether `LIKELY_DUPLICATE` and `VALIDATION_FAILED` count against N1** | it redefines a PRD metric | 2026-10-26, attributed by dispatch 40251193056 |
| **N1(b)/F24: say whether `usr_01M5QMPG1S63Y8FQ4NHJWD3RHE` is a test account to exclude** | only the Founder knows which accounts are theirs | 2026-10-26; the `--user` lookup is in PR #146 |
| F20: engage one reviewer per market and send each P4-T6's review sheet | finding people who know the market | T6, blocked; packs above |
| F22: add the Anthropic API key with a monthly cap and approve each M12 run's spend | spend approval | T9 and T14, blocked |
| F23: have the privacy policy and terms reviewed by someone qualified | legal judgement | T8 and T14; submission follows this |
| F25: Vercel Production `OPS_EMAIL` | an address only the Founder knows | **set** — verified 2026-10-26 by dispatch 40246450413 (`opsEmailConfigured: true`); the Founder confirms the inbox |
| F11: take the three real Claude phone screenshots (Settings → Connectors, Add custom connector, Connect/Allow), cropped with personal details removed | only the Founder can sign in to Claude | T7 and P2-T8 |
| Restore drill: restore the latest backup into a scratch Postgres or Neon branch with the offline key, compare row counts with production, then delete it | only the Founder holds the key (F14) | T14 |
| GitHub → Settings → Billing: Actions minutes used this month against the plan's allowance, with room for CI; note the spending limit | account settings | T14 |
| `pnpm smoke --origin https://netnetapp.io` from the Founder's computer | a second network and a real browser | T14 |
| Read the blind sheet and score it; paste-check the launch note | judgement on the product's own claims | T9, T10, T14 |

## Evidence

- Wave 3 merged on `main`: P4-T7 (#141, `f07ac04`) and P4-T4 (#142, `6c95647`), each on a
  rebased branch with a green `Checks` job (T7 run 40243763651; T4 run 40244942259 — Checks,
  Quick checks, Integration and E2E all pass).
- Production deployed from `6c95647` by `deploy.yml` run 40246336691 (migrate, content publish,
  Vercel prod, `Confirm production moved`, smoke): success. `/`, `/privacy`, `/terms` 200; `/`
  `noindex`; `POST /api/cron/health` without a secret 401; `/mcp` 401.
- Health `test_alert` dispatch 40246450413: `opsEmailConfigured: true`; trigger `slo_success`
  (calls 86, successRate 96.5, p95Ms 176); Neon 12.04 CU-hours and 0.0366 GB; emails 0; unsent
  security emails 0; FX ECB 2026-10-23, fallback 2026-10-25.
- `main` at `21c731d`: CI run [40241860326](https://github.com/terrence0488/netnet/actions/runs/40241860326)
  — `Checks` success (2026-10-25 22:52 UTC).
- Production, 2026-10-26 (UTC 2026-10-25 23:57): `/` 200 with `noindex`; `/privacy` 200;
  `/terms` 200; `/api/health` 200 `{"ok":true}`; `/mcp` 401 (OAuth challenge).
- Reminders schedule, three slots: 01:00 → first start 2026-10-25 05:38 (40166274654);
  09:00 → 2026-10-24 13:03 (40096486979); 17:00 → 2026-10-24 19:15 (40124433194); all success.
  `ops/probe.md`'s schedule log carries the starts.
- `content/reviews.json` is `{}`; `content/packs/` holds generic, SG, MY, GB; the other seven are
  drafts.
- `content/images/connect/`: `claude-computer-1..3.png` ~190–245 KB; `claude-phone-1..3.png` 70 B
  each (1×1 PNG).
- GitHub secrets today include F24's three and `NEON_API_KEY`; no `ANTHROPIC_API_KEY`.
- N1 attribution, 2026-10-26T00:49Z: workflow dispatch 40251193056 on `b396356` succeeded and
  printed `86 counted, 83 ok, 3 not ok, success 96.5% (all calls before exclusions: 86, 3 not ok)`
  — the same figures as the alert — then the three non-ok rows: one account
  (`usr_01M5QMPG1S63Y8FQ4NHJWD3RHE`), `create_holding`, `claude`, `LIKELY_DUPLICATE`,
  `LIKELY_DUPLICATE`, `VALIDATION_FAILED`, 14–24 ms, `excluded: no` on all three. PR #144 merged
  the read-only tool (`scripts/slo-attribution.ts`, `ops/metrics/n1-slo.sql` untouched).
- Deploy gate, 2026-10-26: PR #145 (`p4-t14`, `e045532`, rebased on `b396356`) adds
  `Wait for main's green Checks` to `deploy.yml` before any write step, with `permissions: checks:
  read` and `test/workflows/deploy.test.ts` (6 tests). Proven locally: the step's shell logic run
  against a stubbed `gh` for green / red / running / missing (green exits 0; the others exit 1 with
  a plain message), the `--jq` filter against real check-run shapes, and the YAML parsed with the
  gate at step 5 of 16. **Not yet proven by a real run** — N2 blocks it.
- Actions billing block: **last job to start 00:49:11Z** (`p4-slo-attribution` PR CI 40251181986);
  **first run to fail whole 00:49:53Z** (40251234324). Every later run's jobs fail with zero steps
  and the billing annotation. Runs affected: 40251234324, 40251774846, 40251809814.
- The security wave's five fix branches are pushed with open PRs, each with its local test result in
  its brief: **#148** T16 Sentry scrub, **#149** T17 CIMD bound, **#150** T18 host and unverified
  name, **#151** T19 first-confirmation races, **#152** T20 OAuth purge. #145 carries the deploy
  gate, #146 the `--user` attribution, and this file's PR the readiness record. None is merged:
  every `Checks` is blocked by N2.

## Findings for triage

- **N1 — Founder decision: does N1 count client-correctable outcomes as service failures?** The
  7-day reading is 96.5% over 86 calls (target ≥ 99.5%; p95 176 ms, well inside 1,500 ms). It is now
  attributed: three non-ok events, all `create_holding`, all from one account
  (`usr_01M5QMPG1S63Y8FQ4NHJWD3RHE`), in 3.3 seconds on 2026-10-24, client `claude`, outcomes
  `LIKELY_DUPLICATE` ×2 (409, the duplicate guard working as designed) and `VALIDATION_FAILED` ×1
  (400, the agent's own payload). No NetNet error class appears among them — no `INTERNAL`, no
  timeout, no 5xx — and every call answered in 14–24 ms. Two things are the Founder's, not the
  build's:
  **(a)** whether `LIKELY_DUPLICATE` and `VALIDATION_FAILED` should count against N1 at all. They
  are client-correctable outcomes an agent can retry past, so counting them makes N1 measure the
  model's manners as much as the service's health (a reading that never drops below 99.5% would
  hide real failures behind a very high volume of them). Recommended: exclude client-correctable
  outcomes from N1's numerator/denominator and keep every `INTERNAL`/timeout/transport failure
  counted — but that **redefines N1** (PRD N1, architecture §10), so it is a stop-and-raise, not a
  metric edit.
  **(b)** whether that account is a Founder test account that belongs in `METRICS_EXCLUDE_USERS`
  (F24 names "your own test accounts" there). Its identity is not recorded anywhere in the repo,
  and the `--user` lookup that would say so (PR #146) cannot run either while N2 blocks Actions.
  Nothing was changed: `ops/metrics/n1-slo.sql`, the 99.5% target and the health trigger's exit 1
  are as built, and T14's scheduled-run box stays open on (a).
- **N2 — Actions billing blocks every job (from 2026-10-26 00:49 UTC; last job to start 00:49:11Z,
  first run to fail whole 00:49:53Z).** Every workflow run
  started after ~00:50 fails before its first step with *"The job was not started because recent
  account payments have failed or your spending limit needs to be increased"*: `p4-t14`'s CI
  (40251809814), `p4-slo-attribution-user`'s CI (40251774846), and even `renovate/pnpm-action-setup-6.x`'s
  push (40251234324), which changes no code. The last green run, `p4-slo-attribution`'s PR CI
  (40251181986), started at 00:49:11. Consequences while it lasts: no PR can earn a green `Checks`,
  so nothing can be merged under the standing rule; `deploy.yml` cannot run, so the new gate cannot
  be proven by a real run; and the four schedules (reminders, FX, daily sweep, health) plus the
  backup stop. Only the Founder can fix it (GitHub → Settings → Billing). It is a hard stop, not a
  flake: it is not a workflow-file problem, and re-running does not help.
- **Preview job on #141 failed in Neon setup** (`db:bootstrap` before deploy) while #142's Preview
  passed; no code change was involved. Re-check the next preview; if it recurs, it is a CI/Neon
  issue for T14.
- **Security review (#143):** merged. The High is `apps/api/src/lib/sentry.ts` keeping Drizzle's
  SQL and bound parameters (the privacy page says never); the Mediums are unbounded
  unauthenticated CIMD resolution and a CIMD client's self-chosen name shown as verified with no
  host. P4-T16–T18 fix those; P4-T19 closes the two `/api/me` first-confirmation races (the CI
  flake is real but rare); P4-T20 adds the 30-day OAuth purge. The Founder must confirm
  `SENTRY_DSN` is set, the production env names are present, and one real agent connection after
  M-2's fix; the review's "Checks the Founder should run by hand" lists the rest.

## Left for Stage 8

- Remove `noindex`, submit the directory listings (after F23), announce, and show the M12 result
  next to the launch note. Nothing here marks P4 approved.
