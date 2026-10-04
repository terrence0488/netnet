import type { HoldingIn, Pack, Staleness, ValueIn } from '@netnet/contracts';
import { daysBetween } from './dates';
import { requireChainValue } from './pack-chain';

/**
 * How old a holding's latest value is, and whether that is longer than its expected cadence
 * (PRD J9): the holding's own `cadenceDays`, else the chain's for its universal type. A value
 * dated after today is 0 days old. A holding with no value has no staleness: it is "without value".
 */
export function staleness(
  holding: Pick<HoldingIn, 'cadenceDays' | 'universal'>,
  latest: Pick<ValueIn, 'date'>,
  today: string,
  chain: readonly Pack[],
): Staleness {
  const cadence = holding.cadenceDays ?? requireChainValue(chain, 'cadenceDays', holding.universal);
  const days = Math.max(0, daysBetween(latest.date, today));
  return { stale: days > cadence, days };
}
