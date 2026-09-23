# Project State

## Current
Stage: Discovery
Phase: n/a
Status: awaiting-approval
Next action: Founder replies `approve discovery`, then `stage: prd`

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | awaiting-approval | 2026-09-23 | `docs/00-discovery.md` written; business constraints added |
| PRD | not-started | | |
| Prototype | not-started | | |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Scaffolded the repo and ran Stage 0. docs/00-discovery.md holds the problem statement, beachhead
user, alternatives, 8 ranked risky assumptions, Founder business constraints, and an interview
guide. CLAUDE.md Project paragraph is filled in. Mockups are committed at docs/reference/mockups/
with an index README - design reference only; they predate the MCP layer.
Decisions are in docs/decisions.md (13 entries), including the four Founder choices: SG/SEA
beachhead, agent full CRUD with audit log + undo, remote MCP with OAuth, P1 ships web + MCP
together.
WATCH OUT: this session drifted into comparing hosting providers, which is Stage 3 work. The
Founder correctly stopped it and that research was deliberately NOT saved. Do not carry stack
opinions into Stage 1. Section 5 of 00-discovery.md holds the business constraints that should
drive the Stage 3 decision when it is properly reached.
Unresolved: whether user interviews run before the PRD; whether a channel exists for the first
20 users (both in 00-discovery.md section 7). Repo still has no main branch - all work is on
claude/compassionate-franklin-f6gat1.
