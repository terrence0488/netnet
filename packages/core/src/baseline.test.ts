import { describe, expect, it } from 'vitest';
import { baselineChange, baselineDate } from './baseline';
import { holding, liability, value } from './testing/fixtures';

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

describe('baselineDate', () => {
  it.each([
    // Architecture §7.5's example: as of 2026-09-27, last month is since 2026-08-31.
    ['last_month', '2026-09-27', '2026-08-31'],
    ['last_month', '2026-03-31', '2026-02-28'],
    ['last_month', '2028-03-15', '2028-02-29'],
    ['last_month', '2026-01-10', '2025-12-31'],
    ['last_quarter', '2026-09-27', '2026-06-30'],
    ['last_quarter', '2026-05-31', '2026-02-28'],
    ['year_start', '2026-09-27', '2026-01-01'],
    ['last_year', '2026-09-27', '2025-09-30'],
    ['last_year', '2028-02-29', '2027-02-28'],
  ] as const)('%s from %s is %s', (baseline, today, date) => {
    expect(baselineDate(baseline, today)).toBe(date);
  });
});

describe('baselineChange', () => {
  it.each([
    // Each holding from its first value: cash 1000.00 → 1250.00, fund 500.00 → 600.00.
    ['initial', '2025-08-01', 35_000, 23.333333333333332],
    // Each holding from its value before the latest: cash 1300.00, fund 600.00.
    ['last_update', '2026-06-20', -5000, -2.631578947368421],
    // As of 2026-08-31: cash 1300.00 (2026-06-20), fund 600.00 (2026-08-27).
    ['last_month', '2026-08-31', -5000, -2.631578947368421],
    // As of 2026-06-30: cash 1300.00, fund 500.00.
    ['last_quarter', '2026-06-30', 5000, 2.7777777777777777],
    ['year_start', '2026-01-01', 35_000, 23.333333333333332],
    // As of 2025-09-30 cash was 1000.00; the fund was first valued later, so it counts from its
    // first value, 500.00, and adding it is not growth.
    ['last_year', '2025-09-30', 35_000, 23.333333333333332],
  ] as const)('compares today with %s (since %s)', (baseline, since, amount, pct) => {
    expect(baselineChange(values, holdings, baseline, TODAY)).toStrictEqual({
      baseline,
      since,
      amount,
      pct,
    });
  });

  it('never counts a holding added after the baseline as growth', () => {
    // Gold, first valued 400.00 after 2026-08-31, adds only its own 10.00 rise.
    const added = [
      ...values,
      value('gold', '2026-09-10', 40_000),
      value('gold', '2026-09-26', 41_000),
    ];
    expect(
      baselineChange(added, [...holdings, holding('gold')], 'last_month', TODAY),
    ).toStrictEqual({
      baseline: 'last_month',
      since: '2026-08-31',
      amount: -4000,
      pct: -1.7391304347826086,
    });
  });

  it('gives one holding its own change, and leaves out archived and filtered holdings', () => {
    expect(baselineChange(values, [holding('cash')], 'last_month', TODAY)).toMatchObject({
      amount: -5000,
      pct: -3.8461538461538463,
    });
    const archived = [holding('cash'), holding('fund', { archived: true })];
    expect(baselineChange(values, archived, 'initial', TODAY)).toMatchObject({ amount: 25_000 });
    expect(
      baselineChange(values, holdings, 'initial', TODAY, { hideHoldingIds: ['cash'] }),
    ).toMatchObject({ since: '2025-12-15', amount: 10_000, pct: 20 });
  });

  it('counts a liability against net worth', () => {
    const owed = [
      ...values,
      value('loan', '2026-08-01', 200_000),
      value('loan', '2026-09-15', 190_000),
    ];
    // Assets fell 50.00; the loan fell 100.00. Base: 1900.00 − 2000.00 = −100.00.
    expect(
      baselineChange(owed, [...holdings, liability('loan')], 'last_month', TODAY),
    ).toStrictEqual({ baseline: 'last_month', since: '2026-08-31', amount: 5000, pct: 50 });
  });

  it('takes the latest value on or before today, never a later one', () => {
    const later = [...values, value('cash', '2026-10-15', 999_000)];
    expect(baselineChange(later, holdings, 'last_update', TODAY)).toMatchObject({
      since: '2026-06-20',
      amount: -5000,
    });
  });

  it('dates the change from the earliest value compared when none is as old as the baseline', () => {
    const recent = [
      value('cash', '2026-09-05', 100_000),
      value('cash', '2026-09-20', 110_000),
      value('fund', '2026-09-10', 50_000),
    ];
    expect(baselineChange(recent, holdings, 'last_month', TODAY)).toStrictEqual({
      baseline: 'last_month',
      since: '2026-09-05',
      amount: 10_000,
      pct: 6.666666666666667,
    });
  });

  it('shows no change, not nothing, for holdings unchanged since the baseline', () => {
    const still = [value('cash', '2026-07-01', 100_000)];
    expect(baselineChange(still, holdings, 'last_month', TODAY)).toStrictEqual({
      baseline: 'last_month',
      since: '2026-08-31',
      amount: 0,
      pct: 0,
    });
  });

  it('has no percentage against a zero baseline, and measures against its size', () => {
    const fromZero = [value('cash', '2026-01-01', 0), value('cash', '2026-09-01', 10_000)];
    expect(baselineChange(fromZero, holdings, 'initial', TODAY)).toStrictEqual({
      baseline: 'initial',
      since: '2026-01-01',
      amount: 10_000,
      pct: null,
    });
    const owed = [value('loan', '2026-01-01', 20_000), value('loan', '2026-09-01', 10_000)];
    expect(baselineChange(owed, [liability('loan')], 'initial', TODAY)).toMatchObject({
      amount: 10_000,
      pct: 50,
    });
  });

  it('is all null with nothing earlier than today to compare with', () => {
    const none = { baseline: 'last_month', since: null, amount: null, pct: null };
    expect(baselineChange([], holdings, 'last_month', TODAY)).toStrictEqual(none);
    expect(baselineChange(values, holdings, 'last_month', '2020-01-01')).toStrictEqual(none);
    const once = [value('cash', '2026-09-20', 100_000), value('fund', '2026-09-25', 50_000)];
    expect(baselineChange(once, holdings, 'last_month', TODAY)).toStrictEqual(none);
    expect(baselineChange(once, holdings, 'initial', TODAY)).toMatchObject({ amount: null });
    expect(baselineChange(once, holdings, 'last_update', TODAY)).toMatchObject({ amount: null });
  });
});
