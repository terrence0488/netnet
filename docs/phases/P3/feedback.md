# P3 Feedback

Source: the Founder, after a hands-on check of the first Stage 6 run's issue 1 on production,
2026-10-22, together with that run's issues; then the Founder, in chat after reading the re-test's
report (`docs/phases/P3/test-report.md`), 2026-10-24. Triaged by `stage: triage P3`.

## Governing rule (Founder)

Undo is removed. Every change moves forward: a person who makes a mistake corrects it with
another change, on the web or through their agent. Undo added too many edge cases and too much
complexity for what it is worth.

## Founder items

| # | Item | Type | Route |
|---|---|---|---|
| 1 | Remove undo everywhere: undo of an entry and of an agent turn, on the web (Activity's Undo, `POST /api/activity/…/undo`) and through the agent (the MCP `undo` tool) | Requirement gap | PRD J7, N3, M5, §3.5, §4.1 and §5 rewritten. Architecture §2, §6.3, §6.8, §7.2–7.5, §7.7 and §12 rewritten, for re-approval. Built by **P3-T11** |
| 2 | Activity stays as a read-only log: what changed, old → new, who or which agent, and when | Requirement gap, confirmed | PRD J7: the log is a record only, and one agent turn still reads as one group (batches stay for reading). **P3-T11** |
| 3 | A currency change writes one Activity row per value, each reading "$X → $X"; decide whether it shows as one entry | Bug | One entry: the change itself, with the number of values re-derived (architecture §6.6, §6.8). **P3-T12** |
| 4 | Issue 5 falls away: `value_undone` goes with undo, and M5 measures corrections only | Requirement gap | M5 reads `value_corrected`, which also fires when a value is deleted (PRD M5, J7, §3.5; architecture §7.7). **P3-T11** |

## Stage 6 issues, first run

`main` at `520c504`. Numbers are that run's report, which P3-T11 … P3-T18 cite
(`git show e069f4a:docs/phases/P3/test-report.md`).

| # | Issue | Type | Route |
|---|---|---|---|
| 1 | High: the default-currency change is not one undoable change, and undoing it corrupts totals | Bug | The undo half goes with Founder item 1 (**P3-T11**); the rest is Founder item 3 (**P3-T12**) |
| 2 | Medium: reminders depend on Vercel Cron, which never fired production crons | Design issue | Every scheduled job runs on GitHub Actions and `vercel.json` carries no crons (architecture §9.3, §12 risk 15, decisions.md), for re-approval. **P3-T15**, on production before ~2026-11-14 |
| 3 | Medium: account deletion re-creates a profile and a reminder row | Bug | **P3-T13** |
| 4 | Medium (security): the probe's refresh token is printed in workflow logs | Bug | **P3-T14**, first. Then the Founder rotates the token and deletes the old run logs (steps in the brief) |
| 5 | Medium: `value_undone` cannot measure M5 | Requirement gap | Falls away with Founder items 1 and 4 (**P3-T11**) |
| 6 | Medium: a person's own exchange rate is lost on a currency round trip | Design issue | The value keeps a given rate as given (`given_rate_*`, architecture §6.3, §6.6), for re-approval. **P3-T12** |
| 7 | Low: GitHub Actions stopped when the budget ran out | Operations | Resolved: the budget is raised. Before launch, a green CI run and a working backup are confirmed (plan §P4, Operations) |
| 8 | Low: the production dependency audit is red | Bug | Done: #92 overrides Vite and esbuild |
| 9 | Low: E2E never renders Home in a browser that can receive push; card and stale-note order | Bug | P2's rule and J12 both hold with Position → stale note → push card (decisions.md, Design). **P3-T17** |
| 10 | Low: an intermittent 500 on `GET /api/me` | Bug | Make unexpected errors diagnosable (architecture §10), then catch and fix it. **P3-T18** |
| 11 | Low: Insights shows the first period's opening value as its change | Bug | The first period has no change (architecture §7.4, decisions.md). **P3-T16** |
| 12 | Low: E2E flake, `taxonomy.spec.ts:215` | Bug | Root-caused in **P3-T17** |
| 13 | Info: push endpoints accept any `https:` host | Scope change | P4's security review (plan §P4) |
| 14 | Info: the export revokes its blob URL right after `click()` | Bug | **P3-T13**; the Founder's manual check 9 still tries it on an iPhone |

## Stage 6 issues, re-test

`main` at `2f2293a`, verdict pass. Numbers are the current `test-report.md`'s. The Founder routes
issues 1–3 to P3 as small tasks and did not raise issue 4.

| # | Issue | Type | Route |
|---|---|---|---|
| 1 | Low: Activity names types by their internal keys (`car_loan`, `listed`), and value entries read their date as `YYYY-MM-DD` | Bug | Types read by their label in the current pack, dates as the screen's others. **P3-T19** |
| 2 | Low: Insights' average pairs a falling amount with a rising percent | Bug | The percent is the mean change as a share of the opening total, so it always has the amount's sign (decisions.md). The ranged average also counts its oldest period, the gap P3-T16's report noted. **P3-T20** |
| 3 | Low: every sign-out logs an after-response failure with no cause | Bug | Every failure log carries its error's class (architecture §10; P3-T18's open issue), then the cause is fixed. **P3-T21** |
| 4 | Info: a country move that adds no type leaves no Activity entry | None: meets the criterion | None. The criterion asks for no entry |
| — | Open: no Reminders `schedule` run had started by 12:31 UTC | Operations | Not blocking (Founder). A later session reads the first starts from Actions into `ops/probe.md` (P3-T10's production criterion) |
