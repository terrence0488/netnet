import { database, type Executor } from '../db/client';
import {
  rateCurrencies,
  rateNeighbours,
  type RateNeighbours,
  type StoredRate,
} from '../db/fx-rates';
import { AppError } from '../lib/errors';
import { divideDecimal } from './decimal';
import { PIVOT_CURRENCY, type FxSource } from './fx-sources';

/**
 * Exchange rates for a value's date (architecture §6.6): looked up once when a value is written,
 * then stored on it. Rates are kept per USD, so every cross rate goes through USD.
 */
export interface CrossRate {
  /** 1 `from` = `rate` `to`, in major units: the form a statement shows. A decimal string. */
  rate: string;
  /** The date of the rates used, which is not always the value's date (see `crossRate`). */
  rateDate: string;
  source: FxSource;
}

/** Where `crossRate` reads rates: `core.fx_rate`, or a stand-in in tests. */
export interface RateReader {
  neighbours(currency: string, date: string): Promise<RateNeighbours>;
  /** Every currency with a rate. Only read to suggest codes when one is unsupported. */
  currencies(): Promise<string[]>;
}

/** One side of a cross rate. The pivot, USD, has no date of its own. */
interface Leg {
  perUsd: string;
  date: string | null;
  source: FxSource;
}

const PIVOT_LEG: Leg = { perUsd: '1', date: null, source: 'ecb' };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * The rate to use for `date`: the latest on or before it; before the source's history begins, the
 * nearest later one, whose date then says so.
 */
export function chooseRate({ onOrBefore, after }: RateNeighbours): StoredRate | undefined {
  return onOrBefore ?? after;
}

/** Optimal string alignment distance: edits, counting a swap of neighbours as one. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      const row = d[i];
      if (row) row[j] = best;
    }
  }
  return at(a.length, b.length);
}

const MAX_NEAREST = 5;

/**
 * The supported codes closest to `code` (case aside): those one edit away, or else two, at most
 * five, in alphabetical order. A typo such as "SGP" or "UDS" finds what was meant.
 */
export function nearestCodes(code: string, supported: readonly string[]): string[] {
  const wanted = code.trim().toUpperCase();
  for (const limit of [1, 2]) {
    const near = supported.filter((c) => distance(wanted, c) <= limit).sort();
    if (near.length > 0) return near.slice(0, MAX_NEAREST);
  }
  return [];
}

/** The date a cross rate carries: the later one if either leg is after `date`, else the older. */
function crossDate(date: string, legs: readonly Leg[]): string {
  const dates = legs.flatMap((leg) => (leg.date === null ? [] : [leg.date])).sort();
  if (dates.length === 0) return date;
  const latest = dates[dates.length - 1] ?? date;
  return latest > date ? latest : (dates[0] ?? date);
}

export interface Fx {
  crossRate(from: string, to: string, date: string): Promise<CrossRate>;
}

/** `crossRate` over `reader`. */
export function createFx(reader: RateReader): Fx {
  const unsupported = async (code: string): Promise<never> => {
    const nearest = nearestCodes(code, [
      ...new Set([PIVOT_CURRENCY, ...(await reader.currencies())]),
    ]);
    const hint = nearest.length > 0 ? ` Did you mean ${nearest.join(', ')}?` : '';
    throw new AppError(
      'CURRENCY_UNSUPPORTED',
      `"${code.slice(0, 12)}" is not an ISO 4217 currency NetNet has exchange rates for. Use a three-letter code such as USD, or give the rate yourself.${hint}`,
      { nearest },
    );
  };

  const leg = async (currency: string, date: string): Promise<Leg> => {
    if (currency === PIVOT_CURRENCY) return PIVOT_LEG;
    if (!/^[A-Z]{3}$/.test(currency)) return unsupported(currency);
    const chosen = chooseRate(await reader.neighbours(currency, date));
    if (!chosen) return unsupported(currency);
    return { perUsd: chosen.perUsd, date: chosen.date, source: chosen.source };
  };

  return {
    async crossRate(from, to, date) {
      if (!isCalendarDate(date)) {
        throw new AppError('VALIDATION_FAILED', 'The date must be a calendar date, YYYY-MM-DD.', {
          fields: { date: 'Use YYYY-MM-DD, such as 2026-08-31.' },
        });
      }
      const fromLeg = await leg(from, date);
      const toLeg = await leg(to, date);
      const legs = [fromLeg, toLeg];
      return {
        // per_usd(to) / per_usd(from): how many `to` one `from` buys.
        rate: from === to ? '1' : divideDecimal(toLeg.perUsd, fromLeg.perUsd),
        rateDate: crossDate(date, legs),
        source: legs.some((l) => l.source === 'fallback') ? 'fallback' : 'ecb',
      };
    },
  };
}

/** `core.fx_rate` as a `RateReader`. */
export function databaseRates(db: () => Executor): RateReader {
  return {
    neighbours: (currency, date) => rateNeighbours(db(), currency, date),
    currencies: () => rateCurrencies(db()),
  };
}

let shared: Fx | undefined;

/**
 * The rate to convert a value in `from` into `to` on `date`, the value's date: the latest published
 * rate on or before it (before a source's history begins, the nearest later one). Cross rates go
 * through USD. `rateDate` is the older of the two rates' dates, or the later when either is after
 * `date`; `source` is `fallback` when either rate came from it. A pair of identical currencies is
 * `1`. A currency without rates is CURRENCY_UNSUPPORTED, with the nearest supported codes in
 * `nearest`.
 */
export function crossRate(from: string, to: string, date: string): Promise<CrossRate> {
  shared ??= createFx(databaseRates(database));
  return shared.crossRate(from, to, date);
}
