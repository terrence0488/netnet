import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countriesSchema,
  demoHouseholdSchema,
  packSchema,
  type ContextHolding,
  type ContextInput,
  type ContextTag,
  type ContextType,
  type ContextValue,
  type Countries,
  type DemoHousehold,
  type Pack,
  type VersionedPack,
} from '@netnet/contracts';
import { convert, minorRate, packChain, resolveAccess, toMinor } from '@netnet/core';
import { readContent } from '../../../scripts/content-check';

/**
 * The demo household as both arms see it (P4-T1, P4-T9): the same `content/demo/household.json`
 * `pnpm demo:load` writes, and the context `core.compileContext` reads, built here without a
 * database so the ground truth is computed the way `Ledger.context()` would read it and a test can
 * pin it. Nothing in this file reaches the app: it is the harness's own reading of the file.
 *
 * Accessibility is resolved by `core.resolveAccess` over the live pack chain, so the household's
 * answers mean what the app would make of them; every value's base amount comes from the rate the
 * household gave, through `core.convert`, never from a published rate. All figures are the
 * household's own, and all of it is fictional (CONVENTIONS §6).
 */

/** The repository's root, from `ops/m12/src`. */
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** The household and what the harness computes from it: its context input and pack chain. */
export interface Household {
  readonly household: DemoHousehold;
  readonly context: ContextInput;
  readonly chain: VersionedPack[];
}

/** `content/demo/household.json`, checked by the schema `content:check` uses. */
export function readHousehold(root: string = REPO_ROOT): DemoHousehold {
  const text = readFileSync(resolve(root, 'content', 'demo', 'household.json'), 'utf8');
  return demoHouseholdSchema.parse(JSON.parse(text) as unknown);
}

/** The published-in-the-repository packs and country list: what a local run would serve. */
export function readContentDocs(root: string = REPO_ROOT): {
  packs: Pack[];
  countries: Countries;
} {
  const dir = resolve(root, 'content');
  const { docs } = readContent(dir);
  const packs: Pack[] = [];
  let countries: Countries = {};
  for (const { kind, body } of docs) {
    if (kind === 'pack') {
      const parsed = packSchema.safeParse(body);
      if (parsed.success) packs.push(parsed.data);
    } else if (kind === 'countries') {
      const parsed = countriesSchema.safeParse(body);
      if (parsed.success) countries = parsed.data;
    }
  }
  return { packs, countries };
}

/** The household's pack chain: its country's pack, then generic, at a placeholder version. */
export function householdChain(
  household: DemoHousehold,
  packs: readonly Pack[],
  countries: Countries,
): VersionedPack[] {
  const pack = countries[household.country]?.pack;
  return packChain(packs, pack).map((p) => ({ ...p, version: 1 }));
}

const tagId = (index: number) => `tag_m12_${String(index + 1).padStart(2, '0')}`;
const holdingId = (index: number) => `hld_m12_${String(index + 1).padStart(2, '0')}`;
const valueId = (holding: number, date: string) =>
  `val_m12_${String(holding + 1).padStart(2, '0')}_${date}`;

/** A value's amount in minor units and its stored base amount, from the household's own rate. */
function amounts(
  amount: string,
  currency: string,
  fxRate: string | undefined,
  baseCurrency: string,
): { amountMinor: number; baseMinor: number } {
  const minor = toMinor(amount, currency);
  if (typeof minor !== 'number')
    throw new RangeError(`The household's amount "${amount}" is not money: ${minor.message}`);
  if (currency === baseCurrency) {
    return { amountMinor: minor, baseMinor: minor };
  }
  if (fxRate === undefined) {
    throw new RangeError(`A ${currency} value gives no rate into ${baseCurrency}.`);
  }
  return {
    amountMinor: minor,
    baseMinor: convert(minor, minorRate(fxRate, currency, baseCurrency)),
  };
}

/**
 * The household as `core.compileContext` reads it: one holding per file entry (archived ones
 * included), the accessibility the pack chain gives, one type per universal-and-pack-type pair,
 * the household's tags, and every value at the rate it gives. Ids are stable and readable, so a
 * transcript can be compared with the file.
 */
export function buildHousehold(
  household: DemoHousehold,
  packs: readonly Pack[],
  countries: Countries,
): Household {
  const chain = householdChain(household, packs, countries);
  const tags: ContextTag[] = household.tags.map((name, i) => ({ id: tagId(i), name }));
  const tagIds = new Map(tags.map((tag) => [tag.name.toLowerCase(), tag.id]));

  const types: ContextType[] = [];
  const typeIds = new Map<string, string>();
  const typeFor = (universal: ContextHolding['universal'], packType: string | undefined) => {
    const key = `${universal}/${packType ?? ''}`;
    let id = typeIds.get(key);
    if (id === undefined) {
      id = `typ_m12_${String(typeIds.size + 1).padStart(2, '0')}`;
      typeIds.set(key, id);
      types.push({ id, universal, packTypeKey: packType ?? null, customName: null });
    }
    return id;
  };

  const holdings: ContextHolding[] = [];
  const values: ContextValue[] = [];
  household.holdings.forEach((h, index) => {
    const resolved = h.kind === 'liability' ? null : resolveAccess(chain, h.universal, h.access);
    holdings.push({
      id: holdingId(index),
      name: h.name,
      kind: h.kind,
      typeId: typeFor(h.universal, h.packType),
      universal: h.universal,
      currency: h.currency,
      cadenceDays: null,
      archived: h.archived ?? false,
      access: resolved === null ? null : resolved.access,
      tagIds: (h.tags ?? []).map((name) => tagIds.get(name.toLowerCase()) ?? name),
      accessReason: resolved !== null && 'reason' in resolved ? resolved.reason : null,
      accessUntil:
        resolved !== null && 'until' in resolved && resolved.until !== undefined
          ? resolved.until
          : null,
      accessBasis: resolved === null ? null : resolved.basis,
    });
    for (const value of h.values) {
      const { amountMinor, baseMinor } = amounts(
        value.amount,
        h.currency,
        value.fxRate,
        household.baseCurrency,
      );
      values.push({
        id: valueId(index, value.date),
        holdingId: holdingId(index),
        date: value.date,
        amountMinor,
        currency: h.currency,
        baseMinor,
        source: 'system',
        clientName: null,
        connectionId: null,
      });
    }
  });

  return {
    household,
    context: {
      baseCurrency: household.baseCurrency,
      holdings,
      values,
      types,
      tags,
      connections: [],
    },
    chain,
  };
}

/** The household, its content and its context in one call: what a run and its tests both read. */
export function readHouseholdData(root: string = REPO_ROOT): Household {
  const household = readHousehold(root);
  const { packs, countries } = readContentDocs(root);
  return buildHousehold(household, packs, countries);
}
