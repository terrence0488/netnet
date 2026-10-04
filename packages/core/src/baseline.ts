import type { Baseline, Change, HoldingFilter, HoldingIn, ValueIn } from '@netnet/contracts';
import { addMonths, bucketEnd } from './dates';
import { filterHoldings } from './filter';
import { compareValues } from './position';

type CalendarBaseline = Exclude<Baseline, 'initial' | 'last_update'>;

/**
 * The date a calendar baseline compares with (PRD J4): the end of last month, of the month three
 * months back or of the same month last year, or 1 January.
 */
export function baselineDate(baseline: CalendarBaseline, today: string): string {
  switch (baseline) {
    case 'last_month':
      return bucketEnd(addMonths(today, -1), 'month');
    case 'last_quarter':
      return bucketEnd(addMonths(today, -3), 'month');
    case 'year_start':
      return `${today.slice(0, 4)}-01-01`;
    case 'last_year':
      return bucketEnd(addMonths(today, -12), 'month');
  }
}

/** The last of `values` (in value order) dated on or before `date`. */
function lastOnOrBefore(values: readonly ValueIn[], date: string): ValueIn | undefined {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i]!.date <= date) return values[i];
  }
  return undefined;
}

/**
 * The change from a baseline to today (PRD J4), worked out per holding and summed, so the total
 * and every row are measured against the same thing. For one holding's own change, pass just
 * that holding. Each holding counted (never archived; only those the filter keeps) compares its
 * latest value on or before `today` with: its first value (`initial`); its value before that
 * (`last_update`); or its latest value on or before the baseline's date (the calendar
 * baselines). A holding first valued after that date compares with its first value, so adding
 * it is never counted as growth. Amounts are each value's stored `baseMinor`, negative for a
 * liability.
 *
 * `since` is the baseline's date when some holding had a value by then; otherwise, and for
 * `initial` and `last_update`, the earliest value compared with. With nothing to compare (no
 * value by today, or no holding with an earlier value), every figure is null.
 */
export function baselineChange(
  values: readonly ValueIn[],
  holdings: readonly HoldingIn[],
  baseline: Baseline,
  today: string,
  filter?: HoldingFilter,
): Change {
  const date =
    baseline === 'initial' || baseline === 'last_update'
      ? undefined
      : baselineDate(baseline, today);
  const counted = filterHoldings(holdings, filter);
  const tracks = new Map(counted.map((h) => [h.id, [] as ValueIn[]]));
  for (const value of values) {
    if (value.date <= today) tracks.get(value.holdingId)?.push(value);
  }

  let now = 0;
  let base = 0;
  let valuedByDate = false;
  let earliest: string | undefined;
  for (const holding of counted) {
    const track = tracks.get(holding.id)!.sort(compareValues);
    const latest = track.at(-1);
    if (!latest) continue;
    const asOfDate = date === undefined ? undefined : lastOnOrBefore(track, date);
    const from =
      baseline === 'initial'
        ? track[0]!
        : baseline === 'last_update'
          ? (track.at(-2) ?? latest)
          : (asOfDate ?? track[0]!);
    const sign = holding.kind === 'liability' ? -1 : 1;
    now += sign * latest.baseMinor;
    base += sign * from.baseMinor;
    if (asOfDate) valuedByDate = true;
    if (from !== latest && (earliest === undefined || from.date < earliest)) earliest = from.date;
  }

  const since = valuedByDate ? date! : earliest;
  if (since === undefined) return { baseline, since: null, amount: null, pct: null };
  const amount = now - base;
  return {
    baseline,
    since,
    amount,
    pct: base === 0 ? null : (amount / Math.abs(base)) * 100,
  };
}
