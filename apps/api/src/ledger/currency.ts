import type { Write } from '@netnet/contracts';
import { currencyExponent } from '@netnet/contracts/currencies';
import { and, eq } from 'drizzle-orm';
import { AppError } from '../lib/errors';
import { FieldErrors, type FieldErrorCode } from './input';
import { convertInto, givenRateOf, rateInto, type ValueRate } from './money';
import { loadValueRows, type ValueRow } from './rows';
import { ledgerState, value } from './schema';
import type { Scope } from './scope';
import { runWrite, type WriteScope } from './write';

/**
 * Changing the default currency (architecture §6.6): every value's `base_minor` re-derived at the
 * value's own date, in one write, so every period reads as if the new currency had always been the
 * base (J11 stays undistorted).
 *
 * What each value becomes in `code` (`money.rateInto`):
 * - in `code` already: the rate is 1, as a value recorded in the base currency is; a rate the
 *   person or their agent gave is kept, unused;
 * - with a given rate into `code`: that rate, as given;
 * - with a given rate into another currency: that rate times the stored cross rate from that
 *   currency into `code`, so every change starts from the rate as given and none compounds;
 * - otherwise: the stored published rate from the value's currency into `code`, like a value
 *   recorded when `code` was already the base.
 *
 * No amount, date or rate anyone entered changes, so the log reads one `system` entry for the whole
 * change (§6.8): the `ledger` row, old currency → new with the number of values re-derived, and no
 * row per value. Provenance and `entered_at` stay; `updated_at` and `row_version` move on, as for
 * any change to a row. A missing rate or a value too large in `code` fails the whole change, naming
 * the value. The same currency again is a no-op.
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
    const rows = await loadValueRows(s);
    const ready: { row: ValueRow; next: Rederived }[] = [];
    for (const row of rows) {
      const next = await rederive(w, row, code, errors);
      if (next) ready.push({ row, next });
    }
    errors.throwIfAny();
    const now = s.now();
    for (const { row, next } of ready) {
      const [updated] = await s.db
        .update(value)
        .set({
          baseMinor: next.baseMinor,
          baseCurrency: code,
          fxRate: next.rate,
          fxRateDate: next.rateDate,
          fxSource: next.source,
          updatedAt: now,
          rowVersion: row.rowVersion + 1,
        })
        .where(and(eq(value.userId, s.userId), eq(value.id, row.id)))
        .returning({ id: value.id });
      if (!updated) throw new Error('A value vanished inside its own re-derivation.');
    }
    await s.db
      .update(ledgerState)
      .set({ baseCurrency: code })
      .where(eq(ledgerState.userId, s.userId));
    await w.audit(
      'ledger',
      s.userId,
      'update',
      { baseCurrency: from },
      { baseCurrency: code, valuesRederived: rows.length },
    );
  });
}

/** A value's base fields re-derived. */
interface Rederived extends ValueRate {
  baseMinor: number;
}

/** `row` re-derived into `code`, or undefined with the reason added to `errors`. */
async function rederive(
  w: WriteScope,
  row: ValueRow,
  code: string,
  errors: FieldErrors,
): Promise<Rederived | undefined> {
  const at = `values.${row.id}`;
  let rate: ValueRate;
  try {
    rate = await rateInto(
      w,
      { currency: row.currency, date: row.date, given: givenRateOf(row) },
      code,
    );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    errors.add(error.code as FieldErrorCode, at, error.message);
    return undefined;
  }
  const baseMinor = convertInto(row.amountMinor, row.currency, rate.rate, code);
  if (baseMinor === undefined) {
    errors.add(
      'OUT_OF_RANGE',
      at,
      `Converted into ${code}, this value is more than NetNet holds: it cannot be re-derived.`,
    );
    return undefined;
  }
  return { ...rate, baseMinor };
}
