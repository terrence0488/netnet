import type { ValueFxSource } from '@netnet/contracts';
import { MAX_MINOR, convert, fromMinor, minorRate, toMinor } from '@netnet/core';
import { AppError } from '../lib/errors';
import type { FieldErrors, FieldErrorCode } from './input';
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
}

export interface ValueDraft {
  /** In major units, as given. */
  amount: string | number;
  currency: string;
  /** Defaults to the user's today. */
  date?: string | undefined;
  /** A rate the caller gives: 1 of `currency` in the base currency. */
  fxRate?: string | null | undefined;
}

const ONE = /^0*1(\.0*)?$/;

const join = (at: string, field: string) => (at ? `${at}.${field}` : field);

/** A stored amount in major units again, as `toMinor` reads it. */
export function majorAmount(amountMinor: number, currency: string): string {
  return fromMinor(amountMinor, currency);
}

/**
 * `draft` made ready to store, or undefined with each problem added to `errors` under `at` (such
 * as `values[3]`): the amount's precision and size for its currency, the date at most a day ahead
 * of the user's today, and a rate for it.
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
  const given = draft.fxRate ?? undefined;
  let rate: { rate: string; rateDate: string | null; source: ValueFxSource };
  if (draft.currency === base) {
    if (given !== undefined && !ONE.test(given)) {
      errors.add(
        'VALIDATION_FAILED',
        join(at, 'fxRate'),
        `The value is in ${base}, the base currency, so its rate is 1: leave fxRate out.`,
      );
      return undefined;
    }
    rate = { rate: '1', rateDate: null, source: 'same' };
  } else if (given !== undefined) {
    rate = { rate: given, rateDate: date, source: s.actor.kind === 'agent' ? 'agent' : 'user' };
  } else {
    if (!ok) return undefined;
    try {
      const cross = await w.crossRate(draft.currency, base, date);
      rate = { rate: cross.rate, rateDate: cross.rateDate, source: cross.source };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      errors.add(error.code as FieldErrorCode, join(at, 'currency'), error.message);
      return undefined;
    }
  }

  let baseMinor: number;
  try {
    baseMinor = convert(minor, minorRate(rate.rate, draft.currency, base));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    baseMinor = Number.POSITIVE_INFINITY;
  }
  if (Math.abs(baseMinor) > MAX_MINOR) {
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
  };
}
