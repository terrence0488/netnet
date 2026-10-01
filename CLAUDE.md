# CLAUDE.md

## Project

**NetNet** is an AI-native net worth tracker, and the context layer for a person's own AI agent.
Frontier models can already give good personal-finance advice. What they lack is where the person
actually stands. NetNet holds that picture: brokerages, bank cash, retirement schemes, property,
vehicles, unvested equity, crypto and what is owed, in any currency, on any device. It exposes the
picture through a comprehensive MCP layer, so a user connects Claude or ChatGPT to their own data.
The agent does the data entry (drop a statement in and it updates the holdings) and answers
questions against the real balance sheet ("can I afford a car?"). Everything a person can do in the
UI, an agent can do too. Data entry is the obstacle; grounded advice is the point.

v1 serves three personas (starting out, accumulating, established). It launches in Singapore and
SEA, but it is never Singapore-shaped: local knowledge lives in jurisdiction packs, which are data.
Web first, native iOS/Android later. Free during validation. Whatever ships free stays free;
monetisation comes only from capabilities added later.

**Design:** `docs/02-prototype/design-system.md` ("Poster") is the visual design, and the prototype
in `docs/02-prototype/` is the behavioural reference. `docs/reference/mockups/README.md` describes
the Founder's original iOS mockups, which are a functional brief only. **The mockup images are
deliberately not in this repo** (they contain real personal financial data). Ask the Founder for
them if you need them, and never commit them.

## How this project is built

This project is built by one human (the **Founder**) and AI acting in specialist roles,
following a staged workflow with human approval gates.

**At the start of every session, before doing anything else:**

1. Read `docs/STATE.md` to find the current stage, approvals, and next action.
2. Read `docs/WORKFLOW.md` and follow the **Session Protocol** in it.
3. Load only the files the current stage lists as its inputs. Do not scan the whole repo.

Do not skip this. Every session is independent — chat history from a previous
session is never available, and `docs/` is the only memory.

If `docs/WORKFLOW.md` or `docs/STATE.md` does not exist, tell the Founder and stop.

## Non-negotiables

- Only the Founder approves a stage. AI never marks its own work approved.
- Stop at gates. One session runs one stage (or one task), then ends.
- Never commit secrets. Use environment variables.
- Follow `CONVENTIONS.md` for all code.
- **Branches:** a cloud session starts on a `claude/<random-name>` branch. The Founder's standing
  instruction is not to use it: create and push the branch CONVENTIONS §15 names (`p1-t2`, one per
  task) and open each pull request from it.
- **Documents state the current decision only.** When a decision changes, rewrite the affected
  text in place. Never add amendment sections, revision tables, "superseded" notes, "changed on"
  markers or rejected alternatives. Git history is the record of how it got here.
- Record significant decisions in `docs/decisions.md`, a register of the decisions in force. A
  changed decision replaces its entry; it is not appended as a correction.

## Commands
Node 22 and pnpm. A SessionStart hook runs `pnpm install --frozen-lockfile`.

| Command | What it does |
|---|---|
| `pnpm dev` | Web app (http://localhost:5173/app/), landing (:5174) and API (:8787) with reload |
| `pnpm build` | Landing and web app into `dist/`, the API bundle into `apps/api/dist/` |
| `pnpm lint` | ESLint (CONVENTIONS §3's import rules; fails on warnings) and Prettier's check |
| `pnpm format` | Prettier, writing |
| `pnpm typecheck` | `tsc` in every package and at the root |
| `pnpm test` | Unit tests in every package, and the N10 deny-list scan |
| `pnpm test:int` | Integration tests against Postgres (`DATABASE_URL`) |
| `pnpm test:e2e` | Playwright against the built app (run `pnpm build` first), at 390 and 1280 px |
| `pnpm content:check` | Validates `content/` against its schemas and the §7.8 rules; `--strict` also fails on a missing image |
