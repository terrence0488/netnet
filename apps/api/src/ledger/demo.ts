import {
  createHoldingSchema,
  type DemoHolding,
  type DemoHousehold,
  type PackRef,
} from '@netnet/contracts';
import { eq } from 'drizzle-orm';
import { AppError } from '../lib/errors';
import { addHolding, saveHolding } from './holdings';
import { FieldErrors, parseInput } from './input';
import { openLedger, type LedgerOptions } from './ledger';
import { prepareValue, type PreparedValue } from './money';
import { loadHoldings, loadTags, loadTypes, type TypeRow } from './rows';
import { holding } from './schema';
import { Scope } from './scope';
import { insertValues } from './values';
import type { Actor, WithUser } from './with-user';
import { runWrite } from './write';

/**
 * The fictional demo household (`content/demo/household.json`, P4-T1) loaded into one account
 * through the Ledger, for `pnpm demo:load`. Unlike `seedLedger`, which writes a fixture's rows, it
 * goes through the code every holding and value goes through (`addHolding`, `prepareValue`), so
 * the account reads exactly as if its holdings had been added by hand: accessibility resolved by
 * the live pack chain, every value converted at the rate it gives and kept as given (§6.6).
 */

/** NetNet, not the person or an agent: the log reads system changes. */
const SYSTEM: Actor = { kind: 'system' };

/** Why the household was not loaded, in plain words with no name, email or amount in them. */
export class DemoRefused extends Error {
  override readonly name = 'DemoRefused';
}

export const HAS_HOLDINGS =
  'The account already has holdings: the demo household loads only into an account with none. Nothing was written.';

/** What a load wrote, as counts only. */
export interface LoadedHousehold {
  holdings: number;
  archived: number;
  withoutValue: number;
  values: number;
  /** Tags made; a tag the account already had with the same name is used as it is. */
  tags: number;
}

/** Whether `userId`'s ledger has any holding, archived ones included. */
export async function hasHoldings(withUser: WithUser, userId: string): Promise<boolean> {
  return withUser(userId, SYSTEM, async (tx) => {
    const rows = await tx.db
      .select({ id: holding.id })
      .from(holding)
      .where(eq(holding.userId, userId))
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * Writes `household` into `userId`'s ledger in one transaction, as `system`, or nothing at all.
 * Refuses (`DemoRefused`) when the ledger has a holding. The country step is the one onboarding or
 * Settings takes: `init` for a ledger not yet made, else `changeCountry`, which with no holding
 * starts over in `household.baseCurrency` with `pack`'s types. Then the household's tags (one
 * write each), then one write per holding: the holding, its values as dated in the file, each
 * with its given rate, and its archiving. `options.content` must be the chain `pack` names, live.
 */
export async function loadHousehold(
  withUser: WithUser,
  options: LedgerOptions,
  userId: string,
  household: DemoHousehold,
  pack: PackRef,
): Promise<LoadedHousehold> {
  return withUser(
    userId,
    SYSTEM,
    async (tx) => {
      const ledger = openLedger(tx, options);
      const s = new Scope(tx, options);
      const state = await s.state();
      // Under the write lock: no other write can add a holding between this check and the load.
      if (state && (await loadHoldings(s)).length > 0) throw new DemoRefused(HAS_HOLDINGS);
      const country = { baseCurrency: household.baseCurrency, pack };
      if (state) await ledger.changeCountry(country);
      else await ledger.init(country);

      const have = new Map((await loadTags(s)).map((t) => [t.name.toLowerCase(), t.id]));
      const tagIds = new Map<string, string>();
      let tagsMade = 0;
      for (const name of household.tags) {
        let id = have.get(name.toLowerCase());
        if (id === undefined) {
          id = (await ledger.upsertTag({ name })).result.id;
          tagsMade += 1;
        }
        tagIds.set(name.toLowerCase(), id);
      }

      const types = await loadTypes(s);
      const total = household.holdings.length;
      for (const [index, h] of household.holdings.entries()) {
        const at = `Holding ${index + 1} of ${total}`;
        const type = typeFor(types, h, at);
        const tags = (h.tags ?? []).map((name) => tagIds.get(name.toLowerCase()) ?? name);
        try {
          await writeHolding(s, h, type, tags);
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          const fields = Object.keys(error.details?.fields ?? {});
          throw new DemoRefused(
            `${at} was refused (${error.code}${fields.length > 0 ? ` at ${fields.join(', ')}` : ''}): nothing was written.`,
            { cause: error },
          );
        }
      }

      return {
        holdings: total,
        archived: household.holdings.filter((h) => h.archived === true).length,
        withoutValue: household.holdings.filter((h) => h.values.length === 0).length,
        values: household.holdings.reduce((n, h) => n + h.values.length, 0),
        tags: tagsMade,
      };
    },
    { write: true },
  );
}

/** The type a holding goes in: its pack type, or undefined for the plain type of its universal. */
function typeFor(types: readonly TypeRow[], h: DemoHolding, at: string): string | undefined {
  if (h.packType === undefined) return undefined;
  const type = types.find(
    (t) => t.packTypeKey === h.packType && t.universal === h.universal && !t.archived,
  );
  if (!type) {
    throw new DemoRefused(
      `${at} names a pack type the account's packs do not have: nothing was written.`,
    );
  }
  return type.id;
}

/** One holding as one write: created as `createHolding` creates one, then its values, then archived. */
async function writeHolding(
  s: Scope,
  h: DemoHolding,
  typeId: string | undefined,
  tagIds: string[],
): Promise<void> {
  const input = parseInput(createHoldingSchema, {
    name: h.name,
    kind: h.kind,
    currency: h.currency,
    ...(typeId === undefined ? { universal: h.universal } : { typeId }),
    tagIds,
    ...(h.access === undefined ? {} : { access: h.access }),
    // Its own holdings may resemble each other (three accounts of one scheme); none is a duplicate.
    allowDuplicate: true,
  });
  await runWrite(s, 'loadHousehold', async (w) => {
    const created = await addHolding(w, input);
    const errors = new FieldErrors();
    const prepared: PreparedValue[] = [];
    for (const [i, v] of h.values.entries()) {
      const draft = { amount: v.amount, currency: h.currency, date: v.date, fxRate: v.fxRate };
      const ready = await prepareValue(w, draft, `values[${i}]`, errors);
      if (ready) prepared.push(ready);
    }
    errors.throwIfAny();
    await insertValues(w, created.id, prepared);
    if (h.archived === true) {
      await saveHolding(w, created, {
        ...created,
        archived: true,
        archivedAt: s.now().toISOString(),
      });
    }
  });
}
