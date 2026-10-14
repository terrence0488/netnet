import type { Period } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { summarisePeriods } from './period-summary';

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
    expect(summarisePeriods([period({ change: 100_00 })])).toBeNull();
  });

  it('averages the change over the periods past the first', () => {
    const summary = summarisePeriods([
      period({ change: 1_000_00 }),
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
});
