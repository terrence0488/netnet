import {
  holdingFilterSchema,
  insightsExclusionsSchema,
  prefsPatchSchema,
  PREF_KEYS,
  type PrefKey,
  type Prefs,
  type PrefsPatch,
  type SavedExclusions,
  type SavedFilter,
  type Write,
} from '@netnet/contracts';
import { and, eq } from 'drizzle-orm';
import { FieldErrors, parseInput } from './input';
import { existingIds } from './rows';
import { prefs } from './schema';
import type { Scope } from './scope';
import { runWrite, sameJson, type WriteScope } from './write';

/**
 * Preferences that persist (PRD J4, J11): Home's and Insights' filters, Insights' exclusions,
 * the baseline and the sort. One row per key, stored under its snake_case name.
 */

const STORED_KEY: Record<PrefKey, string> = {
  homeFilter: 'home_filter',
  insightsFilter: 'insights_filter',
  insightsExclusions: 'insights_exclusions',
  baseline: 'baseline',
  sort: 'sort',
};

/** One stored pref as it is audited. */
interface PrefEntry {
  key: string;
  value: unknown;
}

async function storedPrefs(s: Scope): Promise<Map<string, unknown>> {
  const rows = await s.db
    .select({ key: prefs.key, value: prefs.value })
    .from(prefs)
    .where(eq(prefs.userId, s.userId));
  return new Map(rows.map((r) => [r.key, r.value]));
}

/** The prefs that are set. A stored value the contract no longer accepts is left out. */
export async function readPrefs(s: Scope): Promise<Prefs> {
  const stored = await storedPrefs(s);
  const out: Prefs = {};
  for (const key of PREF_KEYS) {
    if (!stored.has(STORED_KEY[key])) continue;
    const parsed = prefsPatchSchema.safeParse({ [key]: stored.get(STORED_KEY[key]) });
    const value = parsed.success ? parsed.data[key] : undefined;
    if (value !== undefined && value !== null) Object.assign(out, { [key]: value });
  }
  return out;
}

/** The ids a shape names, with the table each belongs to. */
interface IdLists {
  table: 'type' | 'tag' | 'holding';
  field: string;
  ids: string[];
}

/** The ids a filter names, with the table each belongs to. */
function filterIds(filter: SavedFilter): IdLists[] {
  return [
    { table: 'type', field: 'typeIds', ids: filter.typeIds ?? [] },
    { table: 'type', field: 'hideTypeIds', ids: filter.hideTypeIds ?? [] },
    { table: 'tag', field: 'tagIds', ids: filter.tagIds ?? [] },
    { table: 'tag', field: 'hideTagIds', ids: filter.hideTagIds ?? [] },
    { table: 'holding', field: 'hideHoldingIds', ids: filter.hideHoldingIds ?? [] },
  ];
}

/** The ids an exclusions list names, with the table each belongs to. */
function exclusionIds(exclusions: SavedExclusions): IdLists[] {
  return [
    { table: 'holding', field: 'holdingIds', ids: exclusions.holdingIds ?? [] },
    { table: 'type', field: 'typeIds', ids: exclusions.typeIds ?? [] },
    { table: 'tag', field: 'tagIds', ids: exclusions.tagIds ?? [] },
  ];
}

/** Writes `key` (or deletes it, for undefined) with its audit row, if it changed. */
async function putPref(w: WriteScope, key: string, before: unknown, after: unknown): Promise<void> {
  if (sameJson(before, after)) return;
  const { s } = w;
  const entry = (value: unknown): PrefEntry | null => (value === undefined ? null : { key, value });
  if (after === undefined) {
    await s.db.delete(prefs).where(and(eq(prefs.userId, s.userId), eq(prefs.key, key)));
  } else {
    await s.db
      .insert(prefs)
      .values({ userId: s.userId, key, value: after })
      .onConflictDoUpdate({ target: [prefs.userId, prefs.key], set: { value: after } });
  }
  const action = before === undefined ? 'create' : after === undefined ? 'delete' : 'update';
  await w.audit('prefs', key, action, entry(before), entry(after));
}

/**
 * `setPrefs`: each key given is set, or cleared with null. Filters and exclusions may name only
 * this user's ids.
 */
export function setPrefs(s: Scope, patch: PrefsPatch): Promise<Write<Prefs>> {
  const p = parseInput(prefsPatchSchema, patch);
  return runWrite(s, 'setPrefs', async (w) => {
    const errors = new FieldErrors();
    const named: { key: string; lists: IdLists[] }[] = [];
    for (const key of ['homeFilter', 'insightsFilter'] as const) {
      const filter = p[key];
      if (filter) named.push({ key, lists: filterIds(filter) });
    }
    if (p.insightsExclusions) {
      named.push({ key: 'insightsExclusions', lists: exclusionIds(p.insightsExclusions) });
    }
    for (const { key, lists } of named) {
      for (const { table, field, ids } of lists) {
        const found = await existingIds(s, table, ids);
        ids.forEach((id, i) => {
          if (!found.has(id)) {
            errors.add(
              'NOT_FOUND',
              `${key}.${field}[${i}]`,
              `There is no ${table} "${id}" in this account.`,
            );
          }
        });
      }
    }
    errors.throwIfAny();

    const stored = await storedPrefs(s);
    for (const key of PREF_KEYS) {
      const next = p[key];
      if (next === undefined) continue;
      const name = STORED_KEY[key];
      await putPref(w, name, stored.get(name), next === null ? undefined : next);
    }
    return readPrefs(s);
  });
}

/**
 * Keeps saved filters and exclusions pointing at what exists (PRD J2: nothing orphaned) when a
 * type, tag or holding goes: its id is swapped for `replacement` (a merge), or dropped.
 */
export async function scrubPrefs(
  w: WriteScope,
  table: 'type' | 'tag' | 'holding',
  id: string,
  replacement?: string,
): Promise<void> {
  const stored = await storedPrefs(w.s);
  const swap = (ids: string[]) =>
    ids.flatMap((x) => (x === id ? (replacement ? [replacement] : []) : [x]));
  for (const key of ['homeFilter', 'insightsFilter'] as const) {
    const name = STORED_KEY[key];
    const parsed = holdingFilterSchema.safeParse(stored.get(name));
    if (!parsed.success) continue;
    const filter: SavedFilter = { ...parsed.data };
    let changed = false;
    for (const { table: t, field, ids } of filterIds(filter)) {
      if (t !== table || !ids.includes(id)) continue;
      Object.assign(filter, { [field]: [...new Set(swap(ids))] });
      changed = true;
    }
    if (changed) await putPref(w, name, stored.get(name), filter);
  }
  const name = STORED_KEY.insightsExclusions;
  const parsed = insightsExclusionsSchema.safeParse(stored.get(name));
  if (!parsed.success) return;
  const exclusions: SavedExclusions = { ...parsed.data };
  let changed = false;
  for (const { table: t, field, ids } of exclusionIds(exclusions)) {
    if (t !== table || !ids.includes(id)) continue;
    Object.assign(exclusions, { [field]: [...new Set(swap(ids))] });
    changed = true;
  }
  if (changed) await putPref(w, name, stored.get(name), exclusions);
}
