/**
 * Exchange rates as decimal strings (CONVENTIONS §5). Rates are divided, never multiplied into
 * money here: `core.convert` does that. Division is exact up to the requested number of significant
 * digits, then rounds half away from zero, with BigInt inside.
 */

/**
 * Significant digits kept when a rate is derived by division: above every digit a central bank
 * publishes (about six), far below where the error could reach a minor unit of a converted amount.
 */
export const RATE_DIGITS = 12;

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

interface Scaled {
  /** The digits as an integer. */
  digits: bigint;
  /** Places after the point: the value is `digits × 10^-scale`. */
  scale: number;
}

function parse(value: string): Scaled {
  const match = DECIMAL.exec(value);
  if (!match) throw new Error(`Not a plain decimal: "${value.slice(0, 40)}"`);
  const fraction = match[2] ?? '';
  return { digits: BigInt(`${match[1]}${fraction}`), scale: fraction.length };
}

const TEN = 10n;

function pow10(exponent: number): bigint {
  return TEN ** BigInt(exponent);
}

/** `digits × 10^exponent` as a plain decimal string, with no trailing zeros after the point. */
function format(digits: bigint, exponent: number): string {
  if (exponent >= 0) return (digits * pow10(exponent)).toString();
  const places = -exponent;
  const text = digits.toString().padStart(places + 1, '0');
  const whole = text.slice(0, text.length - places);
  const fraction = text.slice(text.length - places).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

/** A positive decimal string in its shortest plain form ("1.2300" → "1.23", "007" → "7"). */
export function normalizeDecimal(value: string): string {
  const { digits, scale } = parse(value);
  return format(digits, -scale);
}

/**
 * `dividend ÷ divisor` to `significant` digits, rounded half away from zero. Both are positive
 * plain decimal strings; the result is one too.
 */
export function divideDecimal(
  dividend: string,
  divisor: string,
  significant: number = RATE_DIGITS,
): string {
  const a = parse(dividend);
  const b = parse(divisor);
  if (b.digits === 0n) throw new Error('Division by zero');
  if (a.digits === 0n) return '0';
  // a / b = (A / B) × 10^(b.scale − a.scale). Shift A left by `shift` places so that the integer
  // quotient has more digits than we keep, then drop `drop` of them with rounding.
  const shift = Math.max(
    0,
    significant + 1 + b.digits.toString().length - a.digits.toString().length,
  );
  const numerator = a.digits * pow10(shift);
  const drop = (numerator / b.digits).toString().length - significant;
  const denominator = b.digits * pow10(drop);
  let quotient = numerator / denominator;
  if ((numerator % denominator) * 2n >= denominator) quotient += 1n;
  return format(quotient, drop - shift + b.scale - a.scale);
}

/**
 * `a × b`, exactly: the product of two finite decimals is finite, so nothing is rounded. Both are
 * positive plain decimal strings; the result is one too.
 */
export function multiplyDecimal(a: string, b: string): string {
  const x = parse(a);
  const y = parse(b);
  if (x.digits === 0n || y.digits === 0n) return '0';
  return format(x.digits * y.digits, -(x.scale + y.scale));
}

/**
 * A rate as a JSON number becomes a decimal string. JavaScript prints a double with the fewest
 * digits that read back as the same double, which for a published rate is the digits it was
 * published with; exponent notation (`1e-7`) is expanded.
 */
export function decimalFromNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`A rate must be a positive finite number, not ${String(value)}`);
  }
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!match) return normalizeDecimal(text);
  const fraction = match[2] ?? '';
  return format(BigInt(`${match[1]}${fraction}`), Number(match[3]) - fraction.length);
}
