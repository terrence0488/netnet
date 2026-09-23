# Project State

## Current
Stage: Requirements (PRD)
Phase: n/a
Status: awaiting-approval
Next action: Founder replies `approve prd`; the next session then starts with `stage: prototype`

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved**, §1/§3/§4 revised | 2026-09-23 | Approved, then reframed by the Founder same day; revision needs re-confirmation at the PRD gate |
| PRD | awaiting-approval | | `docs/01-prd.md`; 5 open questions at the gate |
| Prototype | not-started | | |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Stage 1 PRD written to docs/01-prd.md, awaiting Founder approval.
MID-SESSION REFRAME: the Founder reframed the problem. It is no longer "data entry is the
problem" - it is that AI cannot give tailored advice without knowing where the user stands, and
most people do not know their own net worth. Data entry is the obstacle to that context, not the
problem. Applied to both 01-prd.md and (§1, §3, §4) the approved 00-discovery.md, which therefore
needs re-confirmation at the PRD gate.
What the reframe changed: advice (J8) is now the premise, not a secondary job; A4 promoted and
A11 added; M7 (repeat read-only agent queries) is a headline metric with its own kill threshold;
accessibility of each holding proposed as a first-class attribute so affordability answers are not
computed off CPF and home equity; NetNet supplies context and never generates advice itself.
What it did not change: the build. Assembly, the MCP layer, audit + undo, the free-forever set.
FIVE OPEN QUESTIONS in 01-prd.md §9, each with a recommendation. Question 1 is the live tension -
the reframe's language is mass-market, the approved beachhead is not.
BRANCH: claude/zealous-davinci-x09bgr, started from the approved Stage 0 commit (= origin/main).
MOCKUPS: still not in the repo. Stage 2 needs the visuals - ask the Founder, never commit them.
WATCH OUT: do not let Stage 2 drift into stack or hosting choices; that is Stage 3.
