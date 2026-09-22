# NetNet UI Mockups — Reference

Source: Founder-supplied iOS mockups, 2026-09-22. **Design and functional reference only.**
The product name and any legacy/compat settings shown in them are obsolete — the product is
**NetNet**, and the mockups predate the MCP layer, which they do not show at all.

Target for v1 is a **mobile-first responsive web app**, not native. These frames define the
information architecture, interactions and visual language to reproduce on web.

| File | Frames |
|---|---|
| `01-home-landing.webp` | Line chart · Pie by type · Pie assets-vs-liabilities · Sort By · Comparison Options · Filters · Add Tracking menu · New Asset · New Liability |
| `02-home-detail.webp` | Holding line chart · Bar chart (period change) · Add Value · Expanded value row · Edit Value · Three-dots menu (Edit/Archive/Delete) · Edit Asset |
| `03-insights.webp` | Quarterly · Yearly · Monthly views · Insights Filters (note: adds a "Don't Show" exclusion section the Home filter lacks) |
| `04-account.webp` | Account · General Settings · View Settings · Manage Types · Manage Tags |

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
