# Project State

## Current
Stage: Requirements (PRD)
Phase: n/a
Status: not-started
Next action: `stage: prd`

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; approved by Founder |
| PRD | not-started | | |
| Prototype | not-started | | |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Stage 0 approved and merged to main. docs/00-discovery.md is settled: problem framed around data
entry rather than tracking, SG/SEA multi-asset professional as beachhead, 10 ranked assumptions,
Founder business constraints (section 5), all open questions resolved (section 7).
NEXT: Stage 1, the PRD. Inputs are docs/00-discovery.md plus the Founder's high-level solution.
Read docs/reference/mockups/README.md too - it is the only design reference in the repo.
THREE THINGS THE PRD MUST CARRY, from the resolved questions:
 1. Instrumentation IS the experiment. No interviews are happening, so P1 must measure agent
    connection rate, agent write volume, correction rate and return visits. Without these the
    launch produces no evidence and the kill decision has nothing to rest on.
 2. Distribution needs a real goal. No waitlist, no channel, and signups are the kill metric
    (assumption A9).
 3. Everything shipped in the test-market phase is permanently free (A10). Scope is a revenue
    decision - worth naming which capabilities are deliberately reserved for later monetisation.
MOCKUPS: images are NOT in this repo (real personal financial data, purged from history). Ask
the Founder for them when the visual reference is needed; never commit them.
BRANCH: develop on claude/compassionate-franklin-f6gat1, merge to main after each approved stage.
WATCH OUT: an earlier session drifted into comparing hosting providers, which is Stage 3 work.
That research was deliberately not saved. Do not carry stack opinions into Stage 1.
