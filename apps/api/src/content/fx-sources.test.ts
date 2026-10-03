import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ECB_CURRENCIES,
  FALLBACK_CURRENCIES,
  fetchRates,
  FxFetchError,
  parseRates,
  PIVOT_CURRENCY,
  ratesUrl,
  UNSUPPORTED_CURRENCIES,
  type FxRow,
} from './fx-sources';

/**
 * Responses in the shape of Frankfurter's `GET /v2/rates`, with fictional rates. The ECB file has a
 * weekend gap, a currency the ECB no longer publishes (BGN) and a day without a US dollar rate; the
 * blend has a currency the ECB publishes (EUR), a non-currency (XAU) and the identity row.
 */
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const ECB = fixture('frankfurter-ecb.json');
const BLEND = fixture('frankfurter-blend.json');
const countries = JSON.parse(
  readFileSync(new URL('../../../../content/countries.json', import.meta.url), 'utf8'),
) as Record<string, { currency: string }>;

const on = (rows: FxRow[], date: string) =>
  Object.fromEntries(rows.filter((r) => r.date === date).map((r) => [r.currency, r.perUsd]));

describe('the ECB, from a recorded response', () => {
  const rows = parseRates('ecb', ECB);

  it('divides each day’s euro rates by that day’s US dollar rate', () => {
    expect(on(rows, '2026-07-31')).toStrictEqual({
      EUR: '0.858369098712',
      GBP: '0.741716738197',
      IDR: '16330.1716738',
      JPY: '146.9527897',
      SGD: '1.28326180258',
    });
    expect(on(rows, '2026-07-30')).toStrictEqual({
      EUR: '0.853825136612',
      GBP: '0.738729508197',
      JPY: '147.207991803',
      SGD: '1.27962773224',
    });
  });

  it('stores no weekend, no day without a dollar rate and no currency the ECB no longer has', () => {
    expect([...new Set(rows.map((r) => r.date))].sort()).toStrictEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-03',
    ]);
    expect(rows.some((r) => r.currency === 'BGN' || r.currency === PIVOT_CURRENCY)).toBe(false);
    expect(rows.every((r) => r.source === 'ecb')).toBe(true);
  });
});

describe('the fallback, from a recorded response', () => {
  const rows = parseRates('fallback', BLEND);

  it('takes rates per USD as they are, for the currencies the ECB lacks', () => {
    expect(on(rows, '2026-07-31')).toStrictEqual({
      AED: '3.6725',
      KWD: '0.30574',
      TWD: '29.412',
      VND: '26145',
    });
    expect(on(rows, '2026-08-01')).toStrictEqual({ AED: '3.6725', VND: '26150' });
    expect(rows.every((r) => r.source === 'fallback')).toBe(true);
  });

  it('leaves out the ECB’s currencies, non-currencies and the identity row', () => {
    const currencies = new Set(rows.map((r) => r.currency));
    for (const code of ['EUR', 'XAU', 'USD']) expect(currencies.has(code)).toBe(false);
  });
});

describe('a response that is not rates', () => {
  it.each([
    ['not a list', { message: 'not found' }],
    ['a record without a rate', [{ date: '2026-07-31', base: 'USD', quote: 'VND' }]],
    ['a zero rate', [{ date: '2026-07-31', base: 'USD', quote: 'VND', rate: 0 }]],
    ['a bad date', [{ date: '31/07/2026', base: 'USD', quote: 'VND', rate: 1 }]],
    ['another base', [{ date: '2026-07-31', base: 'EUR', quote: 'VND', rate: 1 }]],
  ])('is rejected whole: %s', (_, body) => {
    expect(() => parseRates('fallback', body)).toThrow(FxFetchError);
  });
});

describe('coverage', () => {
  const ecb = new Set(ECB_CURRENCIES);
  const fallback = new Set(FALLBACK_CURRENCIES);
  const unsupported = new Set(UNSUPPORTED_CURRENCIES);

  it('gives every currency in countries.json one source, or lists it as unsupported', () => {
    const uncovered = [...new Set(Object.values(countries).map((c) => c.currency))].filter(
      (code) =>
        code !== PIVOT_CURRENCY && !ecb.has(code) && !fallback.has(code) && !unsupported.has(code),
    );
    expect(uncovered).toStrictEqual([]);
  });

  it('never gives a currency two sources, or a source to an unsupported one', () => {
    const all = [...ECB_CURRENCIES, ...FALLBACK_CURRENCIES, ...UNSUPPORTED_CURRENCIES];
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain(PIVOT_CURRENCY);
    for (const code of all) expect(code).toMatch(/^[A-Z]{3}$/);
  });

  it('lists as unsupported only currencies a country uses', () => {
    const used = new Set(Object.values(countries).map((c) => c.currency));
    expect(UNSUPPORTED_CURRENCIES.filter((code) => !used.has(code))).toStrictEqual([]);
  });
});

describe('fetchRates', () => {
  const range = { from: '2026-07-30', to: '2026-08-04' };
  const respond = (body: unknown, status = 200) =>
    vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

  it('asks Frankfurter for the ECB as published, and the blend against USD', async () => {
    expect(ratesUrl('ecb', range)).toBe(
      'https://api.frankfurter.dev/v2/rates?providers=ECB&base=EUR&from=2026-07-30&to=2026-08-04',
    );
    expect(ratesUrl('fallback', range)).toBe(
      'https://api.frankfurter.dev/v2/rates?base=USD&from=2026-07-30&to=2026-08-04',
    );
    const fake = respond(BLEND);
    const rows = await fetchRates('fallback', range, { fetch: fake, timeoutMs: 1000 });
    expect(rows).toHaveLength(10);
    expect(fake).toHaveBeenCalledWith(ratesUrl('fallback', range), expect.anything());
  });

  it('turns an error status into FxFetchError with the status', async () => {
    const error = await fetchRates('ecb', range, {
      fetch: respond({ message: 'busy' }, 503),
      timeoutMs: 1000,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FxFetchError);
    expect(error).toMatchObject({ source: 'ecb', status: 503 });
  });

  it('turns a network failure or a body that is not JSON into FxFetchError', async () => {
    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    await expect(fetchRates('ecb', range, { fetch: down, timeoutMs: 1000 })).rejects.toThrow(
      'The request failed: fetch failed',
    );
    const html = vi.fn<typeof fetch>(() => Promise.resolve(new Response('<html>')));
    await expect(fetchRates('ecb', range, { fetch: html, timeoutMs: 1000 })).rejects.toThrow(
      'not JSON',
    );
  });
});
