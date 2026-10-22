# P3 Feedback

Source: the Founder, after a hands-on check of the test report's issue 1 on production,
2026-10-22. Input to `stage: triage P3`, together with `docs/phases/P3/test-report.md`.

## Governing rule (Founder)

Undo is removed. Every change moves forward: a person who makes a mistake corrects it with
another change, on the web or through their agent. Undo added too many edge cases and too much
complexity for what it is worth.

## Items

Triage sets each item's type and route.

| # | Item | Type | Route |
|---|---|---|---|
| 1 | Remove undo everywhere: undo of an entry and of an agent turn, on the web (Activity's Undo, `POST /api/activity/…/undo`) and through the agent (the MCP `undo` tool) | | |
| 2 | Activity stays as a read-only log: what changed, old → new, who or which agent, and when. Proposed in the session and not objected to; confirm at triage | | |
| 3 | Issue 1 shrinks: the broken undo goes with item 1. A currency change still writes one Activity row per value, each reading "$X → $X"; decide whether it shows as one entry | | |
| 4 | Issue 5 falls away: `value_undone` goes with undo, and M5 measures corrections only (`value_corrected`) | | |

## What the decision reaches

For triage to rewrite in place and brief:

- **PRD:** J7 (now see what changed, no undo), N3 ("auditable and reversible" → auditable), M5,
  the §3.5 event list (`value_undone`), and the P3 rows that cite undo.
- **Plan:** §P3 checkpoint 1 and its J7 row.
- **Architecture:** §6.8 (undo rules, batches), §7.2 (the two undo endpoints), §7.3
  (`Ledger.undo`), §7.4 (the `undo` tool and its mention in `list_activity`), §7.7
  (`value_undone`).
- **Code:** `Ledger.undo` and its row-version conflict checks, the REST and MCP routes, the
  Activity screen's Undo buttons, the `value_undone` event, and the MCP tests that expect 19
  tools (`apps/api/test/mcp/protocol.test.ts`, `lifecycle.test.ts`).
