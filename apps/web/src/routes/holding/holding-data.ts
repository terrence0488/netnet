import type {
  Baseline,
  Change,
  Holding,
  HoldingIn,
  Point,
  Snapshot,
  Universal,
  ValueIn,
  ValueTuple,
} from '@netnet/contracts';
import { baselineChange, series } from '@netnet/core';

/**
 * The holding page's figures from the snapshot: its trend, its change over the selected baseline,
 * and the words around them. No screen computes a figure itself (CONVENTIONS §5): the points and
 * the change come from `core.series` and `core.baselineChange` over this holding alone.
 */

/** This holding as `core` reads it. */
export function holdingInput(row: Holding, universal: Universal): HoldingIn {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    typeId: row.typeId,
    universal,
    currency: row.currency,
    cadenceDays: row.cadenceDays,
    archived: row.archived,
    access: row.access,
    tagIds: row.tagIds,
  };
}

/** The snapshot's compact tuples as `core` reads them. */
export function valueInputs(holdingId: string, tuples: readonly ValueTuple[]): ValueIn[] {
  return tuples.map(([date, amountMinor, currency, baseMinor, source, clientName, id]) => ({
    id,
    holdingId,
    date,
    amountMinor,
    currency,
    baseMinor,
    source,
    clientName,
  }));
}

/**
 * The holding's own trend: one point per day from its first value to today, from the stored
 * conversions. An archived holding keeps its own trend — leaving the totals and the aggregate
 * charts (PRD J2) is `filterHoldings`' rule, and it does not apply to the holding's own page —
 * so the figure is computed with the archive flag off.
 */
export function holdingTrend(
  snapshot: Snapshot,
  holding: Holding,
  universal: Universal,
  today: string,
): Point[] {
  const input = { ...holdingInput(holding, universal), archived: false };
  const values = valueInputs(holding.id, snapshot.values[holding.id] ?? []);
  return series(values, [input], { to: today }, 'day');
}

/** The change baseline when none is selected: the agent's default context baseline. */
export const HOLDING_BASELINE_DEFAULT: Baseline = 'last_month';

/** The holding's change over the selected baseline, measured against the same thing as Home. */
export function holdingChange(
  snapshot: Snapshot,
  holding: Holding,
  universal: Universal,
  today: string,
): Change {
  const input = { ...holdingInput(holding, universal), archived: false };
  const values = valueInputs(holding.id, snapshot.values[holding.id] ?? []);
  return baselineChange(
    values,
    [input],
    snapshot.prefs.baseline ?? HOLDING_BASELINE_DEFAULT,
    today,
  );
}

/** The six baselines as the holding page names them (PRD J4). */
export const BASELINE_LABELS: Record<Baseline, string> = {
  initial: 'Initial value',
  last_update: 'Last update',
  last_month: 'Last month',
  last_quarter: 'Last quarter',
  year_start: 'Jan 1',
  last_year: 'Last year',
};

/** `+12.3%`, `−0.7%`: a change percent with its sign (the true minus) and at most one decimal. */
export function formatPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const text = Math.abs(rounded).toFixed(1).replace(/\.0$/, '');
  return `${rounded < 0 ? '−' : '+'}${text}%`;
}

/**
 * How the holding page words its staleness (PRD J9): "Updated today" while fresh, "Stale ·
 * updated 6 weeks ago" past its cadence. `age` is `ageOf(latestDate, today)`.
 */
export function stalenessText(stale: boolean, age: string): string {
  return stale ? `Stale · updated ${age}` : `Updated ${age}`;
}
