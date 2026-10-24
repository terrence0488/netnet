import type { Value } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFx, type RateReader } from '../../src/content/fx';
import type { StoredRate } from '../../src/db/fx-rates';
import { openLedger, type Ledger } from '../../src/ledger/ledger';
import type { LedgerOptions } from '../../src/ledger/scope';
import type { Actor } from '../../src/ledger/with-user';
import type { TestDatabase } from '../isolation/harness';
import { createTestDatabase } from '../isolation/harness';
import {
  USER,
  agentActor,
  appError,
  auditRows,
  dataVersion,
  ledgerSuite,
  newUserId,
  type LedgerSuite,
} from './support';

/**
 * Changing the default currency (architecture §6.6): every value's `base_minor` re-derived at the
 * value's own date, as one `system` write with one audit entry. A rate the person or their agent
 * gave stays as given, so a round trip lands back on it exactly; every other value reads as a
 * ledger recorded fresh in the new currency. The rates below move between July and August, so a
 * value re-derived at the wrong date reads wrong.
 */
let db: TestDatabase;
let suite: LedgerSuite;
let options: LedgerOptions;

const SYSTEM: Actor = { kind: 'system' };

/** Fictional rates per USD on two dates; every other currency has none. */
const RATES: Record<string, Record<string, string>> = {
  EUR: { '2026-07-01': '0.8', '2026-08-01': '0.9' },
  GBP: { '2026-07-01': '0.75', '2026-08-01': '0.78' },
  JPY: { '2026-07-01': '150', '2026-08-01': '160' },
  SGD: { '2026-07-01': '1.3', '2026-08-01': '1.28' },
};

function datedRates(): RateReader {
  return {
    neighbours(currency, date) {
      const dates = Object.keys(RATES[currency] ?? {}).sort();
      const rate = (found: string | undefined): StoredRate | undefined =>
        found === undefined
          ? undefined
          : { date: found, currency, perUsd: RATES[currency]![found]!, source: 'ecb' };
      return Promise.resolve({
        onOrBefore: rate(dates.filter((d) => d <= date).at(-1)),
        after: rate(dates.find((d) => d > date)),
      });
    },
    currencies: () => Promise.resolve(Object.keys(RATES)),
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
  options = {
    fx: createFx(datedRates()),
    content: suite.content.forCountry(null),
    timeZone: 'UTC',
  };
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** `userId`'s Ledger over the two-date rates, as `actor`. */
function as(userId: string, actor: Actor = USER) {
  const run = <T>(fn: (l: Ledger) => Promise<T>, write?: boolean) =>
    db.withUser(userId, actor, (tx) => fn(openLedger(tx, options)), write ? { write: true } : {});
  return {
    read: <T>(fn: (l: Ledger) => Promise<T>) => run(fn),
    write: <T>(fn: (l: Ledger) => Promise<T>) => run(fn, true),
  };
}

/** A new user with a ledger in `baseCurrency`, over the two-date rates. */
async function newUser(baseCurrency = 'USD'): Promise<string> {
  const userId = newUserId();
  await as(userId).write((l) => l.init({ baseCurrency, pack: suite.content.ref(null) }));
  return userId;
}

/** A holding in `currency`, with `values` recorded (a rate where the draft gives one). */
async function holdingWith(
  userId: string,
  name: string,
  currency: string,
  values: { amount: string; date: string; fxRate?: string }[],
  actor: Actor = USER,
): Promise<string> {
  const holding = await as(userId).write((l) =>
    l.createHolding({ name, kind: 'asset', universal: 'cash', currency }),
  );
  await as(userId, actor).write((l) =>
    l.recordValues(values.map((v) => ({ holdingId: holding.result.id, ...v }))),
  );
  return holding.result.id;
}

/** Every value of `holdingId`, oldest first, as the API shows them. */
async function valuesOf(userId: string, holdingId: string) {
  const detail = await as(userId).read((l) => l.getHolding(holdingId, { limit: 100 }));
  return [...detail.values.items].sort((a, b) => a.date.localeCompare(b.date));
}

/** The fields a re-derivation leaves alone: what was entered, by whom and when. */
function provenanceOf(v: Value) {
  return {
    id: v.id,
    date: v.date,
    amountMinor: v.amountMinor,
    currency: v.currency,
    source: v.source,
    clientName: v.clientName,
    connectionId: v.connectionId,
    batchId: v.batchId,
    enteredAt: v.enteredAt,
  };
}

/** The given rate as stored, with who gave it, or null. */
async function givenOf(valueId: string) {
  const [row] = await suite.rows<{
    rate: string | null;
    into: string | null;
    by: string | null;
  }>(
    `select given_rate as rate, given_rate_into as into, given_rate_by as by
       from ledger.value where id = $1`,
    [valueId],
  );
  if (!row) throw new Error(`No value ${valueId}`);
  return row.rate === null ? null : row;
}

/** What each holding of the three-currency ledger is given, in its own currency. */
const DRAFTS = {
  sgd: [{ amount: '5000', date: '2026-07-15' }],
  // The person's own rate from a statement: 1 USD = 1.35 SGD.
  usd: [
    { amount: '1000', date: '2026-07-25', fxRate: '1.35' },
    { amount: '1200', date: '2026-08-01' },
  ],
  // The agent's: 1 EUR = 1.42 SGD.
  eur: [
    { amount: '2000', date: '2026-07-10', fxRate: '1.42' },
    { amount: '2100', date: '2026-08-02' },
  ],
};

type Holdings = Record<keyof typeof DRAFTS, string>;

/**
 * A ledger in `baseCurrency` holding SGD, USD and EUR, with a rate the person gave and one an
 * agent gave (into SGD) when `rated`, and the values with no rate either way.
 */
async function threeCurrencyLedger(baseCurrency = 'SGD', rated = true) {
  const userId = await newUser(baseCurrency);
  const connection = await suite.connect(userId);
  const pick = (drafts: { amount: string; date: string; fxRate?: string }[]) =>
    rated ? drafts : drafts.filter((d) => d.fxRate === undefined);
  const holdings: Holdings = {
    sgd: await holdingWith(userId, 'Savings', 'SGD', pick(DRAFTS.sgd)),
    usd: await holdingWith(userId, 'Brokerage', 'USD', pick(DRAFTS.usd)),
    eur: await holdingWith(userId, 'Euro fund', 'EUR', pick(DRAFTS.eur), agentActor(connection)),
  };
  return { userId, holdings, connection };
}

/** Every value of the ledger, holding by holding, oldest first. */
async function everyValue(userId: string, holdings: Holdings): Promise<Value[]> {
  const lists = await Promise.all(
    [holdings.sgd, holdings.usd, holdings.eur].map((id) => valuesOf(userId, id)),
  );
  return lists.flat();
}

/** Each value without a given rate reads exactly as a ledger recorded fresh in `code`. */
async function expectFresh(userId: string, holdings: Holdings, code: string): Promise<void> {
  const fresh = await threeCurrencyLedger(code, false);
  const unrated = (await everyValue(userId, holdings)).filter((v) => v.givenRate === null);
  expect(unrated.map(baseOf)).toStrictEqual(
    (await everyValue(fresh.userId, fresh.holdings)).map(baseOf),
  );
}

/** The base fields a re-derivation may change. */
function baseOf(v: {
  baseMinor: number;
  baseCurrency: string;
  fxRate: string;
  fxRateDate: string | null;
  fxSource: string;
}) {
  return {
    baseMinor: v.baseMinor,
    baseCurrency: v.baseCurrency,
    fxRate: v.fxRate,
    fxRateDate: v.fxRateDate,
    fxSource: v.fxSource,
  };
}

describe('changeBaseCurrency', () => {
  it('re-derives every value at its own date, as if the new currency had always been the base', async () => {
    const drafts = {
      eur: [
        { amount: '1000', date: '2026-07-15' },
        { amount: '2000', date: '2026-08-01' },
      ],
      gbp: [{ amount: '500', date: '2026-07-20' }],
      usd: [{ amount: '300', date: '2026-08-01' }],
    };
    const changed = await newUser('USD');
    const eur = await holdingWith(changed, 'Euro savings', 'EUR', drafts.eur);
    const gbp = await holdingWith(changed, 'Pound savings', 'GBP', drafts.gbp);
    const usd = await holdingWith(changed, 'Dollar savings', 'USD', drafts.usd);
    const fresh = await newUser('GBP');
    const freshEur = await holdingWith(fresh, 'Euro savings', 'EUR', drafts.eur);
    const freshGbp = await holdingWith(fresh, 'Pound savings', 'GBP', drafts.gbp);
    const freshUsd = await holdingWith(fresh, 'Dollar savings', 'USD', drafts.usd);

    const write = await as(changed, SYSTEM).write((l) => l.changeBaseCurrency('GBP'));

    expect(write.result).toBeUndefined();
    expect(write.warnings).toEqual([]);
    expect(write.events).toEqual([]);
    // Each value reads exactly as the fresh ledger's recording of the same draft.
    for (const [a, b] of [
      [eur, freshEur],
      [gbp, freshGbp],
      [usd, freshUsd],
    ] as const) {
      const [got, wanted] = await Promise.all([valuesOf(changed, a), valuesOf(fresh, b)]);
      expect(got.map(baseOf)).toStrictEqual(wanted.map(baseOf));
    }
    // Spot checks, by hand: July's euro at July's rate, August's at August's.
    expect((await valuesOf(changed, eur)).map(baseOf)).toStrictEqual([
      {
        baseMinor: 93750,
        baseCurrency: 'GBP',
        fxRate: '0.9375',
        fxRateDate: '2026-07-01',
        fxSource: 'ecb',
      },
      {
        baseMinor: 173333,
        baseCurrency: 'GBP',
        fxRate: '0.866666666667',
        fxRateDate: '2026-08-01',
        fxSource: 'ecb',
      },
    ]);
    expect((await valuesOf(changed, gbp)).map(baseOf)).toStrictEqual([
      { baseMinor: 50000, baseCurrency: 'GBP', fxRate: '1', fxRateDate: null, fxSource: 'same' },
    ]);
    expect((await valuesOf(changed, usd)).map(baseOf)).toStrictEqual([
      {
        baseMinor: 23400,
        baseCurrency: 'GBP',
        fxRate: '0.78',
        fxRateDate: '2026-08-01',
        fxSource: 'ecb',
      },
    ]);
    // Every date's total reads as the fresh ledger's, so every period does too (J11 undistorted).
    const totals = async (userId: string, ids: string[]) => {
      const byDate = new Map<string, number>();
      for (const id of ids) {
        for (const v of await valuesOf(userId, id)) {
          byDate.set(v.date, (byDate.get(v.date) ?? 0) + v.baseMinor);
        }
      }
      return [...byDate.entries()].sort();
    };
    expect(await totals(changed, [eur, gbp, usd])).toStrictEqual(
      await totals(fresh, [freshEur, freshGbp, freshUsd]),
    );
    expect((await as(changed).read((l) => l.snapshot())).baseCurrency).toBe('GBP');
  });

  it('keeps the person’s and the agent’s own rates through SGD → USD → SGD, exactly', async () => {
    const { userId, holdings, connection } = await threeCurrencyLedger();
    const before = await everyValue(userId, holdings);
    const [usdGiven] = await valuesOf(userId, holdings.usd);
    const [eurGiven] = await valuesOf(userId, holdings.eur);
    expect(baseOf(usdGiven!)).toStrictEqual({
      baseMinor: 135000,
      baseCurrency: 'SGD',
      fxRate: '1.35',
      fxRateDate: '2026-07-25',
      fxSource: 'user',
    });
    expect(await givenOf(usdGiven!.id)).toStrictEqual({ rate: '1.35', into: 'SGD', by: 'user' });
    expect(await givenOf(eurGiven!.id)).toStrictEqual({ rate: '1.42', into: 'SGD', by: 'agent' });

    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('USD'));

    // The dollar value is in the default currency now: 1, with its own rate kept, unused.
    const [usdInUsd] = await valuesOf(userId, holdings.usd);
    expect(baseOf(usdInUsd!)).toStrictEqual({
      baseMinor: 100000,
      baseCurrency: 'USD',
      fxRate: '1',
      fxRateDate: null,
      fxSource: 'same',
    });
    expect(usdInUsd).toMatchObject({ givenRate: '1.35', givenRateInto: 'SGD' });
    expect(await givenOf(usdInUsd!.id)).toStrictEqual({ rate: '1.35', into: 'SGD', by: 'user' });
    // The agent's 1.42 into SGD, carried at July's SGD-to-USD (1 ÷ 1.3 = 0.769230769231), on the
    // value's own date: 2000 × 1.09230769230802 = 2184.61538461604.
    const [eurInUsd] = await valuesOf(userId, holdings.eur);
    expect(baseOf(eurInUsd!)).toStrictEqual({
      baseMinor: 218462,
      baseCurrency: 'USD',
      fxRate: '1.09230769230802',
      fxRateDate: '2026-07-10',
      fxSource: 'agent',
    });
    expect(eurInUsd).toMatchObject({
      givenRate: '1.42',
      givenRateInto: 'SGD',
      source: 'agent',
      connectionId: connection,
    });
    await expectFresh(userId, holdings, 'USD');

    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('SGD'));

    const after = await everyValue(userId, holdings);
    expect(after.map(baseOf)).toStrictEqual(before.map(baseOf));
    expect(after.map(provenanceOf)).toStrictEqual(before.map(provenanceOf));
    expect(after.map((v) => [v.givenRate, v.givenRateInto])).toStrictEqual(
      before.map((v) => [v.givenRate, v.givenRateInto]),
    );
  });

  it('keeps them exactly through SGD → EUR → USD → SGD, the rest as recorded fresh at each step', async () => {
    const { userId, holdings } = await threeCurrencyLedger();
    const before = await everyValue(userId, holdings);

    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('EUR'));
    // 1.35 × July's SGD-to-EUR (0.8 ÷ 1.3 = 0.615384615385) = 0.83076923076975, at the value's date.
    const [usdInEur] = await valuesOf(userId, holdings.usd);
    expect(baseOf(usdInEur!)).toStrictEqual({
      baseMinor: 83077,
      baseCurrency: 'EUR',
      fxRate: '0.83076923076975',
      fxRateDate: '2026-07-25',
      fxSource: 'user',
    });
    const [eurInEur] = await valuesOf(userId, holdings.eur);
    expect(baseOf(eurInEur!)).toStrictEqual({
      baseMinor: 200000,
      baseCurrency: 'EUR',
      fxRate: '1',
      fxRateDate: null,
      fxSource: 'same',
    });
    await expectFresh(userId, holdings, 'EUR');

    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('USD'));
    await expectFresh(userId, holdings, 'USD');

    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('SGD'));
    await expectFresh(userId, holdings, 'SGD');
    const after = await everyValue(userId, holdings);
    expect(after.map(baseOf)).toStrictEqual(before.map(baseOf));
    expect(after.map(provenanceOf)).toStrictEqual(before.map(provenanceOf));
  });

  it('re-derives a three-currency ledger into a fourth and back, without compounding', async () => {
    const { userId, holdings } = await threeCurrencyLedger();
    const before = await everyValue(userId, holdings);

    // There and back again, twice over: a carried rate never builds on the last carry.
    for (const code of ['GBP', 'EUR', 'GBP', 'USD', 'EUR', 'SGD']) {
      await as(userId, SYSTEM).write((l) => l.changeBaseCurrency(code));
      await expectFresh(userId, holdings, code);
    }
    // 1.35 × July's SGD-to-GBP (0.75 ÷ 1.3 = 0.576923076923) = 0.77884615384605, whenever GBP
    // comes round.
    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('GBP'));
    const [usdInGbp] = await valuesOf(userId, holdings.usd);
    expect(baseOf(usdInGbp!)).toStrictEqual({
      baseMinor: 77885,
      baseCurrency: 'GBP',
      fxRate: '0.77884615384605',
      fxRateDate: '2026-07-25',
      fxSource: 'user',
    });
    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('SGD'));
    expect((await everyValue(userId, holdings)).map(baseOf)).toStrictEqual(before.map(baseOf));
  });

  it('logs one system entry with the number of values re-derived, and no entry per value', async () => {
    const { userId, holdings } = await threeCurrencyLedger();
    const count = (await everyValue(userId, holdings)).length;
    const version = await dataVersion(suite, userId);
    const seen = (await auditRows(suite, userId)).length;

    const write = await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('USD'));

    expect(write.dataVersion).toBe(version! + 1);
    expect(await dataVersion(suite, userId)).toBe(version! + 1);
    const audits = (await auditRows(suite, userId)).slice(seen);
    expect(audits).toStrictEqual([
      {
        id: expect.stringMatching(/^aud_/) as string,
        actor: 'system',
        client_name: null,
        connection_id: null,
        batch_id: null,
        action: 'update',
        entity: 'ledger',
        entity_id: userId,
        before: { baseCurrency: 'SGD' },
        after: { baseCurrency: 'USD', valuesRederived: count },
      },
    ]);
    expect(count).toBe(5);
    const { items } = await as(userId).read((l) => l.activity({ limit: 1 }));
    expect(items.map((e) => e.summary)).toStrictEqual(['Changed the default currency SGD → USD']);
  });

  it('keeps each value’s provenance and entry time, and moves its row version on', async () => {
    const { userId, holdings } = await threeCurrencyLedger();
    const before = await everyValue(userId, holdings);
    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('EUR'));
    const after = await everyValue(userId, holdings);
    expect(after.map(provenanceOf)).toStrictEqual(before.map(provenanceOf));
    expect(after.map((v) => v.rowVersion)).toStrictEqual(before.map((v) => v.rowVersion + 1));
  });

  it('changes nothing when the currency is already the base', async () => {
    const userId = await newUser('USD');
    await holdingWith(userId, 'Savings', 'USD', [{ amount: '10', date: '2026-07-01' }]);
    const version = await dataVersion(suite, userId);
    const seen = (await auditRows(suite, userId)).length;

    const write = await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('USD'));

    expect(write.dataVersion).toBe(version);
    expect((await auditRows(suite, userId)).length).toBe(seen);
  });

  it('takes lower case, and refuses a code not in circulation', async () => {
    const userId = await newUser('USD');
    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('eur'));
    expect((await as(userId).read((l) => l.snapshot())).baseCurrency).toBe('EUR');

    const refused = await appError(as(userId, SYSTEM).write((l) => l.changeBaseCurrency('ABC')));
    expect(refused).toMatchObject({
      code: 'CURRENCY_UNSUPPORTED',
      details: { fields: { baseCurrency: expect.any(String) as string } },
    });
  });

  it('needs the ledger', async () => {
    const missing = await appError(
      as(newUserId(), SYSTEM).write((l) => l.changeBaseCurrency('EUR')),
    );
    expect(missing.code).toBe('NOT_FOUND');
  });

  it('moves an empty ledger with only the ledger row', async () => {
    const userId = await newUser('USD');
    const version = await dataVersion(suite, userId);
    const seen = (await auditRows(suite, userId)).length;

    const write = await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('EUR'));

    expect(write.dataVersion).toBe(version! + 1);
    const audits = (await auditRows(suite, userId)).slice(seen);
    expect(audits).toMatchObject([
      {
        entity: 'ledger',
        action: 'update',
        before: { baseCurrency: 'USD' },
        after: { baseCurrency: 'EUR', valuesRederived: 0 },
      },
    ]);
    expect((await as(userId).read((l) => l.snapshot())).baseCurrency).toBe('EUR');
  });

  it('refuses a value that would not fit in the new currency, writing nothing', async () => {
    const userId = await newUser('USD');
    const holdingId = await holdingWith(userId, 'Savings', 'USD', [
      { amount: '7000000000000', date: '2026-07-15' },
    ]);
    const [value] = await valuesOf(userId, holdingId);
    const version = await dataVersion(suite, userId);
    const seen = (await auditRows(suite, userId)).length;

    const refused = await appError(as(userId, SYSTEM).write((l) => l.changeBaseCurrency('JPY')));

    expect(refused.code).toBe('OUT_OF_RANGE');
    expect(refused.details).toMatchObject({
      fields: { [`values.${value!.id}`]: expect.any(String) as string },
    });
    expect(await dataVersion(suite, userId)).toBe(version);
    expect((await auditRows(suite, userId)).length).toBe(seen);
    expect((await as(userId).read((l) => l.snapshot())).baseCurrency).toBe('USD');
  });

  it('refuses a currency without stored rates, writing nothing', async () => {
    const userId = await newUser('USD');
    await holdingWith(userId, 'Euro savings', 'EUR', [{ amount: '1000', date: '2026-07-15' }]);
    const version = await dataVersion(suite, userId);
    const seen = (await auditRows(suite, userId)).length;

    const refused = await appError(as(userId, SYSTEM).write((l) => l.changeBaseCurrency('CHF')));

    expect(refused.code).toBe('CURRENCY_UNSUPPORTED');
    expect(await dataVersion(suite, userId)).toBe(version);
    expect((await auditRows(suite, userId)).length).toBe(seen);
    expect((await as(userId).read((l) => l.snapshot())).baseCurrency).toBe('USD');
  });
});
