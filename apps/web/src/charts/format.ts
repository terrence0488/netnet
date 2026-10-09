import { currencyExponent } from '@netnet/contracts/currencies';
import { fromMinor } from '@netnet/core';

/**
 * Figures on charts (design-system §2.1, §5): axis ticks, bar labels and allocation rows read
 * compact (`$59K`, `$1.23M`), never full. Like components/money, the exact decimal comes from core
 * and is handed to Intl as a string, so no amount passes through floating point; the sign is ours
 * (the true minus, never on a zero).
 */

const MINUS = '−';

/** The amount as an exact decimal in major units, for Intl to format. */
function decimalOf(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new RangeError(`Not an amount in minor units: ${minor}`);
  if (currencyExponent(currency) === undefined) {
    const digits = Math.abs(minor).toString().padStart(3, '0');
    return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
  }
  return fromMinor(minor, currency);
}

const formats = new Map<string, Intl.NumberFormat>();

function compactFormat(
  locale: string | undefined,
  currency: string,
  digits: number,
): Intl.NumberFormat {
  const key = `${locale ?? ''}|${currency}|${digits}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
    formats.set(key, format);
  }
  return format;
}

/**
 * `$59K`, `$1.84M`, `−$1K`: an amount in minor units, compacted for a chart label — whole
 * thousands, two decimals of millions, as the prototype reads them.
 */
export function formatCompactMoney(minor: number, currency: string, locale?: string): string {
  const signed = decimalOf(minor, currency);
  const decimal = signed.startsWith('-') ? signed.slice(1) : signed;
  // Millions carry two decimals; thousands read whole. Integer maths on the minor threshold.
  const millions = 10 ** ((currencyExponent(currency) ?? 2) + 6);
  const digits = Math.abs(minor) >= millions ? 2 : 0;
  let text = compactFormat(locale, currency, digits).format(decimal as Intl.StringNumericLiteral);
  if (/[1-9]/.test(text) && minor < 0) text = MINUS + text;
  return text;
}

/** `+$59K`, `−$1K`: a compact change figure, signed (design-system §2.1). */
export function formatSignedCompactMoney(minor: number, currency: string, locale?: string): string {
  const text = formatCompactMoney(minor, currency, locale);
  return minor > 0 ? `+${text}` : text;
}

/** `May 2026`: a date-axis label for the point dated `YYYY-MM-DD`. */
export function formatAxisDate(date: string, locale?: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
