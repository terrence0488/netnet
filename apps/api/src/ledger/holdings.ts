import {
  createHoldingSchema,
  holdingPatchSchema,
  type CreateHolding,
  type Holding,
  type HoldingDraft,
  type HoldingPatch,
  type Universal,
  type Write,
} from '@netnet/contracts';
import { currencyExponent } from '@netnet/contracts/currencies';
import { likelyDuplicates } from '@netnet/core';
import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '../lib/errors';
import { NO_ACCESS, accessAfterTypeChange, applyAccess, type AccessFields } from './access';
import { FieldErrors, notFound, parseInput } from './input';
import { prepareValue, type PreparedValue } from './money';
import { scrubPrefs } from './prefs';
import {
  existingIds,
  holdingIn,
  loadHolding,
  loadHoldings,
  loadLatestValues,
  loadType,
  loadTypes,
  loadValues,
  toHolding,
  toUserType,
  valueIn,
  type HoldingRow,
  type TypeRow,
} from './rows';
import { holding, holdingTag, userType } from './schema';
import type { Scope } from './scope';
import { insertValue } from './values';
import { runWrite, sameJson, type WriteScope } from './write';

/**
 * Holdings (PRD J2, J6): created with their accessibility applied and, if given, an opening value;
 * renamed, retyped, retagged, re-answered, archived and unarchived; deleted with their history,
 * which the audit keeps.
 */

const LIABILITY_ACCESS =
  'A liability has no accessibility: what is owed never counts as money to use. Leave access out.';

/** `tagIds` without repeats, in id order, each one this user's; a missing one is NOT_FOUND. */
async function checkTags(
  s: Scope,
  tagIds: readonly string[],
  path: string,
  errors: FieldErrors,
): Promise<string[]> {
  const found = await existingIds(s, 'tag', tagIds);
  tagIds.forEach((id, i) => {
    if (!found.has(id))
      errors.add('NOT_FOUND', `${path}[${i}]`, `There is no tag "${id}" in this account.`);
  });
  return [...new Set(tagIds)].sort();
}

/** The user's type for `universal`: the plain one `init` made, else the first of that universal. */
async function typeForUniversal(s: Scope, universal: Universal): Promise<TypeRow | undefined> {
  const types = (await loadTypes(s)).filter((t) => t.universal === universal && !t.archived);
  const rank = (t: TypeRow) => (t.packTypeKey === null ? 0 : 1) + (t.customName === null ? 0 : 2);
  return types.sort((a, b) => rank(a) - rank(b))[0];
}

/** The next free `sort` among the user's types. */
export async function nextTypeSort(s: Scope): Promise<number> {
  const types = await loadTypes(s);
  return types.reduce((max, t) => Math.max(max, t.sort + 1), 0);
}

/** LIKELY_DUPLICATE with up to three candidates when `draft` resembles a holding (§7.4). */
async function refuseDuplicates(s: Scope, draft: HoldingDraft): Promise<void> {
  const holdings = await loadHoldings(s);
  if (holdings.length === 0) return;
  const universals = new Map((await loadTypes(s)).map((t) => [t.id, t.universal]));
  const latest = new Map(
    [...(await loadLatestValues(s))].map(([id, v]) => [id, valueIn(v)] as const),
  );
  const candidates = likelyDuplicates(
    holdings.map((h) => holdingIn(h, universals.get(h.typeId) ?? 'other')),
    draft,
    latest,
  );
  if (candidates.length > 0) {
    throw new AppError(
      'LIKELY_DUPLICATE',
      `This looks like ${candidates.length === 1 ? 'a holding' : `${candidates.length} holdings`} already tracked (candidates). Update one of them instead, or create it anyway with allowDuplicate.`,
      { candidates },
    );
  }
}

/** The holding's row columns, from its contract form. */
function columns(h: Holding) {
  return {
    name: h.name,
    typeId: h.typeId,
    cadenceDays: h.cadenceDays,
    archivedAt: h.archivedAt === null ? null : new Date(h.archivedAt),
    rowVersion: h.rowVersion,
    access: h.access,
    accessReason: h.accessReason,
    accessUntil: h.accessUntil,
    accessBasis: h.accessBasis,
  };
}

/**
 * Writes `next` over `current` with its audit row, if anything differs: its row, its tags and a
 * new `row_version`. Merges of types and tags move holdings through here too.
 */
export async function saveHolding(
  w: WriteScope,
  current: Holding,
  next: Holding,
): Promise<Holding> {
  if (sameJson(current, next)) return current;
  const { s } = w;
  const saved: Holding = { ...next, rowVersion: current.rowVersion + 1 };
  await s.db
    .update(holding)
    .set(columns(saved))
    .where(and(eq(holding.userId, s.userId), eq(holding.id, current.id)));
  const removed = current.tagIds.filter((t) => !saved.tagIds.includes(t));
  const added = saved.tagIds.filter((t) => !current.tagIds.includes(t));
  if (removed.length > 0) {
    await s.db
      .delete(holdingTag)
      .where(
        and(
          eq(holdingTag.userId, s.userId),
          eq(holdingTag.holdingId, current.id),
          inArray(holdingTag.tagId, removed),
        ),
      );
  }
  if (added.length > 0) {
    await s.db
      .insert(holdingTag)
      .values(added.map((tagId) => ({ userId: s.userId, holdingId: current.id, tagId })));
  }
  await w.audit('holding', current.id, 'update', current, saved);
  return saved;
}

/** `createHolding` (`POST /api/holdings`, `create_holding`). */
export function createHolding(s: Scope, input: CreateHolding): Promise<Write<Holding>> {
  const i = parseInput(createHoldingSchema, input);
  return runWrite(s, 'createHolding', async (w) => {
    const errors = new FieldErrors();
    let type: TypeRow | undefined;
    let newType: TypeRow | undefined;
    if (i.typeId !== undefined) {
      type = await loadType(s, i.typeId);
      if (!type)
        errors.add('NOT_FOUND', 'typeId', `There is no type "${i.typeId}" in this account.`);
    } else if (i.universal !== undefined) {
      type = await typeForUniversal(s, i.universal);
      if (!type) {
        newType = {
          userId: s.userId,
          id: s.id('typ'),
          universal: i.universal,
          packTypeKey: null,
          customName: null,
          sort: await nextTypeSort(s),
          archived: false,
        };
        type = newType;
      }
    }
    const known = currencyExponent(i.currency) !== undefined;
    if (!known) {
      errors.add(
        'CURRENCY_UNSUPPORTED',
        'currency',
        `"${i.currency}" is not an ISO 4217 currency in circulation. Use a code such as "USD".`,
      );
    }
    const tagIds = await checkTags(s, i.tagIds ?? [], 'tagIds', errors);
    let access: AccessFields | undefined = NO_ACCESS;
    if (i.kind === 'liability') {
      if (i.access !== undefined) errors.add('VALIDATION_FAILED', 'access', LIABILITY_ACCESS);
    } else if (type) {
      access = await applyAccess(s, type.universal, i.access, 'access', errors);
    }
    let opening: PreparedValue | undefined;
    if (i.opening && known) {
      opening = await prepareValue(
        w,
        {
          amount: i.opening.amount,
          currency: i.currency,
          date: i.opening.date,
          fxRate: i.opening.fxRate,
        },
        'opening',
        errors,
      );
    }
    errors.throwIfAny();
    if (!type || !access) throw new Error('unreachable: checked above');

    if (i.allowDuplicate !== true) {
      await refuseDuplicates(s, {
        name: i.name,
        kind: i.kind,
        currency: i.currency,
        universal: type.universal,
      });
    }

    if (newType) {
      await s.db.insert(userType).values(newType);
      await w.audit('type', newType.id, 'create', null, toUserType(newType));
    }
    const row: HoldingRow = {
      userId: s.userId,
      id: s.id('hld'),
      name: i.name,
      kind: i.kind,
      typeId: type.id,
      currency: i.currency,
      cadenceDays: null,
      archivedAt: null,
      createdAt: s.now(),
      rowVersion: 1,
      ...access,
    };
    await s.db.insert(holding).values(row);
    if (tagIds.length > 0) {
      await s.db
        .insert(holdingTag)
        .values(tagIds.map((tagId) => ({ userId: s.userId, holdingId: row.id, tagId })));
    }
    const created = toHolding(row, tagIds);
    await w.audit('holding', created.id, 'create', null, created);

    const source = w.eventSource;
    if (source) {
      w.event({
        name: 'holding_created',
        props: source === 'web' && i.via !== undefined ? { source, via: i.via } : { source },
      });
    }
    if (opening) {
      await insertValue(w, created.id, opening);
      if (source) w.event({ name: 'value_recorded', props: { source } });
    }
    return created;
  });
}

/**
 * `updateHolding` (`PATCH /api/holdings/:id`, `update_holding`). A new `access` answer is applied
 * with the current pack; `access: null` goes back to the type's default. A move to a type of
 * another universal type resolves its accessibility again (`accessAfterTypeChange`).
 */
export function updateHolding(s: Scope, id: string, patch: HoldingPatch): Promise<Write<Holding>> {
  const p = parseInput(holdingPatchSchema, patch);
  return runWrite(s, 'updateHolding', async (w) => {
    const current = await loadHolding(s, id);
    if (!current) throw notFound('holding', id);
    const errors = new FieldErrors();
    const currentType = await loadType(s, current.typeId);
    if (!currentType) throw new Error('A holding’s type is missing: the foreign key forbids it.');
    let nextType: TypeRow | undefined = currentType;
    if (p.typeId !== undefined && p.typeId !== current.typeId) {
      nextType = await loadType(s, p.typeId);
      if (!nextType)
        errors.add('NOT_FOUND', 'typeId', `There is no type "${p.typeId}" in this account.`);
    }
    const tagIds =
      p.tagIds === undefined ? current.tagIds : await checkTags(s, p.tagIds, 'tagIds', errors);

    let access: AccessFields | undefined = {
      access: current.access,
      accessReason: current.accessReason,
      accessUntil: current.accessUntil,
      accessBasis: current.accessBasis,
    };
    if (current.kind === 'liability') {
      if (p.access !== undefined && p.access !== null) {
        errors.add('VALIDATION_FAILED', 'access', LIABILITY_ACCESS);
      }
    } else if (nextType && p.access !== undefined) {
      access = await applyAccess(s, nextType.universal, p.access ?? undefined, 'access', errors);
    } else if (nextType && nextType.id !== currentType.id) {
      access = await accessAfterTypeChange(
        s,
        current,
        currentType.universal,
        nextType.universal,
        errors,
      );
    }
    errors.throwIfAny();
    if (!nextType || !access) throw new Error('unreachable: checked above');

    const archivedAt =
      p.archived === true
        ? (current.archivedAt ?? s.now().toISOString())
        : p.archived === false
          ? null
          : current.archivedAt;
    return saveHolding(w, current, {
      ...current,
      name: p.name ?? current.name,
      typeId: nextType.id,
      cadenceDays: p.cadenceDays === undefined ? current.cadenceDays : p.cadenceDays,
      archived: archivedAt !== null,
      archivedAt,
      ...access,
      tagIds,
    });
  });
}

/**
 * `deleteHolding` (`DELETE /api/holdings/:id`, `delete_holding`): the holding, its values and
 * its tags go; its audit row keeps all of them, values included, so the log reads what went.
 */
export function deleteHolding(s: Scope, id: string): Promise<Write<void>> {
  return runWrite(s, 'deleteHolding', async (w) => {
    const current = await loadHolding(s, id);
    if (!current) throw notFound('holding', id);
    const values = await loadValues(s, [id]);
    await s.db.delete(holding).where(and(eq(holding.userId, s.userId), eq(holding.id, id)));
    await w.audit('holding', id, 'delete', { ...current, values }, null);
    await scrubPrefs(w, 'holding', id);
  });
}
