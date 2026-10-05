import { currencyExponent } from '@netnet/contracts/currencies';
import { fromMinor } from '@netnet/core';

/**
 * Showing and typing money (design-system §2.1, CONVENTIONS §5). Amounts arrive as integers in the
 * currency's minor unit. The web holds no money implementation of its own: the minor unit comes
 * from the contracts currency table and the decimal from core, and the exact string is handed to
 * Intl, so no amount ever passes through floating point. The browser's Intl is not the source of
 * the minor unit: its CLDR data differs from ISO 4217 for some currencies (IDR, MMK, LAK, IQD
 * among them) and changes between browser versions, while the server stores ISO 4217 minor units.
 */

const MINUS = '−';

/**
 * The currency's minor unit per ISO 4217: 2 for most, 0 for some, 3 or 4 for a few. Unknown codes
 * read as 2, so a code the table never learned still shows rather than breaking the screen.
 */
export function minorDigits(currency: string): number {
  return currencyExponent(currency) ?? 2;
}

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

function numberFormat(locale: string | undefined, currency: string, digits: number) {
  const key = `${locale ?? ''}|${currency}|${digits}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formats.set(key, format);
  }
  return format;
}

export interface MoneyFormat {
  /** A total never shows cents (§2.1 rule 3); it is rounded half away from zero. */
  readonly total?: boolean;
  /** A change figure: `+` when it went up as well as `−` when it went down (§2 principle 5). */
  readonly signed?: boolean;
  /** Append the ISO code, where a symbol alone would be ambiguous (a foreign holding). */
  readonly code?: boolean;
  readonly locale?: string;
}

/**
 * `$797,992`, `$28,100.53`, `−$1,200`: cents only when there are cents (§2.1 rule 3), and the true
 * minus sign.
 */
export function formatMoney(minor: number, currency: string, options: MoneyFormat = {}): string {
  const signed = decimalOf(minor, currency);
  // Intl formats the size; the sign is ours (the true minus, and none on a zero).
  const decimal = signed.startsWith('-') ? signed.slice(1) : signed;
  const cents = decimal.includes('.') ? (decimal.split('.')[1] ?? '') : '';
  const shown = options.total || !/[1-9]/.test(cents) ? 0 : cents.length;
  let text = numberFormat(options.locale, currency, shown).format(
    decimal as Intl.StringNumericLiteral,
  );
  if (/[1-9]/.test(text)) {
    if (minor < 0) text = MINUS + text;
    else if (options.signed) text = `+${text}`;
  }
  return options.code ? `${text} ${currency}` : text;
}

/** The currency's symbol as the reader's locale writes it: `$`, `£`, `RM`. */
export function currencySymbol(currency: string, locale?: string): string {
  const parts = numberFormat(locale, currency, 0).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency;
}

export type AmountProblem = 'empty' | 'format' | 'precision';

export type AmountCheck =
  | { readonly ok: true; readonly amount: string }
  | { readonly ok: false; readonly problem: AmountProblem };

interface Separators {
  readonly decimal: string;
  /** Every character that may group digits: the locale's own, spaces and apostrophes. */
  readonly group: RegExp;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** The reader's decimal separator, and what may group the digits before it. */
function separators(locale: string | undefined): Separators {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  const own = parts.find((p) => p.type === 'group')?.value ?? ',';
  const group = [own, ' ', ' ', ' ', "'", '’'].filter((c) => c !== decimal);
  return { decimal, group: new RegExp(`[${group.map(escapeRegExp).join('')}]`) };
}

/**
 * Digits grouped the way a person writes them: 1–3 digits first, then groups of 2 or 3 (which
 * covers 1,23,456 as well as 123,456), the last always 3. So `12,5` typed for twelve and a half,
 * where the comma is not the decimal separator, is refused rather than read as 125.
 */
function wellGrouped(groups: readonly string[]): boolean {
  if (groups.length === 1) return true;
  return groups.every((group, i) => {
    if (i === 0) return /^\d{1,3}$/.test(group);
    if (i === groups.length - 1) return /^\d{3}$/.test(group);
    return /^\d{2,3}$/.test(group);
  });
}

/**
 * A typed amount, checked against the currency's minor unit and written the reader's way (the
 * decimal separator of `locale`, digits optionally grouped). The result is a plain decimal string
 * (`1250.5`) for the API, which converts it once with core.toMinor.
 */
export function parseAmount(text: string, currency: string, locale?: string): AmountCheck {
  const typed = text.trim();
  if (typed === '') return { ok: false, problem: 'empty' };
  const { decimal, group } = separators(locale);
  const [before = '', after, ...more] = typed.split(decimal);
  const groups = before.split(group);
  if (
    more.length > 0 ||
    !groups.every((g) => /^\d*$/.test(g)) ||
    !wellGrouped(groups) ||
    !/^\d*$/.test(after ?? '') ||
    (before === '' && !after)
  ) {
    return { ok: false, problem: 'format' };
  }
  const cents = (after ?? '').replace(/0+$/, '');
  if (cents.length > minorDigits(currency)) return { ok: false, problem: 'precision' };
  const integer = groups.join('').replace(/^0+(?=\d)/, '') || '0';
  return { ok: true, amount: cents ? `${integer}.${cents}` : integer };
}

/** What to do about a problem, in plain language and the reader's own notation (J5). */
export function amountHint(problem: AmountProblem, currency: string, locale?: string): string {
  const digits = minorDigits(currency);
  const { decimal } = separators(locale);
  switch (problem) {
    case 'empty':
      return 'Enter an amount.';
    case 'format':
      return digits
        ? `Use digits and one decimal ${decimal === ',' ? 'comma' : 'point'}, like 1250${decimal}${'5'.padEnd(digits, '0')}.`
        : 'Use digits only, like 1250.';
    case 'precision':
      return digits
        ? `Use at most ${digits} decimal place${digits === 1 ? '' : 's'}.`
        : `Use a whole number: ${currency} has no smaller unit.`;
  }
}
