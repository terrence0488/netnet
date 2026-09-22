# CLAUDE.md

## Project
<one paragraph: what this product is, who it is for. Fill this in.>

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
- Append significant decisions to `docs/decisions.md`.

## Commands
<fill in once the project is scaffolded, e.g.>
- Install: `npm install`
- Dev server: `npm run dev`
- Test: `npm test`
- Lint: `npm run lint`
