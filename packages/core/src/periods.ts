import type {
  Driver,
  HoldingExclusions,
  HoldingFilter,
  HoldingIn,
  Interval,
  Period,
  PeriodView,
  ValueIn,
} from '@netnet/contracts';
import { compareText } from './compare';
import { addDays, bucketEnd, bucketStart } from './dates';
import { filterHoldings } from './filter';
import { compareValues } from './position';

const INTERVAL: Record<PeriodView, Interval> = {
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};

/** True when the Don't Show list drops the holding: its id, its type, or any of its tags. */
function excluded(holding: HoldingIn, exclusions: HoldingExclusions): boolean {
  return (
    (exclusions.holdingIds ?? []).includes(holding.id) ||
    (exclusions.typeIds ?? []).includes(holding.typeId) ||
    (exclusions.tagIds ?? []).some((t) => holding.tagIds.includes(t))
  );
}

function byContribution(a: Driver, b: Driver): number {
  return (
    b.contribution - a.contribution ||
    compareText(a.name, b.name) ||
    compareText(a.holdingId, b.holdingId)
  );
}

/**
 * Change per calendar period (PRD J11): each bucket from the earliest value's to today's — the
 * last ends at today, while it is still open — with its end value, its change against the
 * previous period's end, and the holdings that moved it, ranked by contribution. The first
 * period, the earliest carrying data in the counted set, has nothing earlier to compare with:
 * no change, no % and no drivers, so its opening value never reads as a gain or loss. A holding
 * first valued in a later period counts toward that period's change. Every figure uses each
 * value's recorded `baseMinor`, negative for a liability, so later FX never distorts a closed
 * period; back-dated values recompute the periods they fall in, since only value dates decide. A
 * period is `carried` when a holding counted in it has no value dated inside it. The filter
 * recomputes every figure over the filtered set; exclusions drop holdings, types and tags from
 * these figures only. Oldest first.
 */
export function periods(
  values: readonly ValueIn[],
  holdings: readonly HoldingIn[],
  view: PeriodView,
  today: string,
  filter?: HoldingFilter,
  exclusions?: HoldingExclusions,
): Period[] {
  const interval = INTERVAL[view];
  const counted = filterHoldings(holdings, filter).filter(
    (h) => exclusions === undefined || !excluded(h, exclusions),
  );
  const tracks = counted.map((holding) => ({
    holding,
    sign: holding.kind === 'liability' ? -1 : 1,
    values: [] as ValueIn[],
    next: 0,
    previous: 0,
  }));
  const byId = new Map(tracks.map((t) => [t.holding.id, t]));
  for (const value of values) byId.get(value.holdingId)?.values.push(value);
  let earliest: string | undefined;
  for (const track of tracks) {
    track.values.sort(compareValues);
    const first = track.values[0]?.date;
    if (first !== undefined && (earliest === undefined || first < earliest)) earliest = first;
  }
  if (earliest === undefined) return [];

  const out: Period[] = [];
  let previousTotal: number | null = null;
  for (let start = bucketStart(earliest, interval); start <= today;) {
    const fullEnd = bucketEnd(start, interval);
    const end = fullEnd <= today ? fullEnd : today;
    let endValue = 0;
    let carried = false;
    const drivers: Driver[] = [];
    for (const track of tracks) {
      for (let v = track.values[track.next]; v && v.date <= end; v = track.values[track.next]) {
        track.next += 1;
      }
      const latest = track.values[track.next - 1];
      if (!latest) continue;
      const signed = track.sign * latest.baseMinor;
      endValue += signed;
      if (latest.date < start) carried = true;
      const contribution = signed - track.previous;
      track.previous = signed;
      if (contribution !== 0) {
        drivers.push({ holdingId: track.holding.id, name: track.holding.name, contribution });
      }
    }
    if (previousTotal === null) {
      // The first period: nothing earlier to compare with, so no change and nothing drove it.
      out.push({ start, end, endValue, change: null, changePct: null, carried, drivers: [] });
    } else {
      const change = endValue - previousTotal;
      out.push({
        start,
        end,
        endValue,
        change,
        changePct: previousTotal === 0 ? null : (change / Math.abs(previousTotal)) * 100,
        carried,
        drivers: drivers.sort(byContribution),
      });
    }
    previousTotal = endValue;
    start = addDays(fullEnd, 1);
  }
  return out;
}
