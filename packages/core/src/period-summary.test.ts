import type { Period } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { summarisePeriods } from './period-summary';
import { periods } from './periods';
import { PERIOD_HOLDINGS, PERIOD_VALUES } from './testing/fixtures';

function period(over: Partial<Period> = {}): Period {
  return {
    start: '2026-01-01',
    end: '2026-01-31',
    endValue: 0,
    change: 0,
    changePct: null,
    carried: false,
    drivers: [],
    ...over,
  };
}

describe('summarisePeriods', () => {
  it('is null with no periods, or only the first', () => {
    expect(summarisePeriods([])).toBeNull();
    expect(summarisePeriods([period({ change: null })])).toBeNull();
    // The oldest period a range shows has a change, but nothing shown to compare it with.
    expect(summarisePeriods([period({ change: 100_00 })])).toBeNull();
  });

  it('averages the change over the periods past the first', () => {
    const summary = summarisePeriods([
      period({ change: null }),
      period({ change: 100_00, changePct: 10 }),
      period({ change: 300_00, changePct: 27.3 }),
    ]);
    expect(summary).toStrictEqual({ count: 2, avgAbs: 200_00, avgPct: 18.65 });
  });

  it('counts a missing % as 0, like the prototype', () => {
    const summary = summarisePeriods([
      period({ change: 0 }),
      period({ change: 100_00, changePct: null }),
    ]);
    expect(summary).toStrictEqual({ count: 1, avgAbs: 100_00, avgPct: 0 });
  });

  it('rounds the money mean half away from zero, exactly', () => {
    expect(summarisePeriods([period(), period({ change: 1 }), period({ change: 2 })])?.avgAbs).toBe(
      2,
    );
    expect(
      summarisePeriods([period(), period({ change: -1 }), period({ change: -2 })])?.avgAbs,
    ).toBe(-2);
  });

  it('averages the engine’s periods past the first, to the cent, in every view', () => {
    const summary = (view: 'monthly' | 'quarterly' | 'yearly') =>
      summarisePeriods(periods(PERIOD_VALUES, PERIOD_HOLDINGS, view, '2026-04-15'));
    expect(summary('monthly')).toStrictEqual({
      count: 17,
      avgAbs: -113_23,
      avgPct: 9.300317118193922,
    });
    expect(summary('quarterly')).toStrictEqual({
      count: 6,
      avgAbs: 1_012_52,
      avgPct: 53.50397837935586,
    });
    expect(summary('yearly')).toStrictEqual({
      count: 2,
      avgAbs: 3_037_55,
      avgPct: 106.1251274177042,
    });
  });
});
