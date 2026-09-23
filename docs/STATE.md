# Project State

## Current
Stage: Prototype
Phase: n/a
Status: awaiting-approval
Next action: Founder reviews `docs/02-prototype/index.html` (and ideally tests it with 3–5 users).
On approval: `stage: architecture`

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day, re-confirmed with the PRD approval |
| PRD | **approved** | 2026-09-23 | `docs/01-prd.md`; four gate decisions taken as recommended |
| Prototype | **awaiting-approval** | 2026-09-23 | `docs/02-prototype/`; built against the Founder's four mockup boards, shared in-session |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Stage 2 built. `docs/02-prototype/` is a clickable prototype — plain HTML/CSS/JS, opens by
double-clicking index.html, no build. It covers all 11 jobs; `prototype-notes.md` maps flow to job,
records the design decisions, lists 5 gate decisions and carries the 3–5 user test script.
PROCESS NOTE, worth not repeating: I started building Insights without asking for the mockups,
which both STATE.md and 01-prd.md §9 told me to do first. The Founder stopped me and supplied all
four boards (Home landing, Home detail, Insights, Account). Insights was rebuilt against the real
frames; Home was corrected too (chart carousel, sparkline rows, stat pills, expandable value rows).
The Founder's direction: mockups are reference not gospel — match functionality, ignore branding,
and make it responsive for desktop as well as mobile, since v1 is a web app.
MOCKUP IMAGES ARE NOT IN THE REPO and must never be committed. Ask the Founder for them again.
NEXT: Stage 2 is a gate. Do not start Stage 3. Any user-test learnings go back into 01-prd.md
BEFORE the Founder approves this stage.
WATCH OUT: Stage 3 owns all stack choices. The prototype deliberately has no framework, no
database and hand-rolled SVG charts — do not read it as an architecture proposal.
