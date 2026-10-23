import type { Period } from '@netnet/contracts';

/** What Insights' summary line reads: the average change over the comparable periods. */
export interface PeriodSummary {
  /** How many periods the average covers: those with an earlier period to compare with. */
  readonly count: number;
  /** The mean absolute change in base-currency minor units, half away from zero. */
  readonly avgAbs: number;
  /** The mean % change; a period without one (its previous total is 0) counts as 0. */
  readonly avgPct: number;
}

/** The mean of whole minor units, exactly, half away from zero (money never floats). */
function meanMinor(values: readonly number[]): number {
  let sum = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${value} is not a whole number of minor units.`);
    }
    sum += BigInt(value);
  }
  const count = BigInt(values.length);
  const quotient = sum / count;
  const twice = 2n * (sum % count >= 0n ? sum % count : -(sum % count));
  if (twice < count) return Number(quotient);
  return Number(sum < 0n ? quotient - 1n : quotient + 1n);
}

/**
 * The average period (PRD J11, the prototype's summary sentence): the mean change over the
 * periods that have an earlier period to compare with — the first never does, like the
 * prototype's. Null when nothing compares yet, so the screen says what is needed instead.
 * Percentages are not money and average as given.
 */
export function summarisePeriods(periods: readonly Period[]): PeriodSummary | null {
  const comparable = periods.filter(
    (period, index): period is Period & { change: number } => index > 0 && period.change !== null,
  );
  if (comparable.length === 0) return null;
  return {
    count: comparable.length,
    avgAbs: meanMinor(comparable.map((period) => period.change)),
    avgPct:
      comparable.reduce((total, period) => total + (period.changePct ?? 0), 0) / comparable.length,
  };
}
