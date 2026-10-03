import type { HoldingFilter, HoldingIn, Position, ValueIn } from '@netnet/contracts';
import { accessBucket } from './access';
import { compareText } from './compare';
import { filterHoldings } from './filter';

/**
 * Value order: by value date, then by id. A holding has one value per date (the Ledger replaces
 * on the same date, J3), so the id only makes the order total; ids are ULIDs, so the later write
 * would win.
 */
export function compareValues(a: Pick<ValueIn, 'date' | 'id'>, b: Pick<ValueIn, 'date' | 'id'>) {
  return compareText(a.date, b.date) || compareText(a.id, b.id);
}

/** Each holding's latest value dated on or before `asOf`: the latest by date wins (PRD J3). */
export function latestValues(values: readonly ValueIn[], asOf: string): Map<string, ValueIn> {
  const latest = new Map<string, ValueIn>();
  for (const value of values) {
    if (value.date > asOf) continue;
    const current = latest.get(value.holdingId);
    if (!current || compareValues(value, current) > 0) latest.set(value.holdingId, value);
  }
  return latest;
}

/**
 * The position from each holding's latest value (its stored `baseMinor`, never re-converted, J2):
 * net worth = assets − owed, and assets split into could use, sell first, locked and undecided.
 * Undecided counts toward net worth, never toward could use. Archived holdings are left out, and
 * a holding with no value adds nothing.
 */
export function position(
  holdings: readonly HoldingIn[],
  latest: ReadonlyMap<string, ValueIn>,
  filter?: HoldingFilter,
): Position {
  const sums = { could_use: 0, sell_first: 0, locked: 0, undecided: 0, owed: 0 };
  for (const holding of filterHoldings(holdings, filter)) {
    const value = latest.get(holding.id);
    if (value) sums[accessBucket(holding)] += value.baseMinor;
  }
  const assets = sums.could_use + sums.sell_first + sums.locked + sums.undecided;
  return {
    netWorth: assets - sums.owed,
    assets,
    owed: sums.owed,
    couldUse: sums.could_use,
    sellFirst: sums.sell_first,
    locked: sums.locked,
    undecided: sums.undecided,
  };
}
