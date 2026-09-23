# NetNet UI Mockups — Reference

> ## ⚠️ The mockup images are NOT in this repository
>
> They were removed, and purged from git history, because they contain the Founder's **real
> personal financial data** — full name, email, actual net worth, itemised holdings and several
> years of value history.
>
> **They still exist. Ask the Founder for them whenever you need the visual reference** — they are
> happy to share them directly. Do not treat their absence as "no design exists", and do not
> invent a design to fill the gap.
>
> This file is the written substitute: it records everything the boards establish. It is
> deliberately detailed for that reason, but it is not a replacement for looking at them.
>
> **If the Founder shares them again, do not commit them.** `.gitignore` blocks image files in
> this directory to prevent exactly that. Keep them local.

Source: Founder-supplied iOS mockups, 2026-09-22. **Design and functional reference only.**
The product name and any legacy/compat settings shown in them are obsolete — the product is
**NetNet**, and the mockups predate the MCP layer, which they do not show at all.

Target for v1 is a **mobile-first responsive web app**, not native. These frames define the
information architecture, interactions and visual language to reproduce on web.

| Board | Frames |
|---|---|
| **Home tab — landing** | Line chart · Pie by type · Pie assets-vs-liabilities · Sort By · Comparison Options · Filters · Add Tracking menu · New Asset · New Liability |
| **Home tab — holding detail** | Holding line chart · Bar chart (period change) · Add Value · Expanded value row · Edit Value · Three-dots menu (Edit/Archive/Delete) · Edit Asset |
| **Insights tab** | Quarterly · Yearly · Monthly views · Insights Filters (note: adds a "Don't Show" exclusion section the Home filter lacks) |
| **Account tab** | Account · General Settings · View Settings · Manage Types · Manage Tags |

## What the mockups establish

- **Snapshot data model.** A holding = name + type + tags + currency, plus a dated series of
  hand-entered values. Net worth = sum of latest value per non-archived holding.
- **Comparison baseline.** Every % shown is relative to a user-chosen baseline
  (Initial Value / Last Update / Last Month / Last Quarter / Jan 1 / Last Year).
- **Multi-currency.** Values carry an original currency and a default-currency conversion;
  both are kept on each history entry.
- **User-defined taxonomy.** Types and Tags are user-managed, not fixed enums.
- **Archive, not just delete.** Archived holdings are excluded from totals but retained.
- **Staleness is first-class.** "Updated 2 years ago" labels and Reminders exist because
  manual entry is the premise and going stale is the main failure mode.

## Deliberately NOT carried over

- The old product name and Pro/membership tier (monetisation is deferred).
- "Show Legacy Trend Graph" and "Use Old Logic in New Trend Graph" — compat cruft.
- Haptic feedback (native-only concern).
