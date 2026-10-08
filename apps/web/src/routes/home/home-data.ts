import type {
  Holding,
  HoldingFilter,
  HoldingIn,
  Position,
  Snapshot,
  Universal,
  UserType,
  ValueIn,
  ValueTuple,
} from '@netnet/contracts';
import { filterHoldings, latestValues as latestOf, position } from '@netnet/core';

/**
 * Home's figures from the snapshot: holdings and their compact values adapted to core's inputs,
 * then `latestValues` and `position`. No screen computes a figure itself (CONVENTIONS §5).
 */

export interface HomeData {
  readonly holdings: readonly HoldingIn[];
  readonly values: readonly ValueIn[];
  readonly latest: ReadonlyMap<string, ValueIn>;
  readonly position: Position;
  /** Each holding's universal type, for labels and rules. */
  readonly universals: ReadonlyMap<string, Universal>;
  /** Each holding's full row, for access and currency. */
  readonly rows: ReadonlyMap<string, Holding>;
}

function toHoldingIn(row: Holding, types: ReadonlyMap<string, UserType>): HoldingIn {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    typeId: row.typeId,
    universal: types.get(row.typeId)?.universal ?? 'other',
    currency: row.currency,
    cadenceDays: row.cadenceDays,
    archived: row.archived,
    access: row.access,
    tagIds: row.tagIds,
  };
}

function toValueIn(holdingId: string, tuple: ValueTuple): ValueIn {
  const [date, amountMinor, currency, baseMinor, source, clientName, id] = tuple;
  return { id, holdingId, date, amountMinor, currency, baseMinor, source, clientName };
}

export function homeData(snapshot: Snapshot, today: string): HomeData {
  const types = new Map(snapshot.types.map((t) => [t.id, t]));
  const holdings = snapshot.holdings.map((row) => toHoldingIn(row, types));
  const values = snapshot.holdings.flatMap((row) =>
    (snapshot.values[row.id] ?? []).map((tuple) => toValueIn(row.id, tuple)),
  );
  const latest = latestOf(values, today);
  return {
    holdings,
    values,
    latest,
    position: position(holdings, latest),
    universals: new Map(holdings.map((h) => [h.id, h.universal])),
    rows: new Map(snapshot.holdings.map((row) => [row.id, row])),
  };
}

/** The holdings on screen: everything unarchived the Home filter keeps, in order. */
export function visibleHoldings(data: HomeData, filter: HoldingFilter = {}): HoldingIn[] {
  return filterHoldings(data.holdings, filter);
}

/** The one `accessUntil` across the locked holdings with a value, when they share it. */
export function sharedLockedUntil(data: HomeData, holdings: readonly HoldingIn[]): string | null {
  const untils = new Set<string>();
  for (const holding of holdings) {
    if (holding.kind !== 'asset' || holding.access !== 'locked') continue;
    if (!data.latest.has(holding.id)) continue;
    const until = data.rows.get(holding.id)?.accessUntil;
    if (until) untils.add(until);
  }
  return untils.size === 1 ? ([...untils][0] ?? null) : null;
}
