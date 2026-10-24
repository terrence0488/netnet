import type { Period } from '@netnet/contracts';

/** What Insights' summary line reads: the average change over the periods shown. */
export interface PeriodSummary {
  /** How many periods the average covers: those given whose change is not null. */
  readonly count: number;
  /** The mean change in base-currency minor units, half away from zero. */
  readonly avgAbs: number;
  /**
   * The mean change as a percent of the opening total's size, from the exact sum, so it has the
   * mean's sign and never the opposite of `avgAbs`'s; null when that total is 0.
   */
  readonly avgPct: number | null;
}

/** The exact sum of whole minor units (money never floats). */
function sumMinor(values: readonly number[]): bigint {
  let sum = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${value} is not a whole number of minor units.`);
    }
    sum += BigInt(value);
  }
  return sum;
}

/** `sum ÷ count` in whole minor units, exactly, half away from zero. */
function meanMinor(sum: bigint, count: number): number {
  const divisor = BigInt(count);
  const quotient = sum / divisor;
  const remainder = sum % divisor;
  const twice = 2n * (remainder >= 0n ? remainder : -remainder);
  if (twice < divisor) return Number(quotient);
  return Number(sum < 0n ? quotient - 1n : quotient + 1n);
}

/**
 * The average period (PRD J11, the summary line): the mean change over every period given that
 * has one — in the full view the series' first never does, while a ranged view's oldest does —
 * and that mean as a percent of the opening total, the end value of the period before the first
 * averaged one, in absolute value like each period's own percent. The amount and the percent
 * then describe the same window and always agree in sign, which a mean of the periods' percents
 * would not. Null when no period has a change, so the screen says what is needed instead.
 */
export function summarisePeriods(periods: readonly Period[]): PeriodSummary | null {
  const averaged = periods.filter(
    (period): period is Period & { change: number } => period.change !== null,
  );
  const first = averaged[0];
  if (first === undefined) return null;
  const count = averaged.length;
  const sum = sumMinor(averaged.map((period) => period.change));
  const opening = Math.abs(first.endValue - first.change);
  return {
    count,
    avgAbs: meanMinor(sum, count),
    avgPct: opening === 0 ? null : (Number(sum) / count / opening) * 100,
  };
}
