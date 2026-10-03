import type { Point } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { baselineChange } from './baseline';
import { series } from './series';
import { holding, value } from './testing/fixtures';

const TODAY = '2026-09-27';
const holdings = [holding('cash'), holding('fund')];
const values = [
  value('cash', '2025-08-01', 100_000),
  value('fund', '2025-12-15', 50_000),
  value('cash', '2026-03-31', 120_000),
  value('cash', '2026-06-20', 130_000),
  value('fund', '2026-08-27', 60_000),
  value('cash', '2026-09-20', 125_000),
  value('fund', '2026-09-25', 60_000),
];
const daily = series(values, holdings, { to: TODAY }, 'day');

describe('baselineChange', () => {
  it.each([
    // The first point: 2025-08-01, 1000.00.
    ['initial', '2025-08-01', 85_000, 85],
    // The total last moved on 2026-09-20 (2026-09-25 recorded the same figure); before it,
    // 1900.00 since 2026-08-27.
    ['last_update', '2026-08-27', -5000, -2.631578947368421],
    // A month before today: 2026-08-27, when the fund went to 600.00.
    ['last_month', '2026-08-27', -5000, -2.631578947368421],
    ['last_quarter', '2026-06-27', 5000, 2.7777777777777777],
    ['year_start', '2026-01-01', 35_000, 23.333333333333332],
    ['last_year', '2025-09-27', 85_000, 85],
  ] as const)('compares today with %s (since %s)', (baseline, since, amount, pct) => {
    expect(baselineChange(daily, baseline, TODAY)).toStrictEqual({
      baseline,
      since,
      amount,
      pct,
    });
  });

  it('uses the first point when the series starts after the baseline', () => {
    const recent = series(values, holdings, { from: '2026-09-01', to: TODAY }, 'day');
    expect(baselineChange(recent, 'last_year', TODAY)).toMatchObject({
      since: '2026-09-01',
      amount: -5000,
    });
  });

  it("takes today's figure from the last point on or before today", () => {
    const later = series(values, holdings, { to: '2026-12-31' }, 'month');
    expect(baselineChange(later, 'last_quarter', '2026-08-31')).toStrictEqual({
      baseline: 'last_quarter',
      since: '2026-05-31',
      amount: 20_000,
      pct: 11.76470588235294,
    });
  });

  it('measures from the start of the run before the last change', () => {
    const points: Point[] = [
      { date: '2026-01-01', total: 100, carried: false },
      { date: '2026-01-02', total: 200, carried: false },
      { date: '2026-01-03', total: 200, carried: true },
      { date: '2026-01-04', total: 150, carried: false },
      { date: '2026-01-05', total: 150, carried: true },
    ];
    expect(baselineChange(points, 'last_update', '2026-01-05')).toMatchObject({
      since: '2026-01-02',
      amount: -50,
    });
    const flat = points.map((p) => ({ ...p, total: 100 }));
    expect(baselineChange(flat, 'last_update', '2026-01-05')).toMatchObject({
      since: '2026-01-01',
      amount: 0,
      pct: 0,
    });
  });

  it('has no percentage against a zero baseline, and measures against its size', () => {
    const points: Point[] = [
      { date: '2026-01-01', total: 0, carried: false },
      { date: '2026-01-02', total: -200, carried: false },
      { date: '2026-01-03', total: -100, carried: false },
    ];
    expect(baselineChange(points, 'initial', '2026-01-03')).toStrictEqual({
      baseline: 'initial',
      since: '2026-01-01',
      amount: -100,
      pct: null,
    });
    expect(baselineChange(points, 'last_update', '2026-01-03')).toMatchObject({
      amount: 100,
      pct: 50,
    });
  });

  it('is all null with nothing earlier than today to compare with', () => {
    const none = { baseline: 'last_month', since: null, amount: null, pct: null };
    expect(baselineChange([], 'last_month', TODAY)).toStrictEqual(none);
    expect(baselineChange(daily.slice(-1), 'last_month', TODAY)).toStrictEqual(none);
    expect(baselineChange(daily, 'last_month', '2020-01-01')).toStrictEqual(none);
    expect(baselineChange([], 'last_update', TODAY)).toMatchObject({ amount: null });
  });
});
