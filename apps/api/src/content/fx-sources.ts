import { decimalFromNumber, divideDecimal } from './decimal';

/**
 * Where exchange rates come from (architecture §6.6, decisions.md → Architecture). Both sources are
 * read through Frankfurter's open API, with no key:
 * - `ecb`: the European Central Bank's reference rates, as published (`providers=ECB`, against EUR).
 * - `fallback`: for every currency the ECB does not publish, Frankfurter's daily blend of central
 *   banks' published rates, against USD.
 * Every currency has exactly one source, so a lookup never mixes them. Rates are stored per USD.
 */
export type FxSource = 'ecb' | 'fallback';
export const FX_SOURCE_NAMES = ['ecb', 'fallback'] as const satisfies readonly FxSource[];

export const FRANKFURTER_RATES_URL = 'https://api.frankfurter.dev/v2/rates';

/** Every rate is stored against this currency, whose own rate is always 1. */
export const PIVOT_CURRENCY = 'USD';

/** The currencies the ECB publishes reference rates for, and the euro itself. */
export const ECB_CURRENCIES: readonly string[] = [
  'AUD',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'ZAR',
];

/**
 * Every other currency a country in content/countries.json uses, and the fallback publishes daily:
 * at least one central bank quotes it every working day, or it is pegged.
 */
export const FALLBACK_CURRENCIES: readonly string[] = (
  'AED AFN ALL AMD AOA ARS AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BSD BTN BWP BYN BZD CDF CLP ' +
  'COP CRC CUP CVE DJF DOP DZD EGP ERN ETB FJD FKP GEL GHS GIP GMD GNF GTQ GYD HNL HTG IQD IRR ' +
  'JMD JOD KES KGS KHR KMF KPW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP ' +
  'MRU MUR MVR MWK MZN NAD NGN NIO NPR OMR PEN PGK PKR PYG QAR RSD RUB RWF SAR SBD SCR SDG SHP ' +
  'SLE SRD STN SYP SZL TJS TMT TND TOP TTD TWD TZS UAH UGX UYU UZS VES VND VUV WST XAF XCD XOF ' +
  'YER ZMW'
).split(' ');

/**
 * Currencies of countries in content/countries.json that no free source publishes daily: only
 * monthly or quarterly figures exist. A value in one gets CURRENCY_UNSUPPORTED, unless the person
 * or the agent supplies the rate.
 */
export const UNSUPPORTED_CURRENCIES: readonly string[] = ['SOS', 'SSP', 'XCG', 'XPF', 'ZWG'];

const ECB_SET: ReadonlySet<string> = new Set(ECB_CURRENCIES);
const FALLBACK_SET: ReadonlySet<string> = new Set(FALLBACK_CURRENCIES);

/** The currency each source's rates are quoted against in its response. */
const RESPONSE_BASE: Record<FxSource, string> = { ecb: 'EUR', fallback: PIVOT_CURRENCY };

/** One stored rate: `perUsd` units of `currency` buy one US dollar on `date`. */
export interface FxRow {
  date: string;
  currency: string;
  perUsd: string;
  source: FxSource;
}

export interface DateRange {
  /** First day, inclusive (YYYY-MM-DD). */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

/** The request for one source's rates over `range`. */
export function ratesUrl(source: FxSource, { from, to }: DateRange): string {
  const query = new URLSearchParams(
    source === 'ecb'
      ? { providers: 'ECB', base: RESPONSE_BASE.ecb, from, to }
      : { base: RESPONSE_BASE.fallback, from, to },
  );
  return `${FRANKFURTER_RATES_URL}?${query.toString()}`;
}

/** A fetch that did not give usable rates. `status` is the HTTP status, when there was one. */
export class FxFetchError extends Error {
  override readonly name = 'FxFetchError';
  readonly source: FxSource;
  readonly status: number | undefined;

  constructor(source: FxSource, message: string, status?: number) {
    super(message);
    this.source = source;
    this.status = status;
  }
}

interface Quote {
  date: string;
  quote: string;
  rate: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The response's records, checked. Anything that is not a list of rates rejects the whole fetch. */
function quotes(source: FxSource, body: unknown): Quote[] {
  if (!Array.isArray(body)) {
    throw new FxFetchError(source, 'The response is not a list of rates.');
  }
  return body.map((item: unknown, i) => {
    const record = (typeof item === 'object' && item !== null ? item : {}) as Record<
      string,
      unknown
    >;
    const { date, base, quote, rate } = record;
    if (
      typeof date !== 'string' ||
      !DATE.test(date) ||
      typeof quote !== 'string' ||
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      throw new FxFetchError(source, `Record ${i} is not a rate.`);
    }
    if (base !== RESPONSE_BASE[source]) {
      throw new FxFetchError(
        source,
        `Record ${i} is against ${String(base)}, not ${RESPONSE_BASE[source]}.`,
      );
    }
    return { date, quote, rate };
  });
}

/**
 * The ECB quotes against the euro, as published. Each day's rates are divided by that day's US
 * dollar rate; a day without one is left out, as it cannot be stored per USD.
 */
function ecbRows(records: Quote[]): FxRow[] {
  const days = new Map<string, Map<string, number>>();
  for (const { date, quote, rate } of records) {
    const day = days.get(date) ?? new Map<string, number>();
    day.set(quote, rate);
    days.set(date, day);
  }
  const rows: FxRow[] = [];
  for (const [date, day] of days) {
    const usd = day.get(PIVOT_CURRENCY);
    if (usd === undefined) continue;
    const eurPerUsd = divideDecimal('1', decimalFromNumber(usd));
    rows.push({ date, currency: 'EUR', perUsd: eurPerUsd, source: 'ecb' });
    for (const [quote, rate] of day) {
      if (quote === 'EUR' || !ECB_SET.has(quote)) continue;
      const perUsd = divideDecimal(decimalFromNumber(rate), decimalFromNumber(usd));
      rows.push({ date, currency: quote, perUsd, source: 'ecb' });
    }
  }
  return rows;
}

/** The blend quotes against USD already; only the currencies the ECB lacks are kept. */
function fallbackRows(records: Quote[]): FxRow[] {
  return records
    .filter(({ quote }) => FALLBACK_SET.has(quote))
    .map(({ date, quote, rate }) => ({
      date,
      currency: quote,
      perUsd: decimalFromNumber(rate),
      source: 'fallback' as const,
    }));
}

/** A response body as the rows to store, one per date and currency. */
export function parseRates(source: FxSource, body: unknown): FxRow[] {
  const records = quotes(source, body);
  const rows = source === 'ecb' ? ecbRows(records) : fallbackRows(records);
  const unique = new Map(rows.map((row) => [`${row.date} ${row.currency}`, row]));
  return [...unique.values()];
}

export interface FetchOptions {
  fetch: typeof fetch;
  /** Abandon a request after this long. */
  timeoutMs: number;
}

/** Fetches and parses one source's rates over `range` (at most a year or so per call). */
export async function fetchRates(
  source: FxSource,
  range: DateRange,
  { fetch: fetchImpl, timeoutMs }: FetchOptions,
): Promise<FxRow[]> {
  let response: Response;
  try {
    response = await fetchImpl(ratesUrl(source, range), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new FxFetchError(source, `The request failed: ${reason}`);
  }
  if (!response.ok) {
    throw new FxFetchError(source, `The source answered ${response.status}.`, response.status);
  }
  return parseRates(source, await responseBody(source, response));
}

/**
 * The response as the value `parseRates` checks. Frankfurter answers small ranges with one
 * JSON document and large ones as NDJSON (`application/x-ndjson`), one rate per line.
 */
async function responseBody(source: FxSource, response: Response): Promise<unknown> {
  const text = await response.text();
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('ndjson')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new FxFetchError(source, 'The response is not JSON.', response.status);
    }
  }
  try {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as unknown);
  } catch {
    throw new FxFetchError(source, 'The response is not NDJSON.', response.status);
  }
}
