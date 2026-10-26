# Project State

## Current
Stage: Build (P4)
Phase: P4
Status: in-progress
Next action: **GitHub Actions billing (N2) blocks every job since 2026-10-26 00:50 UTC** — a
Founder step, and nothing merges or deploys until it is cleared. Once it is: land the five security
fixes (P4-T16–T20, five isolated worktrees, one branch/PR each) one at a time on a green `Checks`,
then #145 (deploy gate) and #146 (`--user` attribution), then deploy from a green `main`, then
P4-T14's remaining readiness boxes. The N1 reading is attributed and waits on a Founder decision
(see `ops/launch-readiness.md`).
**Branches:** one branch and one PR per task, from `main` (CONVENTIONS §15); waves 1–3 merged,
the T13 review is a docs-only branch.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md` |
| PRD | **approved** | 2026-10-22 | `docs/01-prd.md` (J7, N3, M5 rewritten at P3 triage: no undo; Founder approved in chat) |
| Prototype | **approved** | 2026-09-27 | `docs/02-prototype/`, design system "Poster" |
| Architecture | **approved** | 2026-10-24 | `docs/03-architecture.md`, `CONVENTIONS.md` (re-approved at P3 triage: no undo, given rates kept, the first period's change, every schedule on GitHub Actions, error class in logs; after wave 9: the schedules' real lateness, §7.10 and §9.3; after P3: each tool result's JSON as its text (§7.4), each holding's currency (§7.5)) |
| Plan | **approved** | 2026-10-25 | `docs/04-plan.md`, `docs/phases/P1/tasks/` … `docs/phases/P4/tasks/` (P3-T11 … P3-T18 added at triage, P3-T22 after P3's approval; P4 approved with its five decisions as recommended: Founder, "Merge it") |
| P1 | **approved** | 2026-10-08 | Test report reviewed; Claude computer shots shipped (#61) |
| P2 | **approved** | 2026-10-12 | Test report + hands-on; Account and date review fixups in (#76) |
| P3 | **approved** | 2026-10-24 | Third test run: pass, one Low and two Info (`docs/phases/P3/test-report.md`); the Reminders 17:00 and 01:00 slots' first starts are now recorded in `ops/probe.md` |
| P4 | in-progress | | Wave 1 merged 2026-10-25 (#121–#125); wave 2 merged 2026-10-26 (T3 #140, T8 #138, T9 #139, T10 #137); wave 3 merged 2026-10-26 (T7 #141, T4 #142); production deployed from `6c95647`; `b396356` (#144) added the SLO attribution tool. Wave 5 (T16–T20) in flight; #145 and #146 open. T2 and T6 stay open (F21, F20); T7's phone half waits on F11 |

## Handoff note (last session)
**Blocker (N2):** every GitHub Actions job started after ~00:50 UTC 2026-10-26 fails before its
first step with the billing annotation ("recent account payments have failed or your spending limit
needs to be increased"). No PR can earn a green `Checks`, so nothing can be merged under the standing
rule; `deploy.yml` cannot run; the reminders, FX, daily and health schedules and the backup stop.
Only the Founder can clear it (Settings → Billing).

**Wave 5 written, not merged:** P4-T16–T20 were dispatched 2026-10-26 as five implementers in
isolated worktrees; the manager finished and pushed each branch with its local test result recorded
in its brief. Open PRs: **#148** T16 (Sentry scrub, 15/15), **#149** T17 (CIMD bound, 30/30),
**#150** T18 (host and unverified name, 76/76), **#151** T19 (first-confirmation races, 15/15 + 12/12),
**#152** T20 (OAuth purge, 21/21). None can be merged while N2 holds: every `Checks` fails before
its first step.

**Merged since wave 3:** #144 (`b396356`, `p4-slo-attribution`) — a read-only, dispatch-only
authentication tool (`pnpm slo:attribute`) that names the non-ok `agent_tool_called` events. It ran
as dispatch 40251193056 and attributed the N1 trigger.

**Open PRs:** #145 (`p4-t14`) the deploy gate — `Wait for main's green Checks` before any write
step, 6 workflow tests, local proof of all four paths; not on `main` by any path; waiting on CI.
#146 (`p4-slo-attribution-user`) adds `--user <usr_…>` so an account can be identified from its own
event names, for the N1(b) question.

**N1 attributed, Founder decision open:** 86 calls / 83 ok / 3 not ok (96.5%, target ≥ 99.5%; p95
176 ms) = one account, `usr_01M5QMPG1S63Y8FQ4NHJWD3RHE`, `create_holding`, client `claude`,
`LIKELY_DUPLICATE` ×2 + `VALIDATION_FAILED` ×1, 3.3 s, 14–24 ms, not in `METRICS_EXCLUDE_USERS`.
No `INTERNAL` or transport failure among them. `n1-slo.sql`, the target and the trigger's exit 1
were **not** changed. Founder must decide (a) whether client-correctable outcomes count against
N1 and (b) whether that account is a test account for F24. T14's scheduled-run box stays open.

**Unchanged:** T4 done; T7 half delivered (F11 phone shots still 70-byte stand-ins); T2 waits on
F21; T6 blocked on F20 (`content/reviews.json` is `{}`); F20/F22/F23 open; no M12 spend approved;
Renovate #128–#131, #134, #135 untouched; `test-results/` gitignored; a local `pnpm lint` may flag
`.codewhale/state` while CI is clean.
