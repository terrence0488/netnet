import type { RangeOption } from './RangeBar';

/**
 * A trend's range bar (PRD J4): All, the last 6 months, the year to date, or the last 1, 2, 4
 * or 8 years. Each value is the months back `core.trendRangeStart` reads: 0 is everything, -1
 * the year to date. Home and the holding page share the one bar.
 */
export const TREND_RANGES: readonly RangeOption<number>[] = [
  { label: 'All', value: 0 },
  { label: '6M', value: 6 },
  { label: 'YTD', value: -1 },
  { label: '1Y', value: 12 },
  { label: '2Y', value: 24 },
  { label: '4Y', value: 48 },
  { label: '8Y', value: 96 },
];
