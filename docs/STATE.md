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
user, alternatives, 8 ranked risky assumptions, Founder business constraints (section 5), and an
interview guide. Decisions are in docs/decisions.md (16 entries).
MOCKUPS: the Founder's UI mockups are NOT in this repo - they hold real personal financial data
and were purged from git history. docs/reference/mockups/README.md is the written substitute.
Ask the Founder for the images when you need the visual reference; never commit them.
BRANCH: everything stays on claude/compassionate-franklin-f6gat1. Merge to main only when the
project is finalised, not stage by stage. History was rewritten once (mockup purge).
WATCH OUT: this session drifted into comparing hosting providers, which is Stage 3 work. The
Founder correctly stopped it and that research was deliberately NOT saved. Do not carry stack
opinions into Stage 1; section 5 of 00-discovery.md holds the constraints that should drive the
Stage 3 decision when it is properly reached.
All three Stage 0 open questions are now answered (00-discovery.md section 7): no interviews,
no pre-launch channel, and free stays free forever with monetisation from future capabilities
only. Nothing is unresolved in Stage 0.
CARRY INTO STAGE 1: (a) analytics is the experiment, not a nice-to-have - P1 must measure agent
connection rate, write volume, correction rate and return visits, or the launch yields no
evidence; (b) distribution needs a PRD goal and real planned work, since nothing exists today;
(c) everything shipped in the test-market phase is permanently free, so scope decisions are
revenue decisions.
