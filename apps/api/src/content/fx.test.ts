import { describe, expect, it } from 'vitest';
import type { StoredRate } from '../db/fx-rates';
import { AppError } from '../lib/errors';
import { createFx, nearestCodes, type RateReader } from './fx';

/** Fictional rates per USD; the ECB's weekend gap on 1–2 August; VND's history starts 31 July. */
const RATES: StoredRate[] = [
  { date: '2026-07-30', currency: 'SGD', perUsd: '1.27962773224', source: 'ecb' },
  { date: '2026-07-31', currency: 'SGD', perUsd: '1.28326180258', source: 'ecb' },
  { date: '2026-08-03', currency: 'SGD', perUsd: '1.28352688172', source: 'ecb' },
  { date: '2026-07-31', currency: 'JPY', perUsd: '146.9527897', source: 'ecb' },
  { date: '2026-08-03', currency: 'JPY', perUsd: '147.053763441', source: 'ecb' },
  { date: '2026-07-31', currency: 'EUR', perUsd: '0.858369098712', source: 'ecb' },
  { date: '2026-07-31', currency: 'VND', perUsd: '26145', source: 'fallback' },
  { date: '2026-08-01', currency: 'VND', perUsd: '26150', source: 'fallback' },
  { date: '2026-07-31', currency: 'AED', perUsd: '3.6725', source: 'fallback' },
];

/** The reader over a list, with the same choice of neighbours as the SQL. */
function memory(rates: StoredRate[]): RateReader {
  return {
    neighbours: (currency, date) => {
      const mine = rates
        .filter((r) => r.currency === currency)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      return Promise.resolve({
        onOrBefore: mine.filter((r) => r.date <= date).at(-1),
        after: mine.find((r) => r.date > date),
      });
    },
    currencies: () => Promise.resolve([...new Set(rates.map((r) => r.currency))].sort()),
  };
}

const fx = createFx(memory(RATES));

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.catch((e: unknown) => e);
  if (!(error instanceof AppError)) throw new Error('expected an AppError');
  return error;
}

describe('crossRate', () => {
  it('goes through USD: 1 from = rate to, in major units', async () => {
    expect(await fx.crossRate('SGD', 'JPY', '2026-07-31')).toStrictEqual({
      rate: '114.515050167',
      rateDate: '2026-07-31',
      source: 'ecb',
    });
    expect(await fx.crossRate('EUR', 'SGD', '2026-07-31')).toMatchObject({
      rate: '1.49500000001',
    });
  });

  it('takes a currency’s own rate against USD, either way round', async () => {
    expect(await fx.crossRate('USD', 'SGD', '2026-07-31')).toStrictEqual({
      rate: '1.28326180258',
      rateDate: '2026-07-31',
      source: 'ecb',
    });
    expect(await fx.crossRate('AED', 'USD', '2026-07-31')).toStrictEqual({
      rate: '0.272294077604',
      rateDate: '2026-07-31',
      source: 'fallback',
    });
  });

  it('is fallback when either side is', async () => {
    expect(await fx.crossRate('VND', 'SGD', '2026-07-31')).toStrictEqual({
      rate: '0.0000490824938833',
      rateDate: '2026-07-31',
      source: 'fallback',
    });
    expect(await fx.crossRate('SGD', 'VND', '2026-07-31')).toMatchObject({
      rate: '20373.8628762',
      source: 'fallback',
    });
  });

  it('takes the latest rate on or before the date, dated by the older side', async () => {
    // Sunday: the ECB's latest is Friday's, the fallback's Saturday's.
    expect(await fx.crossRate('USD', 'SGD', '2026-08-02')).toMatchObject({
      rate: '1.28326180258',
      rateDate: '2026-07-31',
    });
    expect(await fx.crossRate('SGD', 'VND', '2026-08-02')).toMatchObject({
      rateDate: '2026-07-31',
      source: 'fallback',
    });
    expect(await fx.crossRate('USD', 'VND', '2026-08-02')).toMatchObject({
      rate: '26150',
      rateDate: '2026-08-01',
    });
    // Long after the last rate, the last rate stays in use with its date.
    expect(await fx.crossRate('USD', 'SGD', '2026-12-25')).toMatchObject({
      rate: '1.28352688172',
      rateDate: '2026-08-03',
    });
  });

  it('before a history begins, takes the nearest later rate and gives its date', async () => {
    expect(await fx.crossRate('USD', 'VND', '2001-05-01')).toStrictEqual({
      rate: '26145',
      rateDate: '2026-07-31',
      source: 'fallback',
    });
    // SGD has a rate on 30 July and VND not until 31 July: the later date is the one recorded.
    expect(await fx.crossRate('SGD', 'VND', '2026-07-30')).toMatchObject({
      rate: '20431.7234937',
      rateDate: '2026-07-31',
    });
  });

  it('is 1 between a currency and itself', async () => {
    expect(await fx.crossRate('SGD', 'SGD', '2026-08-02')).toStrictEqual({
      rate: '1',
      rateDate: '2026-07-31',
      source: 'ecb',
    });
    expect(await fx.crossRate('USD', 'USD', '2026-08-02')).toStrictEqual({
      rate: '1',
      rateDate: '2026-08-02',
      source: 'ecb',
    });
  });

  it('gives CURRENCY_UNSUPPORTED with the nearest codes for a currency without rates', async () => {
    const typo = await errorOf(fx.crossRate('SGP', 'USD', '2026-07-31'));
    expect(typo.code).toBe('CURRENCY_UNSUPPORTED');
    expect(typo.details).toStrictEqual({ nearest: ['SGD'] });
    expect(typo.message).toContain('"SGP"');
    expect(typo.message).toContain('Did you mean SGD?');

    const swapped = await errorOf(fx.crossRate('USD', 'UDS', '2026-07-31'));
    expect(swapped.details).toStrictEqual({ nearest: ['USD'] });

    const lower = await errorOf(fx.crossRate('sgd', 'USD', '2026-07-31'));
    expect(lower.details).toStrictEqual({ nearest: ['SGD'] });

    // A real ISO code with no daily source, such as XPF: the person or agent can give the rate.
    const none = await errorOf(fx.crossRate('USD', 'XPF', '2026-07-31'));
    expect(none.code).toBe('CURRENCY_UNSUPPORTED');
    expect(none.message).toContain('give the rate yourself');

    const far = await errorOf(fx.crossRate('QQQ', 'USD', '2026-07-31'));
    expect(far.details).toStrictEqual({ nearest: [] });
    expect(far.message).not.toContain('Did you mean');
  });

  it('refuses a date that is not a calendar date', async () => {
    for (const date of ['2026-02-30', '31/07/2026', '2026-7-31']) {
      const error = await errorOf(fx.crossRate('USD', 'SGD', date));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details?.fields).toHaveProperty('date');
    }
  });
});

describe('nearestCodes', () => {
  const supported = ['AED', 'EUR', 'SGD', 'SDG', 'USD', 'VND', 'XAF', 'XOF', 'XCD'];

  it('finds codes one edit away, swaps included, else two, at most five, alphabetically', () => {
    expect(nearestCodes('SGP', supported)).toStrictEqual(['SGD']);
    expect(nearestCodes('SDG', ['SGD', 'USD'])).toStrictEqual(['SGD']);
    expect(nearestCodes('XPF', supported)).toStrictEqual(['XAF', 'XOF']);
    expect(nearestCodes('XYZ', ['XAF', 'XCD', 'XOF', 'XPF', 'XTS', 'XXX'])).toHaveLength(5);
    expect(nearestCodes('EURO', supported)).toStrictEqual(['EUR']);
    expect(nearestCodes('QQQ', supported)).toStrictEqual([]);
  });
});
