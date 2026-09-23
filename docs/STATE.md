# Project State

## Current
Stage: Requirements (PRD)
Phase: n/a
Status: awaiting-approval
Next action: Founder replies `approve prd`; the next session then starts with `stage: prototype`

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; approved by Founder |
| PRD | awaiting-approval | | `docs/01-prd.md` written; 5 open questions at the gate |
| Prototype | not-started | | |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Stage 1 PRD written to docs/01-prd.md, awaiting Founder approval. It carries the three things the
Stage 0 handoff demanded: metrics as the experiment (M1-M10 with an instrumented event set and a
no-financial-values rule), distribution as in-scope v1 work (G-D1..G-D4), and the permanently-free
set vs seven capabilities reserved for later monetisation.
Ten user jobs J1-J10 each have Given/When/Then acceptance criteria in section 6 - these are the
contract Stage 4 plans against and Stage 6 tests against. Nine non-functional requirements in
section 7 carry the Founder's cost, reliability and security constraints forward.
FIVE OPEN QUESTIONS are in section 9, each with a recommendation: metric targets, the reserved
capability list, whether the Insights tab ships in v1 (recommend no), which MCP client is
launch-blocking (recommend Claude first, ChatGPT fast-follow), and the FX rate source.
BRANCH: this session worked on claude/zealous-davinci-x09bgr, not the branch the previous handoff
named. It started from the approved Stage 0 commit, identical to origin/main.
MOCKUPS: images still not in the repo. Stage 2 (prototype) is the stage that most needs them -
ask the Founder for the visuals before building it, and never commit them.
WATCH OUT: do not let Stage 2 drift into stack or hosting choices; that is Stage 3.
