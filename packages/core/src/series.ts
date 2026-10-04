import type {
  ACCESS_BUCKETS,
  AccessBucket,
  DateRange,
  GroupBy,
  HoldingFilter,
  HoldingIn,
  Interval,
  Point,
  ValueIn,
} from '@netnet/contracts';
import { accessBucket } from './access';
import { compareText } from './compare';
import { addDays, bucketEnd, bucketStart } from './dates';
import { filterHoldings } from './filter';
import { compareValues } from './position';

/** The access buckets in the order the position lists them. */
const BUCKET_ORDER: typeof ACCESS_BUCKETS = [
  'could_use',
  'sell_first',
  'locked',
  'undecided',
  'owed',
];

function groupKey(holding: HoldingIn, groupBy: Exclude<GroupBy, 'none'>): string {
  switch (groupBy) {
    case 'type':
      return holding.typeId;
    case 'access':
      return accessBucket(holding);
    case 'currency':
      return holding.currency;
  }
}

function sortedGroups(groups: Map<string, number>, groupBy: GroupBy): Record<string, number> {
  const keys = [...groups.keys()].sort((a, b) =>
    groupBy === 'access'
      ? BUCKET_ORDER.indexOf(a as AccessBucket) - BUCKET_ORDER.indexOf(b as AccessBucket)
      : compareText(a, b),
  );
  return Object.fromEntries(keys.map((k) => [k, groups.get(k) ?? 0]));
}

/** Each bucket's last day from `from`'s bucket up to `to`, ending at `to` itself. */
function pointDates(from: string, to: string, interval: Interval): string[] {
  const dates: string[] = [];
  for (let end = bucketEnd(from, interval); end < to; end = bucketEnd(addDays(end, 1), interval)) {
    dates.push(end);
  }
  dates.push(to);
  return dates;
}

/**
 * Net worth over time (PRD J4, J11; `get_net_worth_history`): one point per calendar bucket, at
 * the bucket's last day (the last at `range.to`). Each holding counts its latest value dated on or
 * before the point, by value date only, never by when it was entered; its stored `baseMinor`,
 * negative for a liability. A point is `carried` when a holding counted in it has no value dated
 * inside its bucket. Archived holdings are left out. With no values, there are no points.
 */
export function series(
  values: readonly ValueIn[],
  holdings: readonly HoldingIn[],
  range: DateRange,
  interval: Interval,
  filter?: HoldingFilter,
  groupBy: GroupBy = 'none',
): Point[] {
  const tracks = filterHoldings(holdings, filter).map((holding) => ({
    holding,
    sign: holding.kind === 'liability' ? -1 : 1,
    key: groupBy === 'none' ? '' : groupKey(holding, groupBy),
    values: [] as ValueIn[],
    next: 0,
  }));
  const byId = new Map(tracks.map((t) => [t.holding.id, t]));
  for (const value of values) byId.get(value.holdingId)?.values.push(value);
  let earliest: string | undefined;
  for (const track of tracks) {
    track.values.sort(compareValues);
    const first = track.values[0]?.date;
    if (first !== undefined && (earliest === undefined || first < earliest)) earliest = first;
  }
  const from = range.from ?? earliest;
  if (from === undefined || from > range.to) return [];

  return pointDates(from, range.to, interval).map((date) => {
    const start = bucketStart(date, interval);
    const groups = new Map<string, number>();
    let total = 0;
    let carried = false;
    for (const track of tracks) {
      for (let v = track.values[track.next]; v && v.date <= date; v = track.values[track.next]) {
        track.next += 1;
      }
      const latest = track.values[track.next - 1];
      if (!latest) continue;
      const amount = track.sign * latest.baseMinor;
      total += amount;
      if (latest.date < start) carried = true;
      groups.set(track.key, (groups.get(track.key) ?? 0) + amount);
    }
    return groupBy === 'none'
      ? { date, total, carried }
      : { date, total, groups: sortedGroups(groups, groupBy), carried };
  });
}
