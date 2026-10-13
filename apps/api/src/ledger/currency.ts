import type { Value, ValueFxSource, Write } from '@netnet/contracts';
import { currencyExponent } from '@netnet/contracts/currencies';
import { MAX_MINOR, convert, minorRate } from '@netnet/core';
import { and, eq } from 'drizzle-orm';
import { multiplyDecimal } from '../content/decimal';
import { AppError } from '../lib/errors';
import { FieldErrors, type FieldErrorCode } from './input';
import { loadValues, toValue } from './rows';
import { ledgerState, value } from './schema';
import type { Scope } from './scope';
import { runWrite, type WriteScope } from './write';

/**
 * Changing the default currency (architecture §6.6): every value's `base_minor` re-derived from
 * the stored rates at each value's own `fx_rate_date`, in one write, so every period reads exactly
 * as if the new currency had always been the base (J11 stays undistorted).
 *
 * What each value becomes in `code`:
 * - in `code` already: the rate is 1, as a value recorded in the base currency is;
 * - with a rate the person or their agent gave (a statement's): the rate is kept and carried into
 *   the new currency at the old base's stored rate for the value's own rate date, so the
 *   statement's rate is never swapped for a published one;
 * - otherwise: the stored rate from the value's currency into the new one at the value's own rate
 *   date, like a value recorded when the new currency was already the base.
 *
 * Provenance (`source`, `clientName`, `connectionId`, `batchId`) and `entered_at` stay as they
 * were; `row_version` moves on, so undoing an older change afterwards conflicts instead of reading
 * the old base back over the new one. One audit row per re-derived value plus the `ledger`
 * base-currency update, in the normal write-path shape, so P3-T1's generic undo reverses it entry
 * by entry. The caller acts as `system` (me.ts), so the log reads one system change. A write that
 * changes nothing writes nothing: the same currency again is a no-op.
 */
export function changeBaseCurrency(s: Scope, ccy: string): Promise<Write<void>> {
  const code = typeof ccy === 'string' ? ccy.trim().toUpperCase() : '';
  if (currencyExponent(code) === undefined) {
    const errors = new FieldErrors();
    errors.add(
      'CURRENCY_UNSUPPORTED',
      'baseCurrency',
      'Give the default currency as an ISO 4217 code in circulation, such as "USD".',
    );
    errors.throwIfAny();
  }
  return runWrite(s, 'changeBaseCurrency', async (w) => {
    const from = w.state.baseCurrency;
    if (code === from) return;
    const errors = new FieldErrors();
    const values = await loadValues(s);
    const ready: { value: Value; next: Rederived }[] = [];
    for (const v of values) {
      const next = await rederive(w, v, from, code, errors);
      if (next) ready.push({ value: v, next });
    }
    errors.throwIfAny();
    const now = s.now();
    for (const { value: v, next } of ready) {
      const [row] = await s.db
        .update(value)
        .set({
          baseMinor: next.baseMinor,
          baseCurrency: code,
          fxRate: next.fxRate,
          fxRateDate: next.fxRateDate,
          fxSource: next.fxSource,
          updatedAt: now,
          rowVersion: v.rowVersion + 1,
        })
        .where(and(eq(value.userId, s.userId), eq(value.id, v.id)))
        .returning();
      if (!row) throw new Error('A value vanished inside its own re-derivation.');
      await w.audit('value', v.id, 'update', v, toValue(row));
    }
    await s.db
      .update(ledgerState)
      .set({ baseCurrency: code })
      .where(eq(ledgerState.userId, s.userId));
    await w.audit('ledger', s.userId, 'update', { baseCurrency: from }, { baseCurrency: code });
  });
}

/** A value's base fields re-derived, or undefined with the reason added to `errors`. */
interface Rederived {
  baseMinor: number;
  fxRate: string;
  fxRateDate: string | null;
  fxSource: ValueFxSource;
}

async function rederive(
  w: WriteScope,
  v: Value,
  from: string,
  code: string,
  errors: FieldErrors,
): Promise<Rederived | undefined> {
  const at = `values.${v.id}`;
  if (v.currency === code) {
    return { baseMinor: v.amountMinor, fxRate: '1', fxRateDate: null, fxSource: 'same' };
  }
  const date = v.fxRateDate ?? v.date;
  let rate: { rate: string; rateDate: string | null; source: ValueFxSource };
  try {
    if (v.fxSource === 'user' || v.fxSource === 'agent') {
      const cross = await w.crossRate(from, code, date);
      rate = {
        rate: multiplyDecimal(v.fxRate, cross.rate),
        rateDate: v.fxRateDate,
        source: v.fxSource,
      };
    } else {
      const cross = await w.crossRate(v.currency, code, date);
      rate = { rate: cross.rate, rateDate: cross.rateDate, source: cross.source };
    }
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    errors.add(error.code as FieldErrorCode, at, error.message);
    return undefined;
  }
  let baseMinor: number;
  try {
    baseMinor = convert(v.amountMinor, minorRate(rate.rate, v.currency, code));
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    baseMinor = Number.POSITIVE_INFINITY;
  }
  if (Math.abs(baseMinor) > MAX_MINOR) {
    errors.add(
      'OUT_OF_RANGE',
      at,
      `Converted into ${code}, this value is more than NetNet holds: it cannot be re-derived.`,
    );
    return undefined;
  }
  return { baseMinor, fxRate: rate.rate, fxRateDate: rate.rateDate, fxSource: rate.source };
}
