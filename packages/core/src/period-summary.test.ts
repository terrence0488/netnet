import type { Period } from '@netnet/contracts';
import fc from 'fast-check';
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

/**
 * Consecutive periods, oldest first, opening at `opening` and moving by each of `changes`; with
 * `first`, led by the series' first period, which ends at the opening and has no change.
 */
function run(opening: number, changes: readonly number[], first = false): Period[] {
  const out: Period[] = first ? [period({ endValue: opening, change: null })] : [];
  let previous = opening;
  for (const change of changes) {
    const endValue = previous + change;
    out.push(
      period({
        endValue,
        change,
        changePct: previous === 0 ? null : (change / Math.abs(previous)) * 100,
      }),
    );
    previous = endValue;
  }
  return out;
}

describe('summarisePeriods', () => {
  it('is null when no period has a change', () => {
    expect(summarisePeriods([])).toBeNull();
    expect(summarisePeriods([period({ change: null })])).toBeNull();
  });

  it('reads the report’s months as −$140 (−1.6%), net worth falling from $9,000 to $8,300', () => {
    // The mean of the months' own percents (−44.4, +26, +15.9, 0, +13.7) was +2.2%.
    const months = run(9_000_00, [-4_000_00, 1_300_00, 1_000_00, 0, 1_000_00]);
    const expected = { count: 5, avgAbs: -140_00, avgPct: expect.closeTo(-1.5556, 4) as number };
    expect(summarisePeriods(months)).toStrictEqual(expected);
    // The full view leads with the series' first period, which has nothing to compare with.
    expect(
      summarisePeriods(run(9_000_00, [-4_000_00, 1_300_00, 1_000_00, 0, 1_000_00], true)),
    ).toStrictEqual(expected);
  });

  it('averages a ranged view’s oldest period, which has an earlier one to compare with', () => {
    expect(summarisePeriods(run(1_000_00, [100_00]))).toStrictEqual({
      count: 1,
      avgAbs: 100_00,
      avgPct: 10,
    });
    expect(summarisePeriods(run(1_000_00, [100_00, 300_00]))).toStrictEqual({
      count: 2,
      avgAbs: 200_00,
      avgPct: 20,
    });
  });

  it('leaves out the series’ first period in the full view', () => {
    expect(summarisePeriods(run(1_000_00, [100_00, 300_00], true))).toStrictEqual({
      count: 2,
      avgAbs: 200_00,
      avgPct: 20,
    });
  });

  it('measures against the opening total’s size, so paying down a debt reads as a gain', () => {
    expect(summarisePeriods(run(-8_000_00, [2_000_00, 1_000_00]))).toStrictEqual({
      count: 2,
      avgAbs: 1_500_00,
      avgPct: 18.75,
    });
    expect(summarisePeriods(run(-8_000_00, [-2_000_00]))).toStrictEqual({
      count: 1,
      avgAbs: -2_000_00,
      avgPct: -25,
    });
  });

  it('has no percent when the opening total is 0', () => {
    expect(summarisePeriods(run(0, [500_00, 500_00]))).toStrictEqual({
      count: 2,
      avgAbs: 500_00,
      avgPct: null,
    });
    expect(summarisePeriods(run(0, [500_00], true))).toStrictEqual({
      count: 1,
      avgAbs: 500_00,
      avgPct: null,
    });
  });

  it('works the percent from the exact sum, not the rounded mean', () => {
    // A mean of 1⅔ minor units rounds to 2; the percent stays on 1⅔ of the opening 100.
    const summary = summarisePeriods(run(100, [1, 1, 3]));
    expect(summary?.avgAbs).toBe(2);
    expect(summary?.avgPct).toBeCloseTo(5 / 3, 12);
  });

  it('rounds the money mean half away from zero, exactly', () => {
    expect(summarisePeriods(run(0, [1, 2]))?.avgAbs).toBe(2);
    expect(summarisePeriods(run(0, [-1, -2]))?.avgAbs).toBe(-2);
    expect(summarisePeriods(run(0, [1, -2, 0]))?.avgAbs).toBe(0);
  });

  it('refuses a change that is not whole minor units', () => {
    expect(() => summarisePeriods([period({ change: 0.5 })])).toThrow(RangeError);
  });

  it('averages the engine’s periods past the first, to the cent, in every view', () => {
    const summary = (view: 'monthly' | 'quarterly' | 'yearly') =>
      summarisePeriods(periods(PERIOD_VALUES, PERIOD_HOLDINGS, view, '2026-04-15'));
    // Net worth opens at $5,000.37 in November 2024 (−$2,999.63 at the end of 2024, owing the
    // car loan) and ends at $3,075.47.
    expect(summary('monthly')).toStrictEqual({
      count: 17,
      avgAbs: -113_23,
      avgPct: expect.closeTo((-1_924_90 / 17 / 5_000_37) * 100, 10) as number,
    });
    expect(summary('quarterly')).toStrictEqual({
      count: 6,
      avgAbs: 1_012_52,
      avgPct: expect.closeTo((6_075_10 / 6 / 2_999_63) * 100, 10) as number,
    });
    expect(summary('yearly')).toStrictEqual({
      count: 2,
      avgAbs: 3_037_55,
      avgPct: expect.closeTo((6_075_10 / 2 / 2_999_63) * 100, 10) as number,
    });
  });
});

/** Series that rise, fall and cross zero: an opening total and up to two years of changes. */
const series = fc.record({
  opening: fc.oneof(fc.constant(0), fc.integer({ min: -(10 ** 9), max: 10 ** 9 })),
  changes: fc.array(
    fc.oneof(
      fc.constant(0),
      fc.integer({ min: -3, max: 3 }),
      fc.integer({ min: -(10 ** 9), max: 10 ** 9 }),
    ),
    { minLength: 1, maxLength: 24 },
  ),
  first: fc.boolean(),
});

describe('summarisePeriods properties', () => {
  it('covers every period with a change, and its percent never disagrees with its amount', () => {
    fc.assert(
      fc.property(series, ({ opening, changes, first }) => {
        const summary = summarisePeriods(run(opening, changes, first));
        expect(summary).not.toBeNull();
        if (summary === null) return;
        const { count, avgAbs, avgPct } = summary;
        const sum = changes.reduce((a, b) => a + b, 0);
        expect(count).toBe(changes.length);
        expect(Math.abs(avgAbs - sum / count)).toBeLessThanOrEqual(0.5);
        if (opening === 0) {
          expect(avgPct).toBeNull();
          return;
        }
        // The percent has the exact mean's sign, and the rounded amount never has the other one.
        expect(Math.sign(avgPct ?? NaN)).toBe(Math.sign(sum));
        if (avgAbs !== 0) expect(Math.sign(avgPct ?? NaN)).toBe(Math.sign(avgAbs));
        const exact = (sum / count / Math.abs(opening)) * 100;
        expect(Math.abs((avgPct ?? NaN) - exact)).toBeLessThanOrEqual(Math.abs(exact) * 1e-12);
      }),
    );
  });

  it('agrees in sign over series that end above and below where they started', () => {
    // Rising, falling, and crossing zero either way; the old mean of percents got two wrong.
    const cases: [number, number[], 1 | -1][] = [
      [1_000_00, [100_00, 200_00, 50_00], 1],
      [1_000_00, [-100_00, -200_00, -50_00], -1],
      [-500_00, [300_00, 400_00], 1],
      [500_00, [-400_00, -300_00], -1],
      [9_000_00, [-4_000_00, 1_300_00, 1_000_00, 0, 1_000_00], -1],
      [100_00, [10_000_00, -10_050_00], -1],
    ];
    for (const [opening, changes, sign] of cases) {
      const summary = summarisePeriods(run(opening, changes));
      expect(Math.sign(summary?.avgAbs ?? NaN)).toBe(sign);
      expect(Math.sign(summary?.avgPct ?? NaN)).toBe(sign);
    }
  });
});
