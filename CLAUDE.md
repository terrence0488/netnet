# CLAUDE.md

## Project

**NetNet** is an AI-native net worth tracker. It gives people with multi-asset, multi-currency
wealth — brokerages, bank cash, CPF, property, vehicles, unvested equity, crypto — one accurate,
current picture of what they are worth, on any device. Everything a person can do in the UI, an
AI agent can also do: NetNet exposes a comprehensive MCP layer so a user connects ChatGPT or
Claude to their own data and delegates the tedious part. Drop a brokerage statement into your
agent and it updates your holdings; ask whether you can afford a car and the answer is grounded
in your actual balance sheet. The bet is that data entry, not tracking, is the real problem, and
that an agent solves it without narrowing what can be tracked the way bank-feed aggregation does.
First users are multi-asset professionals in Singapore and SEA, a market US-centric aggregators
serve badly. Web first, native iOS/Android later. Free during validation, with monetisation
deferred until demand is proven.

**Design reference:** `docs/reference/mockups/` (iOS mockups — design and functionality only;
they predate the MCP layer and use an obsolete product name).

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
<not yet scaffolded — filled in during Stage 5, Phase 1>
