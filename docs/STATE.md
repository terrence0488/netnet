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
Stage 2 rebuilt twice and now has a real design system. `docs/02-prototype/design-system.md` is the
spec — read it before touching any visual code. Direction "Two Inks" (V2), chosen by the Founder:
Statement's typographic structure (hairline rules, no cards, Fraunces for money) with Horizon's
fluorescent colour. Magenta is NetNet; cyan is the agent, shown as a rule in a reserved gutter on
every row the agent wrote. `explorations/` keeps the rejected rounds, including a first attempt the
Founder rightly rejected as generic.
FOUNDER CORRECTIONS THIS SESSION, all recorded in decisions.md: ask for the mockups before building;
mockups are a FUNCTIONAL brief only, never a visual target; choosing the design system is Stage 2
product-design work, not Stage 3; ask about the native path before choosing one (React Native +
Expo, hybrid brand-chrome/native-controls).
VERIFY, DON'T EYEBALL: chart colour goes through the palette validator and text tokens through a
contrast check. Both caught real failures here — a hand-picked palette that failed colour-blind
separation, and two brand colours that failed small-text contrast.
NEXT: Stage 2 is a gate. Do not start Stage 3. Any user-test learnings go back into 01-prd.md
BEFORE the Founder approves. Open design questions are design-system.md §9 and notes §5.
WATCH OUT: Stage 3 still owns framework, hosting, database. The prototype has none of those.
