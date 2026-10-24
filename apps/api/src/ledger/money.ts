import type { ValueFxSource } from '@netnet/contracts';
import { MAX_MINOR, convert, fromMinor, minorRate, toMinor } from '@netnet/core';
import { multiplyDecimal } from '../content/decimal';
import { AppError } from '../lib/errors';
import type { FieldErrors, FieldErrorCode } from './input';
import type { ValueRow } from './rows';
import type { WriteScope } from './write';

/**
 * A value's amount and its conversion into the base currency (architecture §6.6): the amount
 * through `core.toMinor` once, the rate looked up once for the value's date (or given by the
 * caller), the conversion through `core.convert`, all stored on the value and never refreshed.
 */
export interface PreparedValue {
  amountMinor: number;
  currency: string;
  date: string;
  baseMinor: number;
  baseCurrency: string;
  fxRate: string;
  fxRateDate: string | null;
  fxSource: ValueFxSource;
  /** The rate the person or their agent gave, kept as given; null when none was. */
  givenRate: GivenRate | null;
}

/**
 * A rate the person or their agent gave (architecture §6.6): 1 of the value's currency in `into`,
 * the base currency when it was given. It stays as given through every change of the base
 * currency, and each re-derivation starts from it, so none compounds on the last.
 */
export interface GivenRate {
  rate: string;
  into: string;
  by: 'user' | 'agent';
}

/** A value's stored conversion: the rate, its date, and where it came from. */
export interface ValueRate {
  rate: string;
  rateDate: string | null;
  source: ValueFxSource;
}

export interface ValueDraft {
  /** In major units, as given. */
  amount: string | number;
  currency: string;
  /** Defaults to the user's today. */
  date?: string | undefined;
  /** A rate the caller gives now: 1 of `currency` in the base currency. */
  fxRate?: string | null | undefined;
  /** A rate given earlier and kept, for an edit to the amount or date. */
  given?: GivenRate | null | undefined;
  /** The value's stored rate, kept as it is, for an edit to the amount alone. */
  stored?: ValueRate | undefined;
}

const SAME: ValueRate = { rate: '1', rateDate: null, source: 'same' };

const ONE = /^0*1(\.0*)?$/;

const join = (at: string, field: string) => (at ? `${at}.${field}` : field);

/** A stored amount in major units again, as `toMinor` reads it. */
export function majorAmount(amountMinor: number, currency: string): string {
  return fromMinor(amountMinor, currency);
}

/**
 * `draft` made ready to store, or undefined with each problem added to `errors` under `at` (such
 * as `values[3]`): the amount's precision and size for its currency, the date at most a day ahead
 * of the user's today, and a rate for it. A rate given now becomes the value's given rate, into
 * the base currency, by the actor; one given earlier is kept, unused while the value is in the
 * base currency.
 */
export async function prepareValue(
  w: WriteScope,
  draft: ValueDraft,
  at: string,
  errors: FieldErrors,
): Promise<PreparedValue | undefined> {
  const { s } = w;
  let ok = true;
  const date = draft.date ?? s.today();
  if (date > s.latestDate()) {
    errors.add(
      'OUT_OF_RANGE',
      join(at, 'date'),
      `Give a date on or before ${s.latestDate()}: a value can be dated at most a day ahead.`,
    );
    ok = false;
  }

  const minor = toMinor(draft.amount, draft.currency);
  if (typeof minor !== 'number') {
    const field = minor.code === 'CURRENCY_UNSUPPORTED' ? 'currency' : 'amount';
    errors.add(minor.code, join(at, field), minor.message);
    return undefined;
  }

  const base = w.state.baseCurrency;
  const fxRate = draft.fxRate ?? undefined;
  let given = draft.given ?? null;
  let rate: ValueRate;
  if (draft.currency === base) {
    if (fxRate !== undefined && !ONE.test(fxRate)) {
      errors.add(
        'VALIDATION_FAILED',
        join(at, 'fxRate'),
        `The value is in ${base}, the base currency, so its rate is 1: leave fxRate out.`,
      );
      return undefined;
    }
    rate = SAME;
  } else if (fxRate !== undefined) {
    given = { rate: fxRate, into: base, by: s.actor.kind === 'agent' ? 'agent' : 'user' };
    rate = { rate: fxRate, rateDate: date, source: given.by };
  } else if (given === null && draft.stored) {
    rate = draft.stored;
  } else {
    if (!ok) return undefined;
    try {
      rate = await rateInto(w, { currency: draft.currency, date, given }, base);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      errors.add(error.code as FieldErrorCode, join(at, 'currency'), error.message);
      return undefined;
    }
  }

  const baseMinor = convertInto(minor, draft.currency, rate.rate, base);
  if (baseMinor === undefined) {
    errors.add(
      'OUT_OF_RANGE',
      join(at, 'amount'),
      `Converted into ${base}, this is more than NetNet holds: give a smaller amount, or check the rate.`,
    );
    return undefined;
  }
  if (!ok) return undefined;
  return {
    amountMinor: minor,
    currency: draft.currency,
    date,
    baseMinor,
    baseCurrency: base,
    fxRate: rate.rate,
    fxRateDate: rate.rateDate,
    fxSource: rate.source,
    givenRate: given,
  };
}

/** A stored value's given rate, or null when it has none. */
export function givenRateOf(row: ValueRow): GivenRate | null {
  const { givenRate, givenRateInto, givenRateBy } = row;
  return givenRate !== null && givenRateInto !== null && givenRateBy !== null
    ? { rate: givenRate, into: givenRateInto, by: givenRateBy }
    : null;
}

/** Whether two given rates are the same rate, into the same currency, by the same writer. */
export function sameGivenRate(a: GivenRate | null, b: GivenRate | null): boolean {
  return a === null || b === null
    ? a === b
    : a.rate === b.rate && a.into === b.into && a.by === b.by;
}

/**
 * The rate from a value in `currency` on `date` into `to` (architecture §6.6): 1 when the value is
 * in `to`. From a given rate: as given when it is into `to`, else carried into `to` through the
 * stored cross rate on the value's date, multiplied exactly; either way on the value's date and
 * from whoever gave it. Otherwise the published rate for the value's date. A missing rate throws
 * its AppError.
 */
export async function rateInto(
  w: WriteScope,
  v: { currency: string; date: string; given: GivenRate | null },
  to: string,
): Promise<ValueRate> {
  if (v.currency === to) return SAME;
  if (v.given) {
    const { rate, into, by } = v.given;
    if (into === to) return { rate, rateDate: v.date, source: by };
    const cross = await w.crossRate(into, to, v.date);
    return { rate: multiplyDecimal(rate, cross.rate), rateDate: v.date, source: by };
  }
  const cross = await w.crossRate(v.currency, to, v.date);
  return { rate: cross.rate, rateDate: cross.rateDate, source: cross.source };
}

/**
 * `amountMinor` of `currency` in `to` at `rate`, through `core.convert` (exact, half away from
 * zero), or undefined when it is more than NetNet holds.
 */
export function convertInto(
  amountMinor: number,
  currency: string,
  rate: string,
  to: string,
): number | undefined {
  let converted: number;
  try {
    converted = convert(amountMinor, minorRate(rate, currency, to));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
  return Math.abs(converted) > MAX_MINOR ? undefined : converted;
}
