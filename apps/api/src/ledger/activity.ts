import {
  activityQuerySchema,
  undoTargetSchema,
  type ActivityQuery,
  type AuditEntry,
  type Holding,
  type Page,
  type Tag,
  type UndoBlocker,
  type UndoResult,
  type UndoTarget,
  type UserType,
  type Value,
  type Write,
} from '@netnet/contracts';
import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { AppError } from '../lib/errors';
import { CONNECTION_ENTITY } from './connections';
import { saveHolding } from './holdings';
import { notFound, parseInput } from './input';
import { scrubPrefs } from './prefs';
import { decodeCursor, encodeCursor } from './reads';
import {
  existingIds,
  loadHolding,
  loadHoldings,
  loadTags,
  loadType,
  loadValue,
  loadValues,
  toTag,
  toUserType,
} from './rows';
import { audit, holding, holdingTag, ledgerState, prefs, tag, userType, value } from './schema';
import type { Scope } from './scope';
import { runWrite, sameJson, type Action, type Entity, type WriteScope } from './write';

/**
 * The activity log and undo (architecture §6.8, PRD J7): every change the person or an agent made
 * is visible through `activity` and reversible through `undo`, over one implementation behind REST
 * and MCP. An undo restores `before` exactly, and only when the entity is still at the entry's
 * `after`; otherwise it names the later change to undo first (`UNDO_CONFLICT`). Every undo is
 * itself an audit entry, linked by `undoes`/`undone_by`, so it can be undone too.
 */

type AuditRow = typeof audit.$inferSelect;

const DEFAULT_ACTIVITY_PAGE = 50;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/* ------------------------------------------------------------------ activity */

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function holdingName(side: unknown): string {
  return str(obj(side)?.name) ?? 'a holding';
}

function typeLabel(side: unknown): string {
  const t = obj(side);
  return str(t?.customName) ?? str(t?.packTypeKey) ?? str(t?.universal) ?? 'a type';
}

const PREF_LABELS: Record<string, string> = {
  home_filter: 'home filter',
  insights_filter: 'insights filter',
  baseline: 'baseline',
  sort: 'sort',
};

/** How an entry reads on its own: the action, the entity and the name or date on its sides. */
function baseSummary(row: AuditRow): string {
  if (row.entity === CONNECTION_ENTITY) return 'Agent disconnected';
  const { action, before, after } = row;
  switch (row.entity) {
    case 'ledger': {
      if (action === 'create') {
        const ccy = str(obj(after)?.baseCurrency);
        return ccy ? `Started tracking in ${ccy}` : 'Started tracking';
      }
      const from = str(obj(before)?.baseCurrency);
      const to = str(obj(after)?.baseCurrency);
      return from && to && from !== to
        ? `Changed the default currency from ${from} to ${to}`
        : 'Updated the ledger';
    }
    case 'type':
      if (action === 'create') return `Added type "${typeLabel(after)}"`;
      if (action === 'delete') return `Removed type "${typeLabel(before)}"`;
      return `Renamed type to "${typeLabel(after)}"`;
    case 'tag': {
      const name = str(obj(action === 'delete' ? before : after)?.name) ?? 'a tag';
      if (action === 'create') return `Added tag "${name}"`;
      if (action === 'delete') return `Removed tag "${name}"`;
      return `Renamed tag to "${name}"`;
    }
    case 'holding': {
      if (action === 'create') return `Added "${holdingName(after)}"`;
      if (action === 'delete') return `Deleted "${holdingName(before)}"`;
      const name = holdingName(after);
      return `Updated "${name === 'a holding' ? holdingName(before) : name}"`;
    }
    case 'value': {
      const date = str(obj(action === 'delete' ? before : after)?.date) ?? 'a date';
      if (action === 'create') return `Recorded a value for ${date}`;
      if (action === 'delete') return `Deleted the value for ${date}`;
      return `Updated the value for ${date}`;
    }
    case 'prefs': {
      const key = row.entityId ?? str(obj(after ?? before)?.key) ?? '';
      const label = PREF_LABELS[key] ?? 'preferences';
      if (action === 'create') return `Set ${label}`;
      if (action === 'delete') return `Cleared ${label}`;
      return `Updated ${label}`;
    }
    default: {
      const verb = action === 'create' ? 'Created' : action === 'delete' ? 'Deleted' : 'Updated';
      return `${verb} ${row.entity}`;
    }
  }
}

/**
 * How an entry reads: its own summary, or what it undid for an undo, with `(undone)` while an
 * undo of it stands. `linked` holds the entries `undoes` names on this page.
 */
function summary(row: AuditRow, linked: ReadonlyMap<string, AuditRow>): string {
  let text: string;
  if (row.undoes === null) {
    text = baseSummary(row);
  } else {
    const original = linked.get(row.undoes);
    text = original ? `Undid ${baseSummary(original)}` : 'Undid a change';
  }
  return row.undoneBy === null ? text : `${text} (undone)`;
}

/** A revocation's disconnected agent: the row carries no client, its snapshot does. */
function clientNameOf(row: AuditRow): string | null {
  if (row.clientName !== null) return row.clientName;
  if (row.entity === CONNECTION_ENTITY) return str(obj(row.after)?.clientName) ?? null;
  return null;
}

function toEntry(row: AuditRow, linked: ReadonlyMap<string, AuditRow>): AuditEntry {
  return {
    id: row.id,
    at: row.at.toISOString(),
    actor: row.actor,
    clientName: clientNameOf(row),
    connectionId: row.connectionId,
    batchId: row.batchId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    undoes: row.undoes,
    undoneBy: row.undoneBy,
    summary: summary(row, linked),
  };
}

/**
 * `activity`: the audit log, newest first, optionally one agent turn. Another user's entries are
 * unreachable: every query names this user, under row-level security.
 */
export async function activity(s: Scope, p: ActivityQuery): Promise<Page<AuditEntry>> {
  const q = parseInput(activityQuerySchema, p);
  const after =
    q.cursor === undefined ? undefined : decodeCursor(q.cursor, [INSTANT, 'aud'], 'cursor');
  const limit = q.limit ?? DEFAULT_ACTIVITY_PAGE;
  const rows = await s.db
    .select()
    .from(audit)
    .where(
      and(
        eq(audit.userId, s.userId),
        q.batchId === undefined ? undefined : eq(audit.batchId, q.batchId),
        after === undefined
          ? undefined
          : or(
              lt(audit.at, new Date(after[0]!)),
              and(eq(audit.at, new Date(after[0]!)), lt(audit.id, after[1]!)),
            ),
      ),
    )
    .orderBy(desc(audit.at), desc(audit.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const undoes = [...new Set(items.map((r) => r.undoes).filter((id) => id !== null))];
  const linked = new Map<string, AuditRow>();
  if (undoes.length > 0) {
    const found = await s.db
      .select()
      .from(audit)
      .where(and(eq(audit.userId, s.userId), inArray(audit.id, undoes)));
    for (const row of found) linked.set(row.id, row);
  }
  const last = items.at(-1);
  return {
    items: items.map((row) => toEntry(row, linked)),
    nextCursor: rows.length > limit && last ? encodeCursor([last.at.toISOString(), last.id]) : null,
  };
}

/* ------------------------------------------------------------------ undo */

/** What undo refuses with: the entry stands, but it cannot be reversed. */
function cannotUndo(message: string): AppError {
  return new AppError('VALIDATION_FAILED', message);
}

/** `UNDO_CONFLICT` naming the later changes to undo first, newest first (architecture §7.5). */
function conflict(blockers: UndoBlocker[]): AppError {
  const first = blockers[0];
  if (!first) {
    return new AppError(
      'UNDO_CONFLICT',
      'This cannot be undone yet: a later change is in the way. Undo the newest change to it first, then try again.',
      { blockers },
    );
  }
  const more =
    blockers.length > 1
      ? ` (${blockers.length} later changes; blockers lists them newest first.)`
      : '';
  return new AppError(
    'UNDO_CONFLICT',
    `This cannot be undone yet: "${first.entry_id}" changed it afterwards.${more} Undo "${first.entry_id}" first, then try again.`,
    { blockers },
  );
}

/** One of the user's entries, or NOT_FOUND (another user's reads the same). */
async function loadEntry(s: Scope, entryId: string): Promise<AuditRow | undefined> {
  const [row] = await s.db
    .select()
    .from(audit)
    .where(and(eq(audit.userId, s.userId), eq(audit.id, entryId)))
    .limit(1);
  return row;
}

/** Later entries for the entry's entity that still stand, newest first. */
async function liveLater(
  s: Scope,
  entry: AuditRow,
  undoneHere: ReadonlySet<string>,
): Promise<AuditRow[]> {
  const rows = await s.db
    .select()
    .from(audit)
    .where(
      and(
        eq(audit.userId, s.userId),
        eq(audit.entity, entry.entity),
        entry.entityId === null ? isNull(audit.entityId) : eq(audit.entityId, entry.entityId),
        isNull(audit.undoneBy),
        or(gt(audit.at, entry.at), and(eq(audit.at, entry.at), gt(audit.id, entry.id))),
      ),
    )
    .orderBy(desc(audit.at), desc(audit.id));
  return rows.filter((row) => !undoneHere.has(row.id));
}

/** The newest entry for an entity: the live one, else the newest there is. */
async function newestFor(
  s: Scope,
  entity: string,
  entityId: string,
): Promise<AuditRow | undefined> {
  const where = [
    eq(audit.userId, s.userId),
    eq(audit.entity, entity),
    eq(audit.entityId, entityId),
  ];
  const [live] = await s.db
    .select()
    .from(audit)
    .where(and(...where, isNull(audit.undoneBy)))
    .orderBy(desc(audit.at), desc(audit.id))
    .limit(1);
  if (live) return live;
  const [any] = await s.db
    .select()
    .from(audit)
    .where(and(...where))
    .orderBy(desc(audit.at), desc(audit.id))
    .limit(1);
  return any;
}

/** Fails the undo, naming the entry's live later changes and the extra blockers newest first. */
async function fail(
  w: WriteScope,
  entry: AuditRow,
  extra: readonly (AuditRow | undefined)[],
  undoneHere: ReadonlySet<string>,
): Promise<never> {
  const rows = await liveLater(w.s, entry, undoneHere);
  for (const row of extra) {
    if (row && !rows.some((r) => r.id === row.id)) rows.push(row);
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
  throw conflict(
    rows.map((row) => ({ entry_id: row.id, action: row.action, at: row.at.toISOString() })),
  );
}

/**
 * Records the undo: the inverse operation (a create undone reads as a delete, with the sides
 * swapped), linked to the entry it undid. When that entry was itself an undo, the entry it had
 * undone is live again.
 */
async function recordUndo(
  w: WriteScope,
  entry: AuditRow,
  entityId: string,
  action: Action,
  before: unknown,
  after: unknown,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const undoId = await w.audit(entry.entity as Entity, entityId, action, before, after, {
    undoes: entry.id,
  });
  w.linkUndo(entry.id, undoId, entry.undoes ?? undefined);
  undoneHere.add(entry.id);
  result.undone.push({ entryId: entry.id, entity: entry.entity, entityId });
  result.undoIds.push(undoId);
}

/** `value_undone`, for an undo of a value. NetNet's own writes fire nothing (§7.7). */
function undoneEvent(w: WriteScope): void {
  if (w.eventSource) w.event({ name: 'value_undone', props: {} });
}

/* The audited sides, checked: every write stores full entities, so a malformed one is a bug. */

function asValue(side: unknown): Value {
  const v = obj(side);
  if (
    !v ||
    typeof v.id !== 'string' ||
    typeof v.holdingId !== 'string' ||
    typeof v.date !== 'string' ||
    typeof v.amountMinor !== 'number' ||
    typeof v.rowVersion !== 'number'
  ) {
    throw new Error('An audit row’s value side is malformed.');
  }
  return side as Value;
}

function asHolding(side: unknown): Holding {
  const h = obj(side);
  if (
    !h ||
    typeof h.id !== 'string' ||
    typeof h.name !== 'string' ||
    typeof h.kind !== 'string' ||
    typeof h.typeId !== 'string' ||
    typeof h.rowVersion !== 'number' ||
    !Array.isArray(h.tagIds)
  ) {
    throw new Error('An audit row’s holding side is malformed.');
  }
  return side as Holding;
}

/** A deleted holding's `before`: the holding with the values it took with it. */
function asHoldingDelete(side: unknown): { holding: Holding; values: Value[] } {
  const h = obj(side);
  const values = h?.values;
  if (!h || !Array.isArray(values)) {
    throw new Error('An audit row’s deleted holding is malformed.');
  }
  return { holding: asHolding(side), values: values.map(asValue) };
}

function asType(side: unknown): UserType {
  const t = obj(side);
  if (!t || typeof t.id !== 'string' || typeof t.universal !== 'string') {
    throw new Error('An audit row’s type side is malformed.');
  }
  return side as UserType;
}

function asTag(side: unknown): Tag {
  const t = obj(side);
  if (!t || typeof t.id !== 'string' || typeof t.name !== 'string') {
    throw new Error('An audit row’s tag side is malformed.');
  }
  return side as Tag;
}

/** A pref side: null when unset, else the stored key and value. */
function asPref(side: unknown): { key: string; value: unknown } | null {
  if (side === null) return null;
  const p = obj(side);
  if (!p || typeof p.key !== 'string' || !Object.hasOwn(p, 'value')) {
    throw new Error('An audit row’s pref side is malformed.');
  }
  return { key: p.key, value: p.value };
}

/** A value row's columns from the value as stored: provenance and versions kept exactly. */
function valueColumns(v: Value) {
  return {
    holdingId: v.holdingId,
    date: v.date,
    amountMinor: v.amountMinor,
    currency: v.currency,
    baseMinor: v.baseMinor,
    baseCurrency: v.baseCurrency,
    fxRate: v.fxRate,
    fxRateDate: v.fxRateDate,
    fxSource: v.fxSource,
    source: v.source,
    clientName: v.clientName,
    connectionId: v.connectionId,
    batchId: v.batchId,
    enteredAt: new Date(v.enteredAt),
    updatedAt: new Date(v.updatedAt),
    rowVersion: v.rowVersion,
  };
}

/** A holding row's columns from the holding as stored. */
function holdingColumns(h: Holding) {
  return {
    name: h.name,
    kind: h.kind,
    typeId: h.typeId,
    currency: h.currency,
    cadenceDays: h.cadenceDays,
    archivedAt: h.archivedAt === null ? null : new Date(h.archivedAt),
    createdAt: new Date(h.createdAt),
    rowVersion: h.rowVersion,
    access: h.access,
    accessBasis: h.accessBasis,
    accessReason: h.accessReason,
    accessUntil: h.accessUntil,
  };
}

/** A tag of another id that already has `name`, case aside. */
async function tagClash(s: Scope, id: string, name: string) {
  const [clash] = await s.db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.userId, s.userId), sql`lower(${tag.name}) = lower(${name})`, ne(tag.id, id)))
    .limit(1);
  return clash;
}

async function undoValue(
  w: WriteScope,
  entry: AuditRow,
  entityId: string,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const { s } = w;
  const current = await loadValue(s, entityId);
  if (entry.action === 'create') {
    const after = asValue(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    await s.db.delete(value).where(and(eq(value.userId, s.userId), eq(value.id, entityId)));
    undoneEvent(w);
    await recordUndo(w, entry, entityId, 'delete', after, null, undoneHere, result);
  } else if (entry.action === 'delete') {
    const before = asValue(entry.before);
    if (current) await fail(w, entry, [], undoneHere);
    if (!(await loadHolding(s, before.holdingId))) {
      await fail(w, entry, [await newestFor(s, 'holding', before.holdingId)], undoneHere);
    }
    const [clash] = await s.db
      .select({ id: value.id })
      .from(value)
      .where(
        and(
          eq(value.userId, s.userId),
          eq(value.holdingId, before.holdingId),
          eq(value.date, before.date),
        ),
      )
      .limit(1);
    if (clash) {
      await fail(w, entry, [await newestFor(s, 'value', clash.id)], undoneHere);
    }
    await s.db.insert(value).values({ userId: s.userId, id: entityId, ...valueColumns(before) });
    undoneEvent(w);
    await recordUndo(w, entry, entityId, 'create', null, before, undoneHere, result);
  } else if (entry.action === 'update') {
    const before = asValue(entry.before);
    const after = asValue(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    if (before.date !== after.date) {
      const [clash] = await s.db
        .select({ id: value.id })
        .from(value)
        .where(
          and(
            eq(value.userId, s.userId),
            eq(value.holdingId, before.holdingId),
            eq(value.date, before.date),
            ne(value.id, entityId),
          ),
        )
        .limit(1);
      if (clash) {
        await fail(w, entry, [await newestFor(s, 'value', clash.id)], undoneHere);
      }
    }
    await s.db
      .update(value)
      .set(valueColumns(before))
      .where(and(eq(value.userId, s.userId), eq(value.id, entityId)));
    undoneEvent(w);
    await recordUndo(w, entry, entityId, 'update', after, before, undoneHere, result);
  } else {
    throw cannotUndo('This entry cannot be undone.');
  }
}

async function undoHolding(
  w: WriteScope,
  entry: AuditRow,
  entityId: string,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const { s } = w;
  const current = await loadHolding(s, entityId);
  /** The type and tags a restore needs, or the later changes that took them. */
  const needTargets = async (h: Holding): Promise<void> => {
    const missing: (AuditRow | undefined)[] = [];
    if (!(await loadType(s, h.typeId))) missing.push(await newestFor(s, 'type', h.typeId));
    const have = await existingIds(s, 'tag', h.tagIds);
    for (const tagId of h.tagIds) {
      if (!have.has(tagId)) missing.push(await newestFor(s, 'tag', tagId));
    }
    if (missing.length > 0) await fail(w, entry, missing, undoneHere);
  };
  if (entry.action === 'create') {
    const after = asHolding(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    // What undoing a creation deletes: the holding, whatever values it has now (kept on the
    // entry, so the undo stays undoable), and its tags; saved filters follow.
    const values = await loadValues(s, [entityId]);
    await s.db.delete(holding).where(and(eq(holding.userId, s.userId), eq(holding.id, entityId)));
    await scrubPrefs(w, 'holding', entityId);
    await recordUndo(w, entry, entityId, 'delete', { ...after, values }, null, undoneHere, result);
  } else if (entry.action === 'delete') {
    const { holding: before, values } = asHoldingDelete(entry.before);
    if (current) await fail(w, entry, [], undoneHere);
    await needTargets(before);
    await s.db
      .insert(holding)
      .values({ userId: s.userId, id: entityId, ...holdingColumns(before) });
    if (before.tagIds.length > 0) {
      await s.db
        .insert(holdingTag)
        .values(before.tagIds.map((tagId) => ({ userId: s.userId, holdingId: entityId, tagId })));
    }
    for (const v of values) {
      await s.db.insert(value).values({ userId: s.userId, id: v.id, ...valueColumns(v) });
    }
    await recordUndo(w, entry, entityId, 'create', null, entry.before, undoneHere, result);
  } else if (entry.action === 'update') {
    const before = asHolding(entry.before);
    const after = asHolding(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    await needTargets(before);
    await s.db
      .update(holding)
      .set(holdingColumns(before))
      .where(and(eq(holding.userId, s.userId), eq(holding.id, entityId)));
    await s.db
      .delete(holdingTag)
      .where(and(eq(holdingTag.userId, s.userId), eq(holdingTag.holdingId, entityId)));
    if (before.tagIds.length > 0) {
      await s.db
        .insert(holdingTag)
        .values(before.tagIds.map((tagId) => ({ userId: s.userId, holdingId: entityId, tagId })));
    }
    await recordUndo(w, entry, entityId, 'update', after, before, undoneHere, result);
  } else {
    throw cannotUndo('This entry cannot be undone.');
  }
}

async function undoType(
  w: WriteScope,
  entry: AuditRow,
  entityId: string,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const { s } = w;
  const row = await loadType(s, entityId);
  const current = row ? toUserType(row) : undefined;
  if (entry.action === 'create') {
    const after = asType(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    // An undo cannot invent the move target a merge needs: the holdings' changes come first.
    const using = (await loadHoldings(s)).filter((h) => h.typeId === entityId);
    if (using.length > 0) {
      const blockers = await Promise.all(using.map((h) => newestFor(s, 'holding', h.id)));
      await fail(w, entry, blockers, undoneHere);
    }
    await scrubPrefs(w, 'type', entityId);
    await s.db
      .delete(userType)
      .where(and(eq(userType.userId, s.userId), eq(userType.id, entityId)));
    await recordUndo(w, entry, entityId, 'delete', after, null, undoneHere, result);
  } else if (entry.action === 'delete') {
    const before = asType(entry.before);
    if (current) await fail(w, entry, [], undoneHere);
    await s.db.insert(userType).values({
      userId: s.userId,
      id: entityId,
      universal: before.universal,
      packTypeKey: before.packTypeKey,
      customName: before.customName,
      sort: before.sort,
      archived: before.archived,
    });
    await recordUndo(w, entry, entityId, 'create', null, before, undoneHere, result);
  } else if (entry.action === 'update') {
    const before = asType(entry.before);
    const after = asType(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    await s.db
      .update(userType)
      .set({
        universal: before.universal,
        packTypeKey: before.packTypeKey,
        customName: before.customName,
        sort: before.sort,
        archived: before.archived,
      })
      .where(and(eq(userType.userId, s.userId), eq(userType.id, entityId)));
    await recordUndo(w, entry, entityId, 'update', after, before, undoneHere, result);
  } else {
    throw cannotUndo('This entry cannot be undone.');
  }
}

async function undoTag(
  w: WriteScope,
  entry: AuditRow,
  entityId: string,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const { s } = w;
  const row = (await loadTags(s)).find((t) => t.id === entityId);
  const current = row ? toTag(row) : undefined;
  if (entry.action === 'create') {
    const after = asTag(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    // As deleting a tag does: the holdings that carry it lose it, each change audited.
    for (const h of (await loadHoldings(s)).filter((h) => h.tagIds.includes(entityId))) {
      await saveHolding(w, h, { ...h, tagIds: h.tagIds.filter((t) => t !== entityId) });
    }
    await scrubPrefs(w, 'tag', entityId);
    await s.db.delete(tag).where(and(eq(tag.userId, s.userId), eq(tag.id, entityId)));
    await recordUndo(w, entry, entityId, 'delete', after, null, undoneHere, result);
  } else if (entry.action === 'delete') {
    const before = asTag(entry.before);
    if (current) await fail(w, entry, [], undoneHere);
    const clash = await tagClash(s, entityId, before.name);
    if (clash) {
      await fail(w, entry, [await newestFor(s, 'tag', clash.id)], undoneHere);
    }
    await s.db
      .insert(tag)
      .values({ userId: s.userId, id: entityId, name: before.name, sort: before.sort });
    await recordUndo(w, entry, entityId, 'create', null, before, undoneHere, result);
  } else if (entry.action === 'update') {
    const before = asTag(entry.before);
    const after = asTag(entry.after);
    if (!current || !sameJson(current, after)) await fail(w, entry, [], undoneHere);
    const clash = await tagClash(s, entityId, before.name);
    if (clash) {
      await fail(w, entry, [await newestFor(s, 'tag', clash.id)], undoneHere);
    }
    await s.db
      .update(tag)
      .set({ name: before.name, sort: before.sort })
      .where(and(eq(tag.userId, s.userId), eq(tag.id, entityId)));
    await recordUndo(w, entry, entityId, 'update', after, before, undoneHere, result);
  } else {
    throw cannotUndo('This entry cannot be undone.');
  }
}

async function undoPrefs(
  w: WriteScope,
  entry: AuditRow,
  entityId: string,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const { s } = w;
  const before = asPref(entry.before);
  const after = asPref(entry.after);
  const [stored] = await s.db
    .select({ value: prefs.value })
    .from(prefs)
    .where(and(eq(prefs.userId, s.userId), eq(prefs.key, entityId)))
    .limit(1);
  const current = stored === undefined ? null : { key: entityId, value: stored.value };
  if (!sameJson(current, after)) await fail(w, entry, [], undoneHere);
  if (before === null) {
    await s.db.delete(prefs).where(and(eq(prefs.userId, s.userId), eq(prefs.key, entityId)));
  } else {
    await s.db
      .insert(prefs)
      .values({ userId: s.userId, key: entityId, value: before.value })
      .onConflictDoUpdate({ target: [prefs.userId, prefs.key], set: { value: before.value } });
  }
  const action =
    entry.action === 'create'
      ? 'delete'
      : entry.action === 'delete'
        ? 'create'
        : entry.action === 'update'
          ? 'update'
          : null;
  if (!action) throw cannotUndo('This entry cannot be undone.');
  await recordUndo(w, entry, entityId, action, after, before, undoneHere, result);
}

async function undoLedger(
  w: WriteScope,
  entry: AuditRow,
  entityId: string,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const { s } = w;
  if (entry.action !== 'update') throw cannotUndo('The ledger’s creation cannot be undone.');
  const before = obj(entry.before);
  const after = obj(entry.after);
  if (typeof before?.baseCurrency !== 'string' || typeof after?.baseCurrency !== 'string') {
    throw cannotUndo('This ledger change cannot be undone.');
  }
  const state = await s.requireState();
  if (state.baseCurrency !== after.baseCurrency) await fail(w, entry, [], undoneHere);
  await s.db
    .update(ledgerState)
    .set({ baseCurrency: before.baseCurrency })
    .where(eq(ledgerState.userId, s.userId));
  await recordUndo(w, entry, entityId, 'update', after, before, undoneHere, result);
}

/** Undoes one entry: restores `before` exactly, or fails naming what stands in the way. */
async function undoRow(
  w: WriteScope,
  entry: AuditRow,
  undoneHere: Set<string>,
  result: UndoResult,
): Promise<void> {
  const entityId = entry.entityId;
  if (entityId === null) throw cannotUndo('This entry cannot be undone.');
  switch (entry.entity) {
    case 'value':
      await undoValue(w, entry, entityId, undoneHere, result);
      break;
    case 'holding':
      await undoHolding(w, entry, entityId, undoneHere, result);
      break;
    case 'type':
      await undoType(w, entry, entityId, undoneHere, result);
      break;
    case 'tag':
      await undoTag(w, entry, entityId, undoneHere, result);
      break;
    case 'prefs':
      await undoPrefs(w, entry, entityId, undoneHere, result);
      break;
    case 'ledger':
      await undoLedger(w, entry, entityId, undoneHere, result);
      break;
    case CONNECTION_ENTITY:
      throw cannotUndo(
        'Disconnecting an agent cannot be undone. Reconnect it from the agent instead.',
      );
    default:
      throw cannotUndo('This entry cannot be undone.');
  }
}

/**
 * `undo`: one entry, or a whole agent turn newest first and all or nothing (one transaction: a
 * conflict anywhere writes nothing). Entries already undone are skipped.
 */
export function undo(s: Scope, target: UndoTarget): Promise<Write<UndoResult>> {
  const t = parseInput(undoTargetSchema, target);
  if ('entryId' in t) {
    return runWrite(s, 'undo', async (w) => {
      const entry = await loadEntry(s, t.entryId);
      if (!entry) throw notFound('activity entry', t.entryId);
      const result: UndoResult = { undone: [], undoIds: [] };
      await undoRow(w, entry, new Set(), result);
      return result;
    });
  }
  return runWrite(s, 'undo', async (w) => {
    const rows = await s.db
      .select()
      .from(audit)
      .where(and(eq(audit.userId, s.userId), eq(audit.batchId, t.batchId)))
      .orderBy(desc(audit.at), desc(audit.id));
    if (rows.length === 0) throw notFound('batch', t.batchId);
    const result: UndoResult = { undone: [], undoIds: [] };
    const undoneHere = new Set<string>();
    for (const row of rows) {
      if (row.undoneBy !== null) continue;
      await undoRow(w, row, undoneHere, result);
    }
    return result;
  });
}
