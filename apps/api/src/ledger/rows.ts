import type {
  AccessBasis,
  Holding,
  HoldingIn,
  Tag,
  Universal,
  UserType,
  Value,
  ValueIn,
  ValueTuple,
} from '@netnet/contracts';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Scope } from './scope';
import { holding, holdingTag, tag, userType, value } from './schema';

/**
 * Rows as the contracts show them (`packages/contracts/src/ledger.ts`), and the reads every method
 * shares. Each query names `user_id` as well as relying on row-level security: it is the first
 * column of every key, and a second guard costs nothing.
 */

export type HoldingRow = typeof holding.$inferSelect;
export type ValueRow = typeof value.$inferSelect;
export type TypeRow = typeof userType.$inferSelect;
export type TagRow = typeof tag.$inferSelect;

export function toHolding(row: HoldingRow, tagIds: readonly string[]): Holding {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    typeId: row.typeId,
    currency: row.currency,
    cadenceDays: row.cadenceDays,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    rowVersion: row.rowVersion,
    access: row.access,
    accessReason: row.accessReason,
    accessUntil: row.accessUntil,
    accessBasis: (row.accessBasis as AccessBasis | null) ?? null,
    tagIds: [...tagIds],
  };
}

export function toValue(row: ValueRow): Value {
  return {
    id: row.id,
    holdingId: row.holdingId,
    date: row.date,
    amountMinor: row.amountMinor,
    currency: row.currency,
    baseMinor: row.baseMinor,
    baseCurrency: row.baseCurrency,
    fxRate: row.fxRate,
    fxRateDate: row.fxRateDate,
    fxSource: row.fxSource,
    givenRate: row.givenRate,
    givenRateInto: row.givenRateInto,
    source: row.source,
    clientName: row.clientName,
    connectionId: row.connectionId,
    batchId: row.batchId,
    enteredAt: row.enteredAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    rowVersion: row.rowVersion,
  };
}

export function toUserType(row: TypeRow): UserType {
  return {
    id: row.id,
    universal: row.universal,
    packTypeKey: row.packTypeKey,
    customName: row.customName,
    sort: row.sort,
    archived: row.archived,
  };
}

export function toTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, sort: row.sort };
}

/** A holding as `core` reads it. */
export function holdingIn(h: Holding, universal: Universal): HoldingIn {
  return {
    id: h.id,
    name: h.name,
    kind: h.kind,
    typeId: h.typeId,
    universal,
    currency: h.currency,
    cadenceDays: h.cadenceDays,
    archived: h.archived,
    access: h.access,
    tagIds: h.tagIds,
  };
}

/** A value as `core` reads it. */
export function valueIn(v: Value): ValueIn {
  return {
    id: v.id,
    holdingId: v.holdingId,
    date: v.date,
    amountMinor: v.amountMinor,
    currency: v.currency,
    baseMinor: v.baseMinor,
    source: v.source,
    clientName: v.clientName,
  };
}

/** The snapshot's compact form (architecture §7.2). */
export function valueTuple(v: Value): ValueTuple {
  return [v.date, v.amountMinor, v.currency, v.baseMinor, v.source, v.clientName, v.id];
}

/* ---------------------------------------------------------------- reads */

export async function loadTypes(s: Scope): Promise<TypeRow[]> {
  return s.db
    .select()
    .from(userType)
    .where(eq(userType.userId, s.userId))
    .orderBy(asc(userType.sort), asc(userType.id));
}

export async function loadType(s: Scope, id: string): Promise<TypeRow | undefined> {
  const [row] = await s.db
    .select()
    .from(userType)
    .where(and(eq(userType.userId, s.userId), eq(userType.id, id)))
    .limit(1);
  return row;
}

export async function loadTags(s: Scope): Promise<TagRow[]> {
  return s.db
    .select()
    .from(tag)
    .where(eq(tag.userId, s.userId))
    .orderBy(asc(tag.sort), asc(tag.id));
}

/** Each holding's tag ids, in id order; only `holdingIds`' when given. */
export async function loadTagIds(
  s: Scope,
  holdingIds?: readonly string[],
): Promise<Map<string, string[]>> {
  if (holdingIds?.length === 0) return new Map();
  const rows = await s.db
    .select({ holdingId: holdingTag.holdingId, tagId: holdingTag.tagId })
    .from(holdingTag)
    .where(
      and(
        eq(holdingTag.userId, s.userId),
        holdingIds ? inArray(holdingTag.holdingId, [...holdingIds]) : undefined,
      ),
    )
    .orderBy(asc(holdingTag.holdingId), asc(holdingTag.tagId));
  const byHolding = new Map<string, string[]>();
  for (const row of rows) {
    const list = byHolding.get(row.holdingId) ?? [];
    list.push(row.tagId);
    byHolding.set(row.holdingId, list);
  }
  return byHolding;
}

/** Holdings in id order (creation order), with their tags; only `ids`' when given. */
export async function loadHoldings(s: Scope, ids?: readonly string[]): Promise<Holding[]> {
  if (ids?.length === 0) return [];
  const rows = await s.db
    .select()
    .from(holding)
    .where(and(eq(holding.userId, s.userId), ids ? inArray(holding.id, [...ids]) : undefined))
    .orderBy(asc(holding.id));
  const tags = await loadTagIds(
    s,
    rows.map((r) => r.id),
  );
  return rows.map((row) => toHolding(row, tags.get(row.id) ?? []));
}

export async function loadHolding(s: Scope, id: string): Promise<Holding | undefined> {
  const [found] = await loadHoldings(s, [id]);
  return found;
}

/** Value rows by holding, oldest first (by date, then id); only `holdingIds`' when given. */
export async function loadValueRows(s: Scope, holdingIds?: readonly string[]): Promise<ValueRow[]> {
  if (holdingIds?.length === 0) return [];
  return s.db
    .select()
    .from(value)
    .where(
      and(
        eq(value.userId, s.userId),
        holdingIds ? inArray(value.holdingId, [...holdingIds]) : undefined,
      ),
    )
    .orderBy(asc(value.holdingId), asc(value.date), asc(value.id));
}

/** Values by holding, oldest first (by date, then id); only `holdingIds`' when given. */
export async function loadValues(s: Scope, holdingIds?: readonly string[]): Promise<Value[]> {
  return (await loadValueRows(s, holdingIds)).map(toValue);
}

export async function loadValueRow(s: Scope, id: string): Promise<ValueRow | undefined> {
  const [row] = await s.db
    .select()
    .from(value)
    .where(and(eq(value.userId, s.userId), eq(value.id, id)))
    .limit(1);
  return row;
}

export async function loadValue(s: Scope, id: string): Promise<Value | undefined> {
  const row = await loadValueRow(s, id);
  return row ? toValue(row) : undefined;
}

/** Each holding's latest value by date (J3), keyed by holding id. */
export async function loadLatestValues(s: Scope): Promise<Map<string, Value>> {
  const rows = await s.db
    .selectDistinctOn([value.holdingId])
    .from(value)
    .where(eq(value.userId, s.userId))
    .orderBy(asc(value.holdingId), desc(value.date), desc(value.id));
  return new Map(rows.map((row) => [row.holdingId, toValue(row)]));
}

/** Which ids of `ids` exist, of types, tags or holdings. */
export async function existingIds(
  s: Scope,
  table: 'type' | 'tag' | 'holding',
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const list = [...new Set(ids)];
  const rows =
    table === 'type'
      ? await s.db
          .select({ id: userType.id })
          .from(userType)
          .where(and(eq(userType.userId, s.userId), inArray(userType.id, list)))
      : table === 'tag'
        ? await s.db
            .select({ id: tag.id })
            .from(tag)
            .where(and(eq(tag.userId, s.userId), inArray(tag.id, list)))
        : await s.db
            .select({ id: holding.id })
            .from(holding)
            .where(and(eq(holding.userId, s.userId), inArray(holding.id, list)));
  return new Set(rows.map((r) => r.id));
}
