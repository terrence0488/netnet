import { currencyExponent } from '@netnet/contracts/currencies';

/**
 * The number of decimal places in `currency`'s minor unit, or undefined for an unknown code. The
 * table is contracts', imported by its zod-free path (CONVENTIONS §3).
 */
export function exponentOf(currency: string): number | undefined {
  return currencyExponent(currency);
}

/** As `exponentOf`, for a currency the caller has already checked. */
export function requireExponent(currency: string): number {
  const exponent = exponentOf(currency);
  if (exponent === undefined) {
    throw new RangeError(`"${currency}" is not an ISO 4217 currency code in circulation.`);
  }
  return exponent;
}
