# Prototype tests

Browser tests for the clickable prototype, run with Playwright against `../index.html` on a phone
(iPhone 13) and at desktop sizes. They are the behaviour the design must keep: a new visual
design (or a design variant) should pass all of them unchanged, apart from tests that check the
look itself.

```
node docs/02-prototype/tests/run.mjs            # everything, one line per suite
node docs/02-prototype/tests/run.mjs lc fab      # just these
node docs/02-prototype/tests/ph.mjs              # one suite, full output
```

Screenshots go to `$SHOTS` (default: the system temp folder, `netnet-shots/`), never into the repo.
Two tests put a stand-in file into `agents/` and `connect/` for a moment; a real file already
there is put back afterwards.

| Suite | Covers |
|---|---|
| `func` | Core journeys: add a holding, update it (with currency conversion), undo from Activity, filter |
| `content` | Content rules (design-system §2.1): one figure one place, quiet provenance, no stray cents |
| `scroll` | Scroll kept on re-render; `session_started` / `insights_viewed` events; disabled controls stay tappable |
| `auth` | Sign-up, password, log-in, log-out, resume onboarding |
| `geo` | Where-you-live default from the (simulated) IP; alphabetical list |
| `basics` · `back` · `skip` | The onboarding questions, Back and Skip |
| `agent` | Connect flow: intro route, verification gate, per-platform steps, screenshot slots |
| `packs` | SG, MY and UK packs: types, questions, follow-ups |
| `via` | `via` on `holding_created`; the undecided accessibility state (counts toward net worth, never toward what you could use) |
| `ph` | Chart placeholders ("Need more data") |
| `pc` | Prompt card; a parked agent (Muse) is not reachable |
| `fab` | Floating Update on the holding page, sinking at the bottom |
| `lc` | Reading line charts by hover, touch and keyboard |
| `filt` | Home filter's Don't Show; Insights' own |
| `car` | Home's trend/allocation carousel on a phone; side by side on a computer |
| `notif` | The comeback reminder (PRD J12): Home's one-time card, the browser's prompt, Settings → Notifications, push first and email otherwise, the wording, the daytime window, events; the security email on connecting an agent (J5) |
| `smoke` | Every screen renders without errors (screenshots) |
| `touch` | Every control's tap target is at least 44px on a phone |
| `wide` | Layout at 1600–2560px |
| `ovf` | Every screen at a given size: no sideways scroll, no colliding or wrapping labels |
