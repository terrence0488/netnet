import {
  UNIVERSALS,
  packRefSchema,
  tagInputSchema,
  typeInputSchema,
  type PackRef,
  type Tag,
  type TagInput,
  type TypeInput,
  type UserType,
  type VersionedPack,
  type Write,
} from '@netnet/contracts';
import { currencyExponent } from '@netnet/contracts/currencies';
import { and, eq, ne, sql } from 'drizzle-orm';
import { accessAfterTypeChange } from './access';
import { saveHolding, nextTypeSort } from './holdings';
import { FieldErrors, notFound, parseInput } from './input';
import { scrubPrefs } from './prefs';
import {
  loadHoldings,
  loadTags,
  loadType,
  loadTypes,
  toTag,
  toUserType,
  type TypeRow,
} from './rows';
import { ledgerState, tag, userType } from './schema';
import type { Scope } from './scope';
import { requireWrite, runWrite } from './write';

/**
 * The user's own taxonomy (PRD J2, architecture §6.3): types and tags. A type stores no name until
 * the user renames it, so its label follows the current pack. Renaming, merging and deleting
 * leave nothing orphaned: holdings and saved filters follow.
 */

/** The pack types in `packs` (the chain's order), each key once. */
function packTypes(packs: readonly VersionedPack[]): VersionedPack['types'] {
  const seen = new Set<string>();
  return packs.flatMap((p) => p.types).filter((t) => !seen.has(t.key) && seen.add(t.key));
}

function newTypeRow(
  s: Scope,
  fields: Pick<TypeRow, 'universal' | 'packTypeKey' | 'customName' | 'sort'>,
): TypeRow {
  return { userId: s.userId, id: s.id('typ'), archived: false, ...fields };
}

/**
 * `init`: the ledger, in `baseCurrency`, with one type per universal type and the pack chain's own
 * types. Run once, at the end of onboarding; once the ledger exists it does nothing.
 */
export async function init(
  s: Scope,
  input: { baseCurrency: string; pack: PackRef },
): Promise<void> {
  requireWrite(s, 'init');
  const pack = parseInput(packRefSchema, input.pack, 'pack');
  const baseCurrency = typeof input.baseCurrency === 'string' ? input.baseCurrency : '';
  if (currencyExponent(baseCurrency) === undefined) {
    const errors = new FieldErrors();
    errors.add(
      'CURRENCY_UNSUPPORTED',
      'baseCurrency',
      'Give the default currency as an ISO 4217 code in circulation, such as "USD".',
    );
    errors.throwIfAny();
  }
  const packs = await s.options.content.packs(pack);
  const createdAt = s.now();
  const [created] = await s.db
    .insert(ledgerState)
    .values({ userId: s.userId, baseCurrency, dataVersion: 0, createdAt })
    .onConflictDoNothing()
    .returning({ userId: ledgerState.userId });
  // The ledger exists already; a concurrent init waits on this insert until the first commits.
  if (!created) return;
  await runWrite(
    s,
    'init',
    async (w) => {
      await w.audit('ledger', s.userId, 'create', null, {
        baseCurrency,
        createdAt: createdAt.toISOString(),
      });
      const rows = [
        ...UNIVERSALS.map((universal, sort) =>
          newTypeRow(s, { universal, packTypeKey: null, customName: null, sort }),
        ),
        ...packTypes(packs).map((t, i) =>
          newTypeRow(s, {
            universal: t.u,
            packTypeKey: t.key,
            customName: null,
            sort: UNIVERSALS.length + i,
          }),
        ),
      ];
      await s.db.insert(userType).values(rows);
      for (const row of rows) await w.audit('type', row.id, 'create', null, toUserType(row));
    },
    { baseCurrency, dataVersion: 0 },
  );
}

/** `applyPackTypes`: adds the pack types the user lacks, and removes none (PRD J2). */
export function applyPackTypes(s: Scope, ref: PackRef): Promise<Write<UserType[]>> {
  const pack = parseInput(packRefSchema, ref, 'pack');
  return runWrite(s, 'applyPackTypes', async (w) => {
    const packs = await s.options.content.packs(pack);
    const have = new Set((await loadTypes(s)).map((t) => t.packTypeKey));
    const missing = packTypes(packs).filter((t) => !have.has(t.key));
    if (missing.length === 0) return [];
    const sort = await nextTypeSort(s);
    const rows = missing.map((t, i) =>
      newTypeRow(s, { universal: t.u, packTypeKey: t.key, customName: null, sort: sort + i }),
    );
    await s.db.insert(userType).values(rows);
    const added = rows.map(toUserType);
    for (const t of added) await w.audit('type', t.id, 'create', null, t);
    return added;
  });
}

/** `upsertType` (`upsert_type`): a new type of a universal type, or a rename. */
export function upsertType(s: Scope, input: TypeInput): Promise<Write<UserType>> {
  const i = parseInput(typeInputSchema, input);
  return runWrite(s, 'upsertType', async (w) => {
    if (i.id === undefined) {
      if (i.universal === undefined) throw new Error('unreachable: the schema requires universal');
      const row = newTypeRow(s, {
        universal: i.universal,
        packTypeKey: null,
        customName: i.name,
        sort: await nextTypeSort(s),
      });
      await s.db.insert(userType).values(row);
      const created = toUserType(row);
      await w.audit('type', created.id, 'create', null, created);
      return created;
    }
    const current = await loadType(s, i.id);
    if (!current) throw notFound('type', i.id);
    if (i.universal !== undefined && i.universal !== current.universal) {
      const errors = new FieldErrors();
      errors.add(
        'VALIDATION_FAILED',
        'universal',
        `A type keeps the universal type it was made with ("${current.universal}"). Make a new type of "${i.universal}" and move holdings to it.`,
      );
      errors.throwIfAny();
    }
    if (current.customName === i.name) return toUserType(current);
    await s.db
      .update(userType)
      .set({ customName: i.name })
      .where(and(eq(userType.userId, s.userId), eq(userType.id, current.id)));
    const renamed = toUserType({ ...current, customName: i.name });
    await w.audit('type', current.id, 'update', toUserType(current), renamed);
    return renamed;
  });
}

/**
 * `deleteType` (`delete_type`). While holdings use the type it needs `moveTo`, the type they move
 * to (a merge); each holding's move is audited, and saved filters follow.
 */
export function deleteType(s: Scope, id: string, moveTo?: string): Promise<Write<void>> {
  return runWrite(s, 'deleteType', async (w) => {
    const current = await loadType(s, id);
    if (!current) throw notFound('type', id);
    const errors = new FieldErrors();
    let target: TypeRow | undefined;
    if (moveTo !== undefined) {
      if (moveTo === id) {
        errors.add('VALIDATION_FAILED', 'moveTo', 'Give another type to move the holdings to.');
      } else {
        target = await loadType(s, moveTo);
        if (!target)
          errors.add('NOT_FOUND', 'moveTo', `There is no type "${moveTo}" in this account.`);
      }
    }
    errors.throwIfAny();
    const using = (await loadHoldings(s)).filter((h) => h.typeId === id);
    if (using.length > 0 && !target) {
      errors.add(
        'VALIDATION_FAILED',
        'moveTo',
        `${using.length === 1 ? 'A holding uses' : `${using.length} holdings use`} this type: give moveTo, the type to move ${using.length === 1 ? 'it' : 'them'} to.`,
      );
      errors.throwIfAny();
    }
    if (target) {
      for (const h of using) {
        const access = await accessAfterTypeChange(
          s,
          h,
          current.universal,
          target.universal,
          errors,
        );
        errors.throwIfAny();
        if (!access) throw new Error('unreachable: a carried answer always applies');
        await saveHolding(w, h, { ...h, typeId: target.id, ...access });
      }
    }
    await scrubPrefs(w, 'type', id, target?.id);
    await s.db.delete(userType).where(and(eq(userType.userId, s.userId), eq(userType.id, id)));
    await w.audit('type', id, 'delete', toUserType(current), null);
  });
}

/** VALIDATION_FAILED when another of the user's tags already has `name`, case aside. */
async function refuseTakenName(s: Scope, name: string, self: string | undefined): Promise<void> {
  const [clash] = await s.db
    .select({ id: tag.id })
    .from(tag)
    .where(
      and(
        eq(tag.userId, s.userId),
        sql`lower(${tag.name}) = lower(${name})`,
        self === undefined ? undefined : ne(tag.id, self),
      ),
    )
    .limit(1);
  if (!clash) return;
  const errors = new FieldErrors();
  errors.add(
    'VALIDATION_FAILED',
    'name',
    self === undefined
      ? `A tag with this name already exists ("${clash.id}"): use it.`
      : `Another tag already has this name ("${clash.id}"): merge into it with deleteTag and mergeInto.`,
  );
  errors.throwIfAny();
}

/** `upsertTag` (`upsert_tag`): a new tag, or a rename. Names are unique, case aside. */
export function upsertTag(s: Scope, input: TagInput): Promise<Write<Tag>> {
  const i = parseInput(tagInputSchema, input);
  return runWrite(s, 'upsertTag', async (w) => {
    if (i.id === undefined) {
      await refuseTakenName(s, i.name, undefined);
      const tags = await loadTags(s);
      const row = {
        userId: s.userId,
        id: s.id('tag'),
        name: i.name,
        sort: tags.reduce((max, t) => Math.max(max, t.sort + 1), 0),
      };
      await s.db.insert(tag).values(row);
      const created = toTag(row);
      await w.audit('tag', created.id, 'create', null, created);
      return created;
    }
    const [current] = (await loadTags(s)).filter((t) => t.id === i.id);
    if (!current) throw notFound('tag', i.id);
    if (current.name === i.name) return toTag(current);
    await refuseTakenName(s, i.name, current.id);
    await s.db
      .update(tag)
      .set({ name: i.name })
      .where(and(eq(tag.userId, s.userId), eq(tag.id, current.id)));
    const renamed = toTag({ ...current, name: i.name });
    await w.audit('tag', current.id, 'update', toTag(current), renamed);
    return renamed;
  });
}

/**
 * `deleteTag` (`delete_tag`). Holdings that carry the tag lose it, or carry `mergeInto` instead (a
 * merge); a tag is only a label, so nothing is refused. Each holding's change is audited, so undo
 * can put the tag back, and saved filters follow.
 */
export function deleteTag(s: Scope, id: string, mergeInto?: string): Promise<Write<void>> {
  return runWrite(s, 'deleteTag', async (w) => {
    const tags = await loadTags(s);
    const current = tags.find((t) => t.id === id);
    if (!current) throw notFound('tag', id);
    const errors = new FieldErrors();
    if (mergeInto !== undefined) {
      if (mergeInto === id) {
        errors.add('VALIDATION_FAILED', 'mergeInto', 'Give another tag to merge this one into.');
      } else if (!tags.some((t) => t.id === mergeInto)) {
        errors.add('NOT_FOUND', 'mergeInto', `There is no tag "${mergeInto}" in this account.`);
      }
    }
    errors.throwIfAny();
    const carrying = (await loadHoldings(s)).filter((h) => h.tagIds.includes(id));
    for (const h of carrying) {
      const tagIds = [
        ...new Set(h.tagIds.flatMap((t) => (t !== id ? [t] : mergeInto ? [mergeInto] : []))),
      ].sort();
      await saveHolding(w, h, { ...h, tagIds });
    }
    await scrubPrefs(w, 'tag', id, mergeInto);
    await s.db.delete(tag).where(and(eq(tag.userId, s.userId), eq(tag.id, id)));
    await w.audit('tag', id, 'delete', toTag(current), null);
  });
}
