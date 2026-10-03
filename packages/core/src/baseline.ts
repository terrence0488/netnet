import type { Baseline, Change, Point } from '@netnet/contracts';
import { addMonths } from './dates';

/** The index of the last point dated on or before `date`, or -1. Points are in date order. */
function lastOnOrBefore(points: readonly Point[], date: string): number {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i]!.date <= date) return i;
  }
  return -1;
}

/**
 * The point before the latest change in the total, at the start of its run of equal totals: what
 * the picture was before the last update that moved it.
 */
function beforeLastUpdate(points: readonly Point[], now: number): number {
  let i = now;
  while (i > 0 && points[i]!.total === points[i - 1]!.total) i -= 1;
  if (i === 0) return 0;
  let start = i - 1;
  while (start > 0 && points[start - 1]!.total === points[start]!.total) start -= 1;
  return start;
}

/** The date a calendar baseline compares with (PRD J4): relative to today, or 1 January. */
function baselineDate(baseline: Exclude<Baseline, 'initial' | 'last_update'>, today: string) {
  switch (baseline) {
    case 'last_month':
      return addMonths(today, -1);
    case 'last_quarter':
      return addMonths(today, -3);
    case 'year_start':
      return `${today.slice(0, 4)}-01-01`;
    case 'last_year':
      return addMonths(today, -12);
  }
}

/**
 * The change from a baseline to today (PRD J4), on a series from `series` (a `day` series gives
 * exact dates). Today's figure is the last point on or before `today`. `initial` compares with the
 * first point; `last_update` with the total before the latest change; the calendar baselines with
 * the last point on or before their date, or the first point when the series starts later. With
 * nothing earlier than today's point, every figure is null.
 */
export function baselineChange(
  points: readonly Point[],
  baseline: Baseline,
  today: string,
): Change {
  const now = lastOnOrBefore(points, today);
  const base =
    baseline === 'initial'
      ? 0
      : baseline === 'last_update'
        ? beforeLastUpdate(points, now)
        : Math.max(0, lastOnOrBefore(points, baselineDate(baseline, today)));
  const from = points[base];
  const to = points[now];
  if (now <= base || !from || !to) return { baseline, since: null, amount: null, pct: null };
  const amount = to.total - from.total;
  return {
    baseline,
    since: from.date,
    amount,
    pct: from.total === 0 ? null : (amount / Math.abs(from.total)) * 100,
  };
}
