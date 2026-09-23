# Project State

## Current
Stage: Prototype
Phase: n/a
Status: not-started
Next action: `stage: prototype`

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day, re-confirmed with the PRD approval |
| PRD | **approved** | 2026-09-23 | `docs/01-prd.md`; four gate decisions taken as recommended |
| Prototype | not-started | | |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Stage 1 approved. docs/01-prd.md is settled: 11 jobs with Given/When/Then acceptance criteria
(section 6) are the contract Stage 4 plans against and Stage 6 tests against.
What the Founder decided in this session, all already in the doc: the problem is reframed - AI
cannot advise without knowing where the user stands, so advice is the premise and tracking the
means; vision broad but beachhead narrow, selected on financial literacy so no market education is
needed; Insights ships in the MVP (J11), overriding the recommendation to defer; accessibility is a
first-class holding attribute; Claude is the launch-blocking MCP client with ChatGPT a dated
fast-follow; {client} rides on the connection and tool-call events so M3 splits by client.
NEXT: Stage 2, the prototype. Input is docs/01-prd.md only.
ASK THE FOUNDER FOR THE MOCKUP IMAGES FIRST. J11 (Insights) was specified from the README line
alone - those frames have never been seen, and the prototype cannot get them right blind. Never
commit them.
WATCH OUT: Stage 2 is design, not stack. No hosting, framework or database opinions - that is
Stage 3, and an earlier session already drifted there once.
MAIN: fast-forwarded to 286bc18 with the Founder's approval, so main carries Stage 0 and Stage 1.
Per-session branches hold nothing unique once merged - main is the checkpoint of record and docs/ is
the memory.
