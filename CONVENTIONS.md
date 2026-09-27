# CONVENTIONS.md

How NetNet's code is written. Every engineer, human or AI, follows it. It goes with
`docs/03-architecture.md`: the architecture says *what* is built, this says *how*. When the two
disagree, stop and raise it. Do not pick one.

## 1. Toolchain

- **Node 22 LTS**, **pnpm** workspaces, **TypeScript** in `strict` mode with
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. ESM only.
- **ESLint** (typescript-eslint) + **Prettier**, with the repo's config and no per-file overrides.
  CI fails on warnings.
- **Vitest** (unit and Worker integration via `@cloudflare/vitest-pool-workers`), **Playwright**
  (E2E). In a Claude Code cloud session, Playwright uses the preinstalled Chromium; never run
  `playwright install`.
- **wrangler** for local runs, migrations and deploys. Commands live in the root `package.json`
  scripts and are copied into `CLAUDE.md` → Commands once they exist (Stage 5, P1).

## 2. Folder structure

```
apps/
  worker/                 the one Cloudflare Worker
    src/
      index.ts            Hono app; exports fetch, scheduled, and the Ledger class
      http/               REST route handlers (thin: parse → call → map)
      mcp/                MCP server, one file per tool
      auth/               Better Auth config, OAuth server, approval-page API
      ledger/             Ledger Durable Object: the ONLY code that touches user money
        schema.ts         Drizzle schema
        migrations/       bundled Ledger migrations
      db/                 the ONLY code that touches D1 core
      content/            pack, country and guide read side; FX
      events/             track() and the event schemas' wiring
      jobs/               cron: FX fetch, attempt timeouts, backups, health
      lib/                log(), errors, ids, rate limits
    migrations/core/      D1 core migrations
    migrations/events/    D1 events migrations
    test/                 integration tests, incl. test/isolation/
    wrangler.jsonc
  web/                    React SPA (Vite)
    src/
      routes/             one folder per screen
      components/         shared UI, built on tokens
      charts/             SVG chart components (geometry comes from core)
      api/                typed client over packages/contracts
  landing/                static marketing page
packages/
  core/                   pure domain logic and chart geometry (no I/O)
  contracts/              zod schemas: REST, MCP tool IO, events, content
  tokens/                 design tokens → CSS variables (web) and a TS object (native)
content/
  packs/ countries.json agents/    administered content, published to D1 (§8)
ops/
  metrics/                SQL for M1–M11, per segment
e2e/                      Playwright specs
docs/                     the workflow's documents; docs/02-prototype is the design reference
```

## 3. Dependency rules (lint-enforced)

- `packages/core` imports nothing but `packages/contracts` types and `d3-*` maths. No `fetch`,
  storage, `Date.now()`, `Math.random()` or environment access (N11). `today` and ids are passed in.
- `packages/contracts` imports only `zod`.
- `apps/web` imports `core`, `contracts` and `tokens`, and never anything from `apps/worker`.
- **Only `apps/worker/src/ledger/**` may import the Ledger schema or run Ledger SQL. Only
  `apps/worker/src/db/**` may touch the `core` D1 binding.** Everything else goes through them.
- The Ledger is chosen **only** by `ledgerFor(userId)` in `apps/worker/src/ledger/stub.ts`.
  `userId` comes from the verified session or token, never from a request body, path or query.
- **No local knowledge in code (N10).** No institution names, local scheme names, rules or
  defaults outside `content/`. A test scans source outside `content/` and `docs/` for a deny-list
  (CPF, EPF, SRS, ISA, HDB, PRS, KWSP, MPF, Superannuation, 401(k)…) and fails on a match.

## 4. Naming

| Thing | Convention | Example |
|---|---|---|
| Module files | kebab-case | `compile-context.ts` |
| React components | PascalCase file and export | `PositionLedger.tsx` |
| Types and interfaces | PascalCase | `FinancialContext` |
| Functions, variables | camelCase, verbs for functions | `resolveAccess()` |
| Constants | SCREAMING_SNAKE only for true constants | `MAX_VALUES_PER_CALL` |
| DB tables and columns | snake_case, singular tables | `holding.base_minor` |
| REST JSON | camelCase | `baseCurrency` |
| MCP tools and parameters | snake_case | `record_values`, `holding_id` |
| Analytics events and props | snake_case, exactly as PRD §3.5 | `agent_tool_called` |
| IDs | prefixed ULIDs | `hld_01J…`, `val_01J…` |
| Error codes | SCREAMING_SNAKE | `LIKELY_DUPLICATE` |

## 5. Money, dates and figures

- **Amounts are integers in the currency's minor unit** in storage and in `core`. Decimal
  strings or numbers in major units appear only at the edges (forms, REST, MCP) and are converted
  once by `core.toMinor`. **Never do arithmetic on money in floating point.**
- FX rates are decimal strings. Conversion goes through `core.convert` only (exact, half away
  from zero).
- Value dates are `YYYY-MM-DD` calendar dates. Instants are ISO-8601 UTC. "Today" is computed in
  the user's time zone (`profile.time_zone`) at the edge and passed into `core`.
- **Every figure the product shows or tells an agent comes from a `core` function.** No screen,
  route or tool computes a total, change, period or accessibility outcome on its own. A second
  implementation is how the screen and the agent come to disagree.

## 6. Privacy rules in code (N9, §3.5 of the PRD)

- **Never log, track, or send to Sentry:** amounts, holding/type/tag names, email addresses,
  request or response bodies, document content.
- `track()` accepts only the typed events in `packages/contracts/events`; adding a prop means
  changing the schema. `log()` accepts only its whitelisted fields.
- Reminder emails carry a count and a link, never an amount or a holding name.
- **All test and seed data is fictional.** Never paste real financial data (including the
  Founder's) into code, fixtures, tests, screenshots or commits. Mockup images are never committed.

## 7. Secrets and configuration (N5)

- Secrets live in `wrangler secret` per environment, `.dev.vars` locally (gitignored), and GitHub
  Actions secrets for the deploy token only. `.dev.vars.example` lists names, never values.
- Non-secret configuration goes in `wrangler.jsonc` `vars`, per environment.
- A secret in a commit is an incident: rotate it first, then clean history.

## 8. Content (packs, countries, agent guides)

- Content lives in `content/` as JSON and is validated by the schemas in `packages/contracts`.
  `pnpm content:check` runs in CI. `pnpm content:publish --env <env>` publishes a new immutable
  version. Screenshots and logos go to R2 through the same command.
- A pack lists only what differs from `generic`. Reasons name the local instrument.
  Copy follows the PRD: ask facts, not categories; show the consequence; "locked until you're
  eligible to withdraw", not "until 55".
- Every launch pack is reviewed by someone who knows that market before it is published to
  production (PRD §2.3). Record the reviewer in the publish message.

## 9. Testing

A task is not done until its tests pass in CI. A bug fix starts with a failing test.

| Layer | Required | Tool |
|---|---|---|
| `packages/core` | Every exported function; ≥90% line coverage; **golden-file tests** for `compileContext` (byte-identical output for fixed input) | Vitest |
| Contracts and content | Every schema accepts a valid example and rejects each invalid case listed in the architecture (§7.8); all of `content/` validates | Vitest |
| REST and MCP | Every route and every tool: happy path, validation error, not-found, and **an isolation case** (user B with user A's ids → `NOT_FOUND`, no A data in the body). A registry test fails when a route or tool has no isolation case | vitest-pool-workers |
| MCP protocol | An SDK client connects with each supported protocol version, lists tools, calls one read and one write | vitest-pool-workers |
| Ledger | Atomicity (a failing item in `record_values` writes nothing), undo and batch undo, `UNDO_CONFLICT`, same-date replacement, and **migration upgrade from every earlier schema version** | vitest-pool-workers |
| Web | Each PRD job's happy path at **390 px** and **1280 px**; no horizontal scroll at **320 px**; axe accessibility checks on key screens; the analytics events each flow fires | Playwright |
| Privacy | Event schemas contain no amount-like or free-text props; `log()` rejects unknown fields; the N10 deny-list scan | Vitest |

Tests are deterministic: fixed `today`, seeded ids, no network. External services (Resend, FX
sources, Google, Apple) are faked at their interface.

## 10. Data and migrations

- **D1 migrations** are numbered files in `apps/worker/migrations/<db>/`. They are expand-only
  within a release: add columns and tables, backfill, and remove only in a later release once no
  deployed code reads them.
- **Ledger migrations** are numbered, bundled, and run inside each Ledger on first wake after a
  deploy, in one transaction. Additive only. Each ships with fixtures from every earlier schema
  version and a test that upgrades them.
- Every Ledger write happens inside one transaction that also writes its audit rows and bumps
  `data_version`. No write path skips the audit.

## 11. Error handling

- Throw `AppError(code, message, details?)` with a code from `packages/contracts/errors`. Never
  throw strings; never leak stack traces or SQL to a caller.
- Validate at the boundary with the contract's zod schema; map failures to `VALIDATION_FAILED`
  with `fields`.
- REST maps codes to HTTP statuses (architecture §7.5). MCP returns `isError: true` with
  `structuredContent.error`. The message says what to change, clearly enough for a model to
  correct itself.
- Another user's ids are `NOT_FOUND`, never `FORBIDDEN`.
- Unexpected errors: log with the request id, report to Sentry (scrubbed), return `INTERNAL` with
  the request id.
- User-facing error copy is plain language with a next step (J5): no codes or raw messages on
  screen.

## 12. API and compatibility

- The REST API and MCP tools are **public contracts** (native apps and agents depend on them).
  Within v1, changes are additive: new optional fields, new tools. Never rename or remove a field
  or tool. A breaking change needs a new path (`/api/v2`) or a new tool name and an architecture
  update approved by the Founder.
- Changing an interface contract in `docs/03-architecture.md` §7 is a **stop-and-raise**
  (WORKFLOW Stage 5), not an improvisation.

## 13. UI

- `docs/02-prototype/design-system.md` is the spec, and the prototype is the behavioural
  reference. Use tokens only, never raw colours, sizes or font names in components.
- The design-system rules are binding in production: one figure, one place (§2.1); 44 px touch
  targets (32 px only with a fine pointer); `aria-disabled`, never `disabled`; nothing below
  11 px on a phone; reduced motion honoured; only a route change scrolls to the top.
- No design or scope commentary in the UI (prototype note 17).
- Charts are our SVG components over `core.chart` geometry. No charting library.

## 14. Dependencies

- Keep them few. A new runtime dependency is justified in the PR description (what it replaces,
  its size, its maintenance).
- Never add analytics, tracking, session-replay or advertising SDKs.
- Versions are locked by `pnpm-lock.yaml`; Renovate proposes updates weekly.

## 15. Commits, branches and PRs

- **Commit messages** follow the repo's existing style: `Area: Imperative summary` in sentence
  case, ≤72 characters. Area is the package or topic (`Core`, `Worker`, `Web`, `Ledger`, `MCP`,
  `Auth`, `Content`, `CI`, `Docs`, `Tests`). The body says *why*. Add a `Task: Pn-Tm` trailer when
  the commit belongs to a task.
- One logical change per commit. Never commit secrets, `.dev.vars`, real financial data or
  mockup images.
- One branch per task, from `main`. A PR names its task brief, passes CI, and meets the brief's
  done criteria before the engineering manager marks the task done.
- Significant decisions go in `docs/decisions.md` (date, decision, reason, stage).
