# P1 Test Report

Stage 6, run Oct 8 2026 against `docs/04-plan.md` §3.2. Production as deployed Oct 8
09:17 UTC (product code identical to repo HEAD `2321ca1`; the two later merges are CI
and docs only). Local suites run on a scratch database in the project's Postgres 18
container, content published from this checkout (8 documents, versions at 1).

## Summary

P1 passes. All automated suites are green — unit (1098), integration including the RLS
and isolation suites (562), e2e on phone and computer viewports (170, 4 intentional
skips), typecheck, content validation, production smoke, and six consecutive green MCP
probe runs on production. A live end-to-end pass on production (sign-up → country →
segment → holdings → snapshot, plus the negative paths) behaved per the PRD.

Two acceptance items are not fully met, both already tracked and neither a build
defect: the six connect-flow screenshots are 1×1 placeholders (Founder item F11, still
open), and delivery of the two emails to a real inbox was not observed (no inbox
available to QA; the send paths are covered by tests). One test-hygiene issue and one
local-lint nit are reported for triage. Details below.

A QA account with fictional data was created on production (deletion waits for P3):
`qa-p1-20261008@example.com`, 2 holdings, net worth S$5,328 fictional. Exclude it from
metrics.

## Criteria results

Key: E = e2e suite (170 passed, phone + computer), I = integration suite (562 passed),
U = unit suite (1098 passed, incl. the N10 scan), L = live production probes by QA
this session, P = production probe history (6 green scheduled/manual runs).

### J1 — sign-up and onboarding (P1 scope)

| Criterion (plan §3.2) | Verdict | Evidence |
|---|---|---|
| Sign-up by email + password asks nothing else | Pass | L: `POST /api/auth/sign-up/email` with email + password only → 200, session cookie, `name: ""` |
| Verification email sent, the user carries on | Pass* | L: session usable immediately; holdings created while unverified. E: "verification not waited for". *Delivery to an inbox not observed — Founder check |
| Returning user resumes onboarding or goes to Home | Pass | E: "a returning person resumes onboarding where it was left" |
| One holding with a value → a total equal to it | Pass | E: "Home totals the one holding" |
| First picture with no agent states something not typed | Pass | E: "net worth with what it means: could use, locked with until, and owed" |
| Signup events carry no amounts | Pass | U: event-schema tests forbid amount-like and free-text props |
| Unverified users use the app but cannot connect an agent | Pass | L: unverified account created holdings; `POST /api/agent/attempts` → 403 `EMAIL_NOT_VERIFIED` |
| Segment recorded once and carried by every event | Pass | L: `PATCH /api/me` sets `accumulating`; re-set → 400 "set once". U: `track()` attaches segment to all 21 schemas |

### J2 — track anything (P1 scope)

| Criterion | Verdict | Evidence |
|---|---|---|
| Add an asset or liability with name, type, currency, value, date | Pass | L: asset (USD cash) + liability (SGD loan) created via REST. E: Add specs |
| Liabilities subtract | Pass | L: stored kinds; E: "a liability contributes negatively"; U: core arithmetic |
| Accessibility in one of four states | Pass | L: `accessible` defaulted; E: fact-question, "Not sure", illiquid/locked paths |
| Asked as a fact, never a category | Pass | E: "a fact question, 'Not sure', and asking the agent instead of deciding" |
| No-doubt types set with the pack's reason, overridable | Pass | L: cash → `accessible`, "it's money in the bank", basis `generic` default. E: deciding/changing from the holding |
| Generic pack for unpacked markets | Pass | L: `pack.generic v1` published and served as the default basis; U: N10 scan (no local knowledge in code) |
| Country inferred, confirmed, alphabetical, currency default | Pass | L: `GET /api/geo` → `SG` server-side; `PATCH country SG` → base `SGD`. E: alphabetical list, one-tap confirm |
| Pack types added on confirmation | Pass | L: snapshot after SG confirm includes the `car_loan` pack type |
| Instruments from any country | Pass | L: USD holding under an SG account saved without complaint |
| Consequence shown, changeable from the holding | Pass | E: "the latest value with its consequence" |
| Never blocks saving; asking the agent offered | Pass | E: "asking the agent instead of deciding"; agent prompt carries no financial data |
| "Not sure" → undecided, counted for net worth, never for usable, reported as incompleteness | Pass | E: "undecided is marked"; U: core exclusion + context-completeness tests |
| Foreign currency stores original, conversion, rate + rate date | Pass | L: value row carries `amountMinor` USD, `baseMinor` SGD, `fxRate 1.28`, `fxRateDate`, `fxSource: user` |

### J3 — record values (P1 scope)

| Criterion | Verdict | Evidence |
|---|---|---|
| Dated value, back-dated allowed, latest-by-date drives | Pass | E: back-dated opening + back-dated value specs. L: latest value drives the snapshot |
| Same date: last write wins, with a warning | Pass | L: second write → 200, `SAME_DATE_REPLACED` warning naming the replaced value |
| `value_recorded {source}`; `value_corrected` on agent correction | Pass | I: ledger/event suites; E: client events accepted (200) and recorded |

### J5 — connect the agent (P1 scope, handoff prompts excluded)

| Criterion | Verdict | Evidence |
|---|---|---|
| Steps per client + platform with screenshots and connector URL, no token | Partial | E: platform guide, connector address, "moves on by itself" all pass. Screenshots are 1×1 placeholders (F11, still open) — the neutral placeholder shows instead |
| "Other agent" generic guide | Pass | E: one set of steps, no platform switch, no screenshots |
| Back step by step | Pass | E: "Back to where it began" |
| Connect button's logos (still under reduced motion, SR-clean) | Pass | E: icon turning through logos; U: ConnectButton tests |
| Same flow from the Agent tab and the empty Home | Pass | E: empty Home links to `/app/agent/connect?entry=home`; Agent tab uses `entry=agent`; choice spec asserts Claude + Other only, ChatGPT absent |
| Verify first, with resend, moving on by itself | Pass | L: 403 gate. E: verify-link page states |
| Approval moves NetNet on by itself | Pass | E: full OAuth + approval with the fake agent, real server |
| Active with client name and time | Pass | E: "lists connections with their times"; approval shows the registering name |
| Failures fire `agent_connection_failed`, plain cause + retry | Pass | E: Cancel fails the attempt with its cause; events read from `analytics.event` |
| Revoke rejects later calls | Pass | E: after revoke, refresh → `invalid_grant`; connection gone from the tab |
| Security email on approval | Pass* | I: once per Allow, by email, `security_email_sent {client}` fired, content asserted. *Arrival in a real inbox not observed — Founder check |
| M9 funnel readable | Pass | `signup_started`, `account_created`, `agent_connection_*`, `agent_tool_called {client, entry}` all exist with segment; E records the funnel |

### J6 — the agent maintains the picture (all except undo)

| Criterion | Verdict | Evidence |
|---|---|---|
| MCP does everything the web UI can | Pass | I: mcp + ledger + http suites green. L: REST parity spot-checked |
| Conversational assembly via checklist + fact questions | Pass | I: MCP tests green; pack checklist + questions served from published content (L) |
| Agent writes appear marked, client named on the value | Pass | E: "the agent's mark stays quiet". L: value shape carries `source` + `clientName` |
| Duplicate surfaced so the agent updates | Pass | L: same-name create → 409 `LIKELY_DUPLICATE` with the candidate; nothing created |
| Malformed calls rejected specifically, nothing partial | Pass | L: `VALIDATION_FAILED` with per-field messages. I: ledger atomicity suites |
| `agent_tool_called {tool, kind, outcome, latency_ms}`; writes fire J3 events with `source: agent` | Pass | U: schemas; I: tool-call event tests; P: probe's tool calls recorded every ~6h |

### J8 — grounded advice (all except M12)

| Criterion | Verdict | Evidence |
|---|---|---|
| Reads cover worth, values, breakdowns, history, exposure, accessibility | Pass | I: context/read suites; L: snapshot carries holdings, values, accessibility, pack refs |
| One summary call answers a typical question | Pass | `get_financial_context` golden tests (U) |
| All four §2.4 layers in the summary | Pass | U: golden files assert arithmetic, meaning, provenance/completeness, answer shape |
| Ordered by importance, kept small | Pass | U: golden files are byte-for-byte and size-bounded |
| Deterministic, facts and uncertainty, never advice | Pass | U: N11 tests; no inference dependency in the backend (N2) |
| As-of dates, staleness, completeness on reads | Pass | L: every value carries date + source; U: staleness/series tests |
| Read-only queries modify nothing | Pass | I: MCP read suites |
| Reads countable separately from writes | Pass | `kind: read|write` on `agent_tool_called` (U schemas) |

### J10 — isolation (P1 scope)

| Criterion | Verdict | Evidence |
|---|---|---|
| No screen or API response carries another user's data, verified by test | Pass | I: RLS + isolation suites (562). L: well-formed foreign id → 404 `NOT_FOUND`; unauthenticated → 401 |

### Non-functionals (P1 scope)

| Requirement | Verdict | Evidence |
|---|---|---|
| N1 measured (`latency_ms`) and probed | Pass | `latency_ms` on every tool call; probe green 6 runs in a row (p95 has no verdict before launch traffic) |
| N2 no inference, no document upload | Pass | No such endpoints; backend dependency review by the import-rules suite (U) |
| N3 every write auditable (undo in P3) | Pass | I: audit-row suites on every write path |
| N4 isolation at the data layer | Pass | I: RLS + grants suites |
| N5 secrets in env only | Pass | No `.env`/key/secret files tracked; no live-secret patterns in source; QA passwords stayed in `/tmp` |
| N7 mobile-first, one API | Pass | E: 390 + 1280 projects, 320px no-sideways-scroll, tap targets, 11px floor, axe serious/critical clean |
| N8 reliability/security over cost | Pass | Sentry seen on both sides (handoff); this session: zero 500s across 170 e2e tests once the local DB password was fixed |
| N9 analytics carries no values | Pass | U: schema + `notify()` digit/currency checks |
| N10 packs are data | Pass | U: deny-list scan (3 tests); packs + guides publish as versioned content (L: 8 docs at v1) |
| N11 deterministic context | Pass | U: golden + purity tests |

### Checkpoint items (plan §3.1)

Sign-up → country → segment → Add → Home all exercised live on production (L). The
OAuth connect flow exercised end to end against the local build with a fake agent (E).
Revocation rejects later calls (E). Events carry segment (U, I, E). RLS/isolation
suites pass in CI configuration (I). Backups: manual + scheduled green, restore proven
(handoff); the Oct 8 09:15 scheduled run failed on GitHub's billing block (see issue
4 — external cause, already settled). Probe green every ~6h (P).

## Issues found

### 1. Connect-flow screenshots are 1×1 placeholders (F11, already open) — Medium
- Steps: open `/app/agent/connect?entry=agent` → Claude → any platform step.
- Expected (J5): each step shows its screenshot.
- Actual: all six `content/images/connect/*.png` are 1×1 PNGs; the app shows its
  neutral placeholder (which is the designed fallback, and e2e asserts it).
- Note: a Founder item, not a build defect; tracked as still-open in the handoff.

### 2. `test:int` rotates `netnet_app`'s cluster-wide password — Medium (test hygiene)
- Steps: run `pnpm test:int` against a shared local Postgres, then use any other
  database on that cluster as `netnet_app` (e.g. run e2e).
- Expected: suites are independent.
- Actual: the harness calls `bootstrapRoles` (unconditional `ALTER ROLE … PASSWORD`)
  with a random password per test file, so every other local database's app access
  breaks with `password authentication failed`, surfacing as bare 500 `INTERNAL`s.
  This burned the first e2e run of this session (all real-server specs failed; stubbed
  specs passed, which initially masked it).
- Production/CI are unaffected (ephemeral clusters), but local runs are order-dependent:
  run `test:int` last, or re-bootstrap afterwards. Suggest triage: scope the harness to
  a dedicated role, or document the ordering.

### 3. `pnpm lint` fails on unignored local artifacts — Low
- Steps: fresh checkout, install, `pnpm lint`.
- Expected: exit 0.
- Actual: exit 1 — Prettier flags 99 files under the untracked `.pnpm-store/` and
  `.claude/settings.local.json`, neither in `.prettierignore`. ESLint is clean and no
  tracked source file has a formatting issue, so this is ignore-list hygiene only.

### 4. Oct 8 scheduled backup failed on GitHub's billing block — Info (external)
- The 09:15 UTC scheduled backup never started: "recent account payments have failed".
  Same incident as the handoff's billing note; runs after 09:19 UTC succeed, and a
  manual backup from Oct 8 04:13 UTC exists. Not a product defect — watch the next
  scheduled run to confirm recovery.

### 5. Duplicate sign-up discloses account existence (422) — Info (known, P4)
- L: re-registering an address → 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`. Matches
  the plan's note; the enumeration review is P4 scope. No action for P1.

## What went well

- The three suites split the contract cleanly: e2e owns the flows (including a real
  OAuth round-trip with a fake agent and revoke-then-`invalid_grant`), integration owns
  the data layer (RLS, grants, audit, emails), unit owns the arithmetic and schemas.
  Nothing in §3.2 lacked a test home except the two inbox deliveries.
- Error shapes are consistently specific: `LIKELY_DUPLICATE` with candidates,
  `SAME_DATE_REPLACED` naming the replaced value, per-field `VALIDATION_FAILED`, and
  `NOT_FOUND` (never a leak) for foreign ids — all observed live.
- The degraded paths are designed, not accidental: missing screenshots get a neutral
  placeholder, unverified users get a plain resend route, and the app never strands
  anyone mid-onboarding.
- Production telemetry is already earning its keep: the 6-hourly probe caught nothing
  because there was nothing to catch, and the billing failure was diagnosable from the
  run annotation alone.

## Suggested manual checks for the Founder

1. Hands-on pass on a real phone and computer: sign up, confirm country, skip the
   segment, add two holdings, read Home — confirm the first picture says something
   surprising (§2.2).
2. Connect Claude for real (custom connector on any plan): approve in the browser,
   confirm NetNet moves on by itself, ask "what am I worth?", hand it a statement and
   watch the values land marked as its own.
3. Confirm both emails arrive and read right: the verification email and the
   "Not you? Revoke it" security email ( Items 1–3 close the two *-marked criteria).
4. Supply the six F11 screenshots (CLAUDE.md privacy note: crop personal data first),
   and set up the F16 uptime monitor.
5. Watch the next scheduled backup run (issue 4) and the probe's ~6h cadence.
6. Heads-up, not P1: GitHub announces the `ubuntu-latest` runner moves to Ubuntu 26 on
   Oct 19 — CI floats on that label, so expect possible breakage and pin or adapt then.
7. Note: the QA account `qa-p1-20261008@example.com` (2 fictional holdings, S$5,328)
   lives in production until P3's account deletion; exclude it from any metrics.
