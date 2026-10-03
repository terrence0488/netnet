import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFx, databaseRates, type Fx } from '../../src/content/fx';
import type { FxSource } from '../../src/content/fx-sources';
import { databaseRateStore, syncRange, syncRecent, type SyncDeps } from '../../src/content/fx-sync';
import { latestRateDate, rateCurrencies, rateSpans } from '../../src/db/fx-rates';
import { AppError } from '../../src/lib/errors';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';

/**
 * Exchange rates end to end against Postgres, as `netnet_app`: both sources parsed from recorded
 * responses (no network), stored per USD, then looked up as the Ledger will (architecture §6.6).
 */
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../src/content/fixtures/${name}`, import.meta.url), 'utf8'));
const RESPONSES: Record<FxSource, unknown> = {
  ecb: fixture('frankfurter-ecb.json'),
  fallback: fixture('frankfurter-blend.json'),
};

const frankfurter = vi.fn<typeof fetch>((input) => {
  const source: FxSource =
    new URL(input instanceof Request ? input.url : input).searchParams.get('providers') === 'ECB'
      ? 'ecb'
      : 'fallback';
  return Promise.resolve(Response.json(RESPONSES[source]));
});

let db: TestDatabase;
let fx: Fx;
let deps: SyncDeps;

beforeAll(async () => {
  db = await createTestDatabase();
  deps = {
    store: databaseRateStore(db.appDb),
    fetch: frankfurter,
    timeoutMs: 1000,
    attempts: 1,
  };
  fx = createFx(databaseRates(() => db.appDb));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('filling core.fx_rate', () => {
  it('stores both sources per USD, as netnet_app, once', async () => {
    const first = await syncRange({ from: '2026-07-01', to: '2026-08-04' }, deps);
    expect(first.ecb).toMatchObject({ ok: true, inserted: 13 });
    expect(first.fallback).toMatchObject({ ok: true, inserted: 10 });

    const { rows } = await db.owner.query<{ currency: string; per_usd: string; source: string }>(
      `select currency, per_usd::text, source from core.fx_rate where date = '2026-07-31' order by 1`,
    );
    expect(rows).toStrictEqual([
      { currency: 'AED', per_usd: '3.6725', source: 'fallback' },
      { currency: 'EUR', per_usd: '0.858369098712', source: 'ecb' },
      { currency: 'GBP', per_usd: '0.741716738197', source: 'ecb' },
      { currency: 'IDR', per_usd: '16330.1716738', source: 'ecb' },
      { currency: 'JPY', per_usd: '146.9527897', source: 'ecb' },
      { currency: 'KWD', per_usd: '0.30574', source: 'fallback' },
      { currency: 'SGD', per_usd: '1.28326180258', source: 'ecb' },
      { currency: 'TWD', per_usd: '29.412', source: 'fallback' },
      { currency: 'VND', per_usd: '26145', source: 'fallback' },
    ]);

    const again = await syncRange({ from: '2026-07-01', to: '2026-08-04' }, deps);
    expect(again.ecb).toMatchObject({ ok: true, inserted: 0 });
    expect(again.fallback).toMatchObject({ ok: true, inserted: 0 });
  });

  it('knows each source’s newest date, every currency and each one’s span', async () => {
    expect(await latestRateDate(db.appDb, 'ecb')).toBe('2026-08-03');
    expect(await latestRateDate(db.appDb, 'fallback')).toBe('2026-08-03');
    expect(await rateCurrencies(db.appDb)).toStrictEqual([
      'AED',
      'EUR',
      'GBP',
      'IDR',
      'JPY',
      'KWD',
      'SGD',
      'TWD',
      'VND',
    ]);
    expect(await rateSpans(db.appDb, ['VND', 'XPF'])).toStrictEqual([
      { currency: 'VND', first: '2026-07-31', last: '2026-08-03' },
    ]);
  });

  it('the daily run asks from a week before today', async () => {
    frankfurter.mockClear();
    const result = await syncRecent('2026-08-04', deps);
    expect(result.ecb).toMatchObject({ ok: true, from: '2026-07-28', inserted: 0 });
    expect(frankfurter).toHaveBeenCalledTimes(2);
  });
});

describe('crossRate over core.fx_rate', () => {
  it('converts through USD with the day’s rates', async () => {
    expect(await fx.crossRate('SGD', 'JPY', '2026-07-31')).toStrictEqual({
      rate: '114.515050167',
      rateDate: '2026-07-31',
      source: 'ecb',
    });
    expect(await fx.crossRate('TWD', 'JPY', '2026-08-03')).toStrictEqual({
      rate: '5.00438194456',
      rateDate: '2026-08-03',
      source: 'fallback',
    });
  });

  it('takes the latest on or before the date', async () => {
    // Sunday 2 August: Friday's ECB rate, Saturday's VND.
    expect(await fx.crossRate('SGD', 'USD', '2026-08-02')).toMatchObject({
      rateDate: '2026-07-31',
      source: 'ecb',
    });
    expect(await fx.crossRate('USD', 'VND', '2026-08-02')).toStrictEqual({
      rate: '26150',
      rateDate: '2026-08-01',
      source: 'fallback',
    });
  });

  it('before history begins, takes the nearest later rate and records its date', async () => {
    expect(await fx.crossRate('USD', 'TWD', '1999-12-31')).toStrictEqual({
      rate: '29.412',
      rateDate: '2026-07-31',
      source: 'fallback',
    });
  });

  it('gives CURRENCY_UNSUPPORTED with the nearest codes it has rates for', async () => {
    const error = await fx.crossRate('USD', 'SDG', '2026-07-31').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'CURRENCY_UNSUPPORTED', details: { nearest: ['SGD'] } });
  });
});
