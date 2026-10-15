import {
  historyQuerySchema,
  holdingQuerySchema,
  pageReqSchema,
  type ContextInput,
  type DateRange,
  type Holding,
  type HoldingDetail,
  type HoldingFilter,
  type HoldingQuery,
  type HoldingView,
  type HistoryQuery,
  type Page,
  type PageReq,
  type Series,
  type Snapshot,
  type Universal,
  type Value,
  type ValueTuple,
  type VersionedPack,
} from '@netnet/contracts';
import { normaliseName, series, staleness, typeLabel } from '@netnet/core';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { listConnections } from '../db/agent-connections';
import { isId, type IdPrefix } from '../lib/ids';
import { FieldErrors, notFound, parseInput } from './input';
import { readPrefs } from './prefs';
import {
  existingIds,
  holdingIn,
  loadHolding,
  loadHoldings,
  loadLatestValues,
  loadTags,
  loadTypes,
  loadValues,
  toTag,
  toUserType,
  toValue,
  valueIn,
  valueTuple,
  type TypeRow,
} from './rows';
import { value } from './schema';
import type { Scope } from './scope';

/**
 * What the Ledger reads out: the snapshot the web app computes from (§7.2), the context input
 * `core.compileContext` turns into `get_financial_context` (§7.5), and the agent's lists (§7.4).
 * Every figure in them comes from `core` (CONVENTIONS §5).
 */

const DEFAULT_HOLDINGS_PAGE = 50;
const DEFAULT_VALUES_PAGE = 50;

/* ---------------------------------------------------------------- cursors */

export function encodeCursor(parts: readonly string[]): string {
  return Buffer.from(parts.join('|'), 'utf8').toString('base64url');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The parts of a cursor this Ledger made, each matching its pattern (`'id'` for an id), or
 * VALIDATION_FAILED at `path`.
 */
export function decodeCursor(
  cursor: string,
  shape: readonly (IdPrefix | RegExp)[],
  path: string,
): string[] {
  const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const fits =
    parts.length === shape.length &&
    shape.every((want, i) => {
      const part = parts[i] ?? '';
      return typeof want === 'string' ? isId(part, want) : want.test(part);
    });
  if (!fits) {
    const errors = new FieldErrors();
    errors.add('VALIDATION_FAILED', path, 'Pass the nextCursor of the previous page as it was.');
    errors.throwIfAny();
  }
  return parts;
}

/* ---------------------------------------------------------------- helpers */

/** NOT_FOUND naming each id in `ids` that is not one of this user's types or tags. */
async function checkIds(
  s: Scope,
  errors: FieldErrors,
  table: 'type' | 'tag',
  path: string,
  ids: readonly string[] | undefined,
): Promise<void> {
  if (!ids || ids.length === 0) return;
  const found = await existingIds(s, table, ids);
  ids.forEach((id, i) => {
    if (!found.has(id)) {
      errors.add('NOT_FOUND', `${path}[${i}]`, `There is no ${table} "${id}" in this account.`);
    }
  });
}

function universalOf(types: ReadonlyMap<string, TypeRow>, h: Holding): Universal {
  return types.get(h.typeId)?.universal ?? 'other';
}

function view(
  h: Holding,
  types: ReadonlyMap<string, TypeRow>,
  latest: Value | undefined,
  chain: readonly VersionedPack[],
  today: string,
): HoldingView {
  const type = types.get(h.typeId);
  const universal = universalOf(types, h);
  return {
    ...h,
    universal,
    typeLabel: type ? typeLabel(chain, toUserType(type)) : '',
    latest: latest ?? null,
    staleness: latest
      ? staleness({ cadenceDays: h.cadenceDays, universal }, latest, today, chain)
      : null,
  };
}

/* ---------------------------------------------------------------- reads */

/** `snapshot` (`GET /api/snapshot`): everything, once; values compact per holding. */
export async function snapshot(s: Scope): Promise<Snapshot> {
  const state = await s.requireState();
  const chain = await s.chain();
  const types = await loadTypes(s);
  const tags = await loadTags(s);
  const holdings = await loadHoldings(s);
  const values = await loadValues(s);
  const prefs = await readPrefs(s);
  const byHolding: Record<string, ValueTuple[]> = {};
  for (const h of holdings) byHolding[h.id] = [];
  for (const v of values) byHolding[v.holdingId]?.push(valueTuple(v));
  return {
    dataVersion: state.dataVersion,
    baseCurrency: state.baseCurrency,
    packRef: chain.map((p) => ({ key: p.id, version: p.version })),
    prefs,
    types: types.map(toUserType),
    tags: tags.map(toTag),
    holdings,
    values: byHolding,
  };
}

/**
 * `context`: the user's ledger as `core.compileContext` reads it (P1-T9), every holding and value
 * included; the caller compiles it with the baseline, today and the pack chain.
 */
export async function context(s: Scope): Promise<ContextInput> {
  const state = await s.requireState();
  const typeRows = await loadTypes(s);
  const types = new Map(typeRows.map((t) => [t.id, t]));
  const holdings = await loadHoldings(s);
  const values = await loadValues(s);
  const tags = await loadTags(s);
  const connections = await listConnections(s.db, s.userId);
  return {
    baseCurrency: state.baseCurrency,
    holdings: holdings.map((h) => ({
      ...holdingIn(h, universalOf(types, h)),
      accessReason: h.accessReason,
      accessUntil: h.accessUntil,
      accessBasis: h.accessBasis,
    })),
    values: values.map((v) => ({ ...valueIn(v), connectionId: v.connectionId })),
    types: typeRows.map((t) => ({
      id: t.id,
      universal: t.universal,
      packTypeKey: t.packTypeKey,
      customName: t.customName,
    })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
    connections: connections.map((c) => ({ id: c.id, client: c.client })),
  };
}

/** `listHoldings` (`list_holdings`): in creation order, each with its latest value and staleness. */
export async function listHoldings(s: Scope, query: HoldingQuery): Promise<Page<HoldingView>> {
  const q = parseInput(holdingQuerySchema, query);
  const errors = new FieldErrors();
  await checkIds(s, errors, 'type', 'typeIds', q.typeIds);
  await checkIds(s, errors, 'tag', 'tagIds', q.tagIds);
  errors.throwIfAny();
  const after = q.cursor === undefined ? undefined : decodeCursor(q.cursor, ['hld'], 'cursor')[0];

  const types = new Map((await loadTypes(s)).map((t) => [t.id, t]));
  const latest = await loadLatestValues(s);
  const chain = await s.chain();
  const today = s.today();
  const archived = q.archived ?? 'exclude';
  const needle = q.query ? normaliseName(q.query) : '';
  const typeIds = q.typeIds ?? [];
  const tagIds = q.tagIds ?? [];

  const matching = (await loadHoldings(s))
    .filter((h) => (archived === 'include' ? true : h.archived === (archived === 'only')))
    .filter((h) => typeIds.length === 0 || typeIds.includes(h.typeId))
    .filter((h) => tagIds.length === 0 || tagIds.some((t) => h.tagIds.includes(t)))
    .filter((h) => needle === '' || normaliseName(h.name).includes(needle))
    .map((h) => view(h, types, latest.get(h.id), chain, today))
    .filter((h) => q.staleOnly !== true || h.staleness?.stale === true);

  const start = after === undefined ? 0 : matching.findIndex((h) => h.id > after);
  const rest = start < 0 ? [] : matching.slice(start);
  const limit = q.limit ?? DEFAULT_HOLDINGS_PAGE;
  const items = rest.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rest.length > limit && last ? encodeCursor([last.id]) : null,
  };
}

/** `getHolding` (`get_holding`): the holding, and a page of its values, newest first. */
export async function getHolding(s: Scope, id: string, page?: PageReq): Promise<HoldingDetail> {
  const p = parseInput(pageReqSchema, page ?? {}, 'values');
  const h = await loadHolding(s, id);
  if (!h) throw notFound('holding', id);
  const after =
    p.cursor === undefined ? undefined : decodeCursor(p.cursor, [DATE, 'val'], 'values.cursor');
  const limit = p.limit ?? DEFAULT_VALUES_PAGE;
  const rows = await s.db
    .select()
    .from(value)
    .where(
      and(
        eq(value.userId, s.userId),
        eq(value.holdingId, id),
        after
          ? or(lt(value.date, after[0]!), and(eq(value.date, after[0]!), lt(value.id, after[1]!)))
          : undefined,
      ),
    )
    .orderBy(desc(value.date), desc(value.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map(toValue);
  const last = items.at(-1);

  const types = new Map((await loadTypes(s)).map((t) => [t.id, t]));
  const latest = (await loadLatestValues(s)).get(id);
  return {
    ...view(h, types, latest, await s.chain(), s.today()),
    values: {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor([last.date, last.id]) : null,
    },
  };
}

/** `history` (`get_net_worth_history`): `core.series` over the stored conversions (J4, J11). */
export async function history(s: Scope, query: HistoryQuery): Promise<Series> {
  const q = parseInput(historyQuerySchema, query);
  const errors = new FieldErrors();
  await checkIds(s, errors, 'type', 'typeIds', q.typeIds);
  await checkIds(s, errors, 'tag', 'tagIds', q.tagIds);
  errors.throwIfAny();
  const state = await s.requireState();
  const types = new Map((await loadTypes(s)).map((t) => [t.id, t]));
  const holdings = (await loadHoldings(s)).map((h) => holdingIn(h, universalOf(types, h)));
  const values = (await loadValues(s)).map(valueIn);
  const interval = q.interval ?? 'month';
  const groupBy = q.groupBy ?? 'none';
  const range: DateRange =
    q.from === undefined ? { to: q.to ?? s.today() } : { from: q.from, to: q.to ?? s.today() };
  const filter: HoldingFilter = {
    ...(q.typeIds?.length ? { typeIds: q.typeIds } : {}),
    ...(q.tagIds?.length ? { tagIds: q.tagIds } : {}),
  };
  return {
    currency: state.baseCurrency,
    interval,
    groupBy,
    points: series(values, holdings, range, interval, filter, groupBy),
  };
}
