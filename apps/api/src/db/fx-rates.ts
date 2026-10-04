import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from './client';
import { fxRate, type FX_SOURCES } from './schema';

/**
 * Reads and writes `core.fx_rate` (architecture §6.2, §6.6): one rate per date and currency, per
 * USD, with its source. Only `apps/api/src/db/**` touches `core` (CONVENTIONS §3).
 */
export type FxRateSource = (typeof FX_SOURCES)[number];

export interface StoredRate {
  date: string;
  currency: string;
  perUsd: string;
  source: FxRateSource;
}

type NeighbourRow = {
  side: 'before' | 'after';
  date: string;
  currency: string;
  perUsd: string;
  source: FxRateSource;
};

/** The rates either side of a date: the latest on or before it, and the first after it. */
export interface RateNeighbours {
  onOrBefore: StoredRate | undefined;
  after: StoredRate | undefined;
}

/**
 * The latest rate on or before `date` and the first after it, in one round trip: two index lookups
 * on (`currency`, `date`).
 */
export async function rateNeighbours(
  db: Executor,
  currency: string,
  date: string,
): Promise<RateNeighbours> {
  const { rows } = await db.execute<NeighbourRow>(sql`
    (select 'before' as side, r.date::text as date, r.currency, r.per_usd::text as "perUsd", r.source
       from core.fx_rate r where r.currency = ${currency} and r.date <= ${date}::date
      order by r.date desc limit 1)
    union all
    (select 'after', r.date::text, r.currency, r.per_usd::text, r.source
       from core.fx_rate r where r.currency = ${currency} and r.date > ${date}::date
      order by r.date asc limit 1)`);
  const pick = (side: 'before' | 'after'): StoredRate | undefined => {
    const row = rows.find((r) => r.side === side);
    return (
      row && { date: row.date, currency: row.currency, perUsd: row.perUsd, source: row.source }
    );
  };
  return { onOrBefore: pick('before'), after: pick('after') };
}

/** Every currency with at least one rate, by a skip scan of the (`currency`, `date`) index. */
export async function rateCurrencies(db: Executor): Promise<string[]> {
  const { rows } = await db.execute<{ currency: string }>(sql`
    with recursive found(currency) as (
      (select currency from core.fx_rate order by currency limit 1)
      union all
      select (select f.currency from core.fx_rate f where f.currency > found.currency
               order by f.currency limit 1)
        from found where found.currency is not null
    )
    select currency from found where currency is not null`);
  return rows.map((row) => row.currency);
}

/** The newest date `source` has a rate for, or null when it has none. */
export async function latestRateDate(db: Executor, source: FxRateSource): Promise<string | null> {
  const rows = await db
    .select({ date: fxRate.date })
    .from(fxRate)
    .where(eq(fxRate.source, source))
    .orderBy(desc(fxRate.date))
    .limit(1);
  return rows[0]?.date ?? null;
}

const INSERT_BATCH = 1000;

/**
 * Inserts rates, keeping any already stored for the same date and currency: a rate is recorded
 * once, as first fetched. Returns how many were new.
 */
export async function insertRates(db: Executor, rates: readonly StoredRate[]): Promise<number> {
  let inserted = 0;
  for (let start = 0; start < rates.length; start += INSERT_BATCH) {
    const batch = rates.slice(start, start + INSERT_BATCH);
    const result = await db
      .insert(fxRate)
      .values([...batch])
      .onConflictDoNothing();
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

/** The first and last date each of `currencies` has a rate for; a currency with none is absent. */
export async function rateSpans(
  db: Executor,
  currencies: readonly string[],
): Promise<{ currency: string; first: string; last: string }[]> {
  return db
    .select({
      currency: fxRate.currency,
      first: sql<string>`min(${fxRate.date})::text`,
      last: sql<string>`max(${fxRate.date})::text`,
    })
    .from(fxRate)
    .where(inArray(fxRate.currency, [...currencies]))
    .groupBy(fxRate.currency)
    .orderBy(fxRate.currency);
}
