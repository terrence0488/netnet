# Project State

## Current
Stage: Prototype (rework)
Phase: n/a
Status: awaiting-approval
Next action: Founder finishes the UI/UX review (`prototype-notes.md` §7 item 4, the desktop
layout) — the only open gate decision — and reads the PRD revisions listed in §9.6, then replies
`approve prototype`, or gives feedback.

## Approvals
| Stage / Phase | Status | Date | Notes |
|---|---|---|---|
| Discovery | **approved** | 2026-09-23 | `docs/00-discovery.md`; §1/§3/§4 reframed same day |
| PRD | **approved** | 2026-09-23 | Original, single-beachhead version |
| PRD (amended) | **approved** | 2026-09-24 | Three personas, jurisdiction packs, agent as a user → `01-prd.md` §9.5 |
| Prototype | awaiting-approval | | Reworked 2026-09-24 for amended J1/J2/§2.3; gate presented |
| Architecture | not-started | | |
| Plan | not-started | | |
| P1 | not-started | | |

## Handoff note (last session)
Stage 2 rework is built (f635106) and awaiting approval. Since then: landing/sign-up no longer squeeze
into the 232px sidebar track (71f9c1e); and the Founder's gate decisions 1–3 are applied — J2 names an
undecided accessibility state, G-D1/G-D3 re-worded to §2.5, `via` on `holding_created` (PRD §9.6,
wording AI-drafted and flagged for the Founder's reading). Net Worth Goals out; Tags AND/OR kept.
Value Note and Mark on graph were ruled out of scope and removed from the prototype entirely.
STILL OPEN: only the desktop layout (Founder reviewing UI/UX).
UI/UX review so far (2026-09-25): chart pagers keep scroll position and disabled arrows no longer
double-tap-zoom (9e0654b); then a content pass across every screen after the Founder found them
cluttered — "one figure, one place" is now binding (design-system §2.1). Agent provenance is a quiet
mark, with the client named only on an opened value; the exchange rate is stored, not shown (PRD
§9.6 item 16, AI-drafted for the Founder's reading). Then the landing page left the prototype, and
sign-up became only a way in (Google, Apple, or email then password), with region and segment in a
two-question onboarding afterwards, plus log-in and log-out (PRD §9.6 item 18). Where-you-live now
defaults to the IP-detected country (simulated in PROTO) and lists every country alphabetically
(§9.6 item 19). Then the basics moved into onboarding (one question per screen) and the empty Home
became one action plus a quiet agent link (§9.6 item 20); packs gained per-country default types and
follow-up questions, SG adds Car loan, and ~10 launch packs are proposed for the Founder to confirm
(§9.6 item 21). Then onboarding through the agent: intro screen with Start plus "Or, connect your AI
agent", one connect flow everywhere (per client and platform, screenshot slots in `connect/`, mocked
approval), connected = done → blank Home with the starting prompt (§9.6 item 22).
Then (2026-09-25): the PRD re-written so the Stage 2 revisions read as requirements in the PM's
voice, with §9.6 a revision table (Founder asked for this). The prototype has SG, MY and UK packs.
"All+1" is gone. The out-of-date note now routes to the agent or the connect flow. The open
questions are settled except the desktop layout, which the Founder is still reviewing.
The functional suite had gone stale against the rework (it predated J1's return-to-Home and the
universal t-retirement type) — tests live in the session scratchpad, not the repo, so they do not
survive sessions. Re-run them before claiming anything passes.
`design-system.md` governs visuals; never put design or scope commentary in the prototype UI.
§2.4 (A13/M12) cannot be shown in a clickable prototype — Stage 5/6. Stage 3 owns stack; the Founder
reports Claude's and ChatGPT's free plans allow custom MCP connectors (confirm when building). Stage 3 must also design packs for a future human-admin
portal (PRD §9.6 item 17): runtime-read and versioned, validated whole, audited, no user-data access,
and a pack edit never silently reclassifies existing holdings. The portal itself is not v1.
