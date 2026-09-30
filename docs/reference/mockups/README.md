# NetNet UI Mockups — Reference

> ## ⚠️ The mockup images are NOT in this repository
>
> They contain the Founder's **real personal financial data** — full name, email, actual net worth,
> itemised holdings and several years of value history — and have been purged from git history.
>
> **Ask the Founder for them whenever you need them**; they are happy to share them directly. Do not
> treat their absence as "no design exists", and do not invent a design to fill the gap.
>
> **If the Founder shares them, do not commit them.** `.gitignore` blocks image files in this
> directory to prevent exactly that. Keep them local.

Source: Founder-supplied iOS mockups. **A functional brief only**: information architecture, flows
and controls. The visual design is `docs/02-prototype/design-system.md`, and the prototype is the
behavioural reference. The mockups predate the MCP layer and use an obsolete product name.

| Board | Frames |
|---|---|
| **Home tab — landing** | Line chart · Pie by type · Pie assets-vs-liabilities · Sort By · Comparison Options · Filters · Add Tracking menu · New Asset · New Liability |
| **Home tab — holding detail** | Holding line chart · Bar chart (period change) · Add Value · Expanded value row · Edit Value · Three-dots menu (Edit/Archive/Delete) · Edit Asset |
| **Insights tab** | Quarterly · Yearly · Monthly views · Insights Filters (with a "Don't Show" exclusion section) |
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
- **Staleness is first-class.** Manual entry is the premise, so going stale is the main failure
  mode.

## Not carried over

The old product name and Pro/membership tier; "Show Legacy Trend Graph" and "Use Old Logic in New
Trend Graph"; haptic feedback; Net Worth Goals; notes on a value and marking a value on a chart.
