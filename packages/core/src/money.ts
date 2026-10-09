import type { Err } from '@netnet/contracts';
import { exponentOf, requireExponent } from './currencies';

/**
 * Money (architecture §6.6, CONVENTIONS §5). Amounts are integers in the currency's minor unit;
 * decimal amounts in major units appear only at the edges and pass through `toMinor` once.
 * Arithmetic that scales an amount runs on BigInt, so nothing is ever rounded by floating point.
 */

/** The largest amount, either way, in minor units. */
export const MAX_MINOR = 10 ** 15;

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
const RATE = /^(\d+)(?:\.(\d+))?$/;

/** A decimal `int.frac` with its point moved `shift` places right, as a plain decimal string. */
function shiftPoint(int: string, frac: string, shift: number): string {
  const digits = int + frac;
  const point = int.length + shift;
  const whole = point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0');
  const fraction = point <= 0 ? '0'.repeat(-point) + digits : digits.slice(point);
  const trimmed = fraction.replace(/0+$/, '');
  return `${whole.replace(/^0+(?=\d)/, '')}${trimmed ? `.${trimmed}` : ''}`;
}

/** A finite number as the plain decimal it prints as, never in exponent notation. */
function plainDecimal(n: number): string {
  const text = String(n);
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!match) return text;
  const [, sign = '', int = '', frac = '', exp = ''] = match;
  return sign + shiftPoint(int, frac, Number(exp));
}

const example = (exponent: number) =>
  exponent === 0 ? '1234' : `1234.${'5678'.slice(0, exponent)}`;

/**
 * A decimal amount in major units (`"1234.56"`, or a number) as an integer in minor units. Returns
 * an `Err` naming the allowed form for an unknown currency, a malformed amount, more decimal places
 * than the currency has, or more than `MAX_MINOR` minor units either way. Trailing zeros are not
 * extra precision.
 */
export function toMinor(amount: string | number, currency: string): number | Err {
  const exponent = exponentOf(currency);
  if (exponent === undefined) {
    return {
      code: 'CURRENCY_UNSUPPORTED',
      message: `"${currency}" is not an ISO 4217 currency code in circulation. Use a code such as "USD".`,
    };
  }
  const text =
    typeof amount === 'number' && Number.isFinite(amount) ? plainDecimal(amount) : amount;
  const match = typeof text === 'string' ? DECIMAL.exec(text) : null;
  if (!match) {
    return {
      code: 'VALIDATION_FAILED',
      message: `Give the amount as a decimal number in ${currency}, such as ${example(exponent)}, with no symbols or separators.`,
    };
  }
  const [, sign, int = '', frac = ''] = match;
  const significant = frac.replace(/0+$/, '');
  if (significant.length > exponent) {
    return {
      code: 'OUT_OF_RANGE',
      message:
        exponent === 0
          ? `${currency} has no minor unit: give a whole number, such as ${example(0)}.`
          : `${currency} has ${exponent} decimal places: give at most ${exponent}, such as ${example(exponent)}.`,
    };
  }
  const minor = BigInt(int + significant.padEnd(exponent, '0'));
  if (minor > BigInt(MAX_MINOR)) {
    return {
      code: 'OUT_OF_RANGE',
      message: `Give an amount of at most ${fromMinor(MAX_MINOR, currency)} ${currency} either way.`,
    };
  }
  const n = Number(minor);
  return sign && n !== 0 ? -n : n;
}

/** Minor units as a decimal in major units with the currency's decimal places: `"1234.56"`. */
export function fromMinor(minor: number, currency: string): string {
  const exponent = requireExponent(currency);
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`${minor} is not a whole number of minor units.`);
  }
  const digits = String(Math.abs(minor)).padStart(exponent + 1, '0');
  const sign = minor < 0 ? '-' : '';
  return exponent === 0
    ? sign + digits
    : `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** Divides, rounding half away from zero. `divisor` is positive. */
function divideRounded(dividend: bigint, divisor: bigint): bigint {
  const quotient = dividend / divisor;
  const remainder = dividend % divisor;
  const twice = 2n * (remainder < 0n ? -remainder : remainder);
  if (twice < divisor) return quotient;
  return dividend < 0n ? quotient - 1n : quotient + 1n;
}

function parseRate(rate: string): { int: string; frac: string } {
  const match = RATE.exec(rate);
  if (!match) throw new RangeError(`"${rate}" is not a rate: give a decimal such as 1.3456.`);
  return { int: match[1] ?? '', frac: match[2] ?? '' };
}

/**
 * `minor` multiplied by a decimal `rate`, exactly, rounded half away from zero to a whole number.
 * The rate applies unit for unit, so between currencies with different decimal places pass
 * `minorRate`'s result.
 */
export function convert(minor: number, rate: string): number {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`${minor} is not a whole number of minor units.`);
  }
  const { int, frac } = parseRate(rate);
  const product = BigInt(minor) * BigInt(int + frac);
  const result = Number(divideRounded(product, 10n ** BigInt(frac.length)));
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Converting ${minor} at ${rate} is too large to hold exactly.`);
  }
  return result;
}

/**
 * A rate between major units (1 `from` = `rate` `to`, as a statement shows it) as the rate between
 * the two currencies' minor units, exactly: `convert(minor, minorRate(rate, from, to))`.
 */
export function minorRate(rate: string, from: string, to: string): string {
  const { int, frac } = parseRate(rate);
  return shiftPoint(int, frac, requireExponent(to) - requireExponent(from));
}

/**
 * The change between two amounts in minor units: newer minus older, signed. Whole numbers in,
 * whole number out — exact, never through floating point. Amounts already carry their sign (a
 * liability reads negative), so a growing debt reads as a negative change.
 */
export function deltaMinor(newer: number, older: number): number {
  if (!Number.isSafeInteger(newer) || !Number.isSafeInteger(older)) {
    throw new RangeError('Give whole numbers of minor units.');
  }
  const delta = newer - older;
  if (!Number.isSafeInteger(delta)) {
    throw new RangeError('The change is too large to hold exactly.');
  }
  return delta;
}
