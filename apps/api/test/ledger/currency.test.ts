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
 * Changing the default currency (architecture §6.6, P3-T3): every value's `base_minor` re-derived
 * from the stored rates at its own `fx_rate_date`, as one `system` write. The rates below move
 * between July and August, so a value re-derived at the wrong date reads wrong.
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
  it('re-derives every value at its own rate date, as if the new currency had always been the base', async () => {
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

  it('keeps a caller-given rate, carried into the new currency, with its provenance', async () => {
    const userId = await newUser('USD');
    const userHolding = await holdingWith(userId, 'Euro savings', 'EUR', [
      { amount: '1000', date: '2026-07-25', fxRate: '1.31' },
    ]);
    const connection = await suite.connect(userId);
    const agentHolding = await holdingWith(
      userId,
      'Euro fund',
      'EUR',
      [{ amount: '2000', date: '2026-07-10', fxRate: '1.24' }],
      agentActor(connection),
    );
    const [beforeUser] = await valuesOf(userId, userHolding);
    const [beforeAgent] = await valuesOf(userId, agentHolding);
    expect(beforeUser).toMatchObject({ fxSource: 'user', fxRateDate: '2026-07-25' });
    expect(beforeAgent).toMatchObject({ fxSource: 'agent', fxRateDate: '2026-07-10' });

    await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('GBP'));

    // 1.31 × July's dollar-to-pound (0.75); 1.24 × the same.
    const [user] = await valuesOf(userId, userHolding);
    expect(baseOf(user!)).toStrictEqual({
      baseMinor: 98250,
      baseCurrency: 'GBP',
      fxRate: '0.9825',
      fxRateDate: '2026-07-25',
      fxSource: 'user',
    });
    expect(user).toMatchObject({
      source: 'web',
      clientName: null,
      connectionId: null,
      batchId: null,
      enteredAt: beforeUser!.enteredAt,
    });
    const [agent] = await valuesOf(userId, agentHolding);
    expect(baseOf(agent!)).toStrictEqual({
      baseMinor: 186000,
      baseCurrency: 'GBP',
      fxRate: '0.93',
      fxRateDate: '2026-07-10',
      fxSource: 'agent',
    });
    expect(agent).toMatchObject({
      source: 'agent',
      clientName: beforeAgent!.clientName,
      connectionId: connection,
      batchId: beforeAgent!.batchId,
      enteredAt: beforeAgent!.enteredAt,
    });
  });

  it('logs one system change, each row carrying before and after', async () => {
    const userId = await newUser('USD');
    const first = await holdingWith(userId, 'Euro savings', 'EUR', [
      { amount: '1000', date: '2026-07-15' },
    ]);
    const second = await holdingWith(userId, 'Dollar savings', 'USD', [
      { amount: '300', date: '2026-08-01' },
    ]);
    const lists = await Promise.all([first, second].map((id) => valuesOf(userId, id)));
    const before = new Map(lists.flat().map((v) => [v.id, v] as const));
    const version = await dataVersion(suite, userId);
    const seen = (await auditRows(suite, userId)).length;

    const write = await as(userId, SYSTEM).write((l) => l.changeBaseCurrency('EUR'));

    expect(write.dataVersion).toBe(version! + 1);
    const audits = (await auditRows(suite, userId)).slice(seen);
    expect(audits.map((r) => [r.entity, r.action])).toEqual([
      ['value', 'update'],
      ['value', 'update'],
      ['ledger', 'update'],
    ]);
    for (const row of audits) {
      expect(row).toMatchObject({
        actor: 'system',
        client_name: null,
        connection_id: null,
        batch_id: null,
      });
    }
    for (const row of audits.slice(0, 2)) {
      const was = before.get(row.entity_id!);
      expect(was).toBeDefined();
      // `before` is the value as it was, `after` as it is: old → new in the log.
      expect(row.before).toStrictEqual(JSON.parse(JSON.stringify(was)));
      const [now] = (await valuesOf(userId, was!.holdingId)).filter((v) => v.id === was!.id);
      expect(row.after).toStrictEqual(JSON.parse(JSON.stringify(now)));
      expect((row.after as { rowVersion: number }).rowVersion).toBe(was!.rowVersion + 1);
    }
    expect(audits[2]).toMatchObject({
      entity_id: userId,
      before: { baseCurrency: 'USD' },
      after: { baseCurrency: 'EUR' },
    });
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
    expect(audits.map((r) => [r.entity, r.action])).toEqual([['ledger', 'update']]);
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
