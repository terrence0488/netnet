import { describe, expect, it } from 'vitest';
import { amountHint, currencySymbol, formatMoney, minorDigits, parseAmount } from './money';

const en = { locale: 'en-SG' };

describe('minorDigits', () => {
  it('knows each currency’s minor unit', () => {
    expect(minorDigits('SGD')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
    expect(minorDigits('KWD')).toBe(3);
  });
});

describe('formatMoney', () => {
  it('shows cents only when there are cents (design-system §2.1 rule 3)', () => {
    expect(formatMoney(79_799_200, 'SGD', en)).toBe('$797,992');
    expect(formatMoney(2_810_053, 'SGD', en)).toBe('$28,100.53');
    expect(formatMoney(2_810_050, 'SGD', en)).toBe('$28,100.50');
  });

  it('never shows cents on a total, rounding half away from zero', () => {
    expect(formatMoney(79_799_253, 'SGD', { ...en, total: true })).toBe('$797,993');
    expect(formatMoney(79_799_249, 'SGD', { ...en, total: true })).toBe('$797,992');
    expect(formatMoney(-150, 'SGD', { ...en, total: true })).toBe('−$2');
  });

  it('uses the true minus sign, and a plus only for a change figure', () => {
    expect(formatMoney(-120_000, 'SGD', en)).toBe('−$1,200');
    expect(formatMoney(5_900_000, 'SGD', { ...en, signed: true })).toBe('+$59,000');
    expect(formatMoney(5_900_000, 'SGD', en)).toBe('$59,000');
  });

  it('gives a zero no sign, even when rounding made it zero', () => {
    expect(formatMoney(0, 'SGD', { ...en, signed: true })).toBe('$0');
    expect(formatMoney(-40, 'SGD', { ...en, total: true })).toBe('$0');
  });

  it('is exact for the largest amounts, with no floating point', () => {
    expect(formatMoney(999_999_999_999_999, 'SGD', en)).toBe('$9,999,999,999,999.99');
    expect(formatMoney(1_000_000_000_000_000, 'JPY', en)).toBe('¥1,000,000,000,000,000');
    expect(() => formatMoney(1.5, 'SGD', en)).toThrow(RangeError);
  });

  it('follows the currency’s own minor unit, and can add the code', () => {
    expect(formatMoney(1_250, 'JPY', en)).toBe('¥1,250');
    expect(formatMoney(1_250_125, 'KWD', { ...en, code: true })).toMatch(/1,250\.125 KWD$/);
    expect(formatMoney(150_000, 'USD', { ...en, code: true })).toBe('$1,500 USD');
  });
});

describe('currencySymbol', () => {
  it('is the narrow symbol in the reader’s locale', () => {
    expect(currencySymbol('SGD', 'en-SG')).toBe('$');
    expect(currencySymbol('GBP', 'en-GB')).toBe('£');
  });
});

describe('parseAmount', () => {
  it('accepts a decimal string within the minor unit, and normalises it', () => {
    expect(parseAmount('1,250.50', 'SGD', 'en-SG')).toStrictEqual({ ok: true, amount: '1250.5' });
    expect(parseAmount(' 0012 ', 'SGD', 'en-SG')).toStrictEqual({ ok: true, amount: '12' });
    expect(parseAmount('.5', 'SGD', 'en-SG')).toStrictEqual({ ok: true, amount: '0.5' });
    expect(parseAmount('7.', 'SGD', 'en-SG')).toStrictEqual({ ok: true, amount: '7' });
    expect(parseAmount('12.500', 'SGD', 'en-SG')).toStrictEqual({ ok: true, amount: '12.5' });
    expect(parseAmount('1250.0', 'JPY', 'en-SG')).toStrictEqual({ ok: true, amount: '1250' });
    expect(parseAmount('1.125', 'KWD', 'en-SG')).toStrictEqual({ ok: true, amount: '1.125' });
  });

  it('reads the decimal separator and the grouping of the reader’s locale', () => {
    expect(parseAmount('1.250,5', 'IDR', 'id-ID')).toStrictEqual({ ok: true, amount: '1250.5' });
    expect(parseAmount('1 234 567,89', 'EUR', 'fr-FR')).toStrictEqual({
      ok: true,
      amount: '1234567.89',
    });
    expect(parseAmount('1,23,456.5', 'INR', 'en-IN')).toStrictEqual({
      ok: true,
      amount: '123456.5',
    });
    expect(parseAmount('12’345.60', 'CHF', 'de-CH')).toStrictEqual({ ok: true, amount: '12345.6' });
    expect(parseAmount('1 234.5', 'SGD', 'en-SG')).toStrictEqual({ ok: true, amount: '1234.5' });
  });

  it('never reads a misplaced separator as grouping, so 12,5 is not 125', () => {
    for (const [text, locale] of [
      ['12,5', 'en-SG'],
      ['1,2345', 'en-SG'],
      ['12.5', 'id-ID'],
      ['1.2.3', 'en-SG'],
      ['12 5', 'en-SG'],
      [',5', 'en-SG'],
    ] as const) {
      expect(parseAmount(text, 'SGD', locale), `${text} in ${locale}`).toStrictEqual({
        ok: false,
        problem: 'format',
      });
    }
  });

  it('rejects more precision than the currency has', () => {
    expect(parseAmount('12.345', 'SGD', 'en-SG')).toStrictEqual({
      ok: false,
      problem: 'precision',
    });
    expect(parseAmount('1250.5', 'JPY', 'en-SG')).toStrictEqual({
      ok: false,
      problem: 'precision',
    });
  });

  it('rejects what is not an amount', () => {
    for (const text of ['-5', '+5', '1.2.3', 'abc', '.', '1e5', '$5', '5 SGD']) {
      expect(parseAmount(text, 'SGD', 'en-SG'), text).toStrictEqual({
        ok: false,
        problem: 'format',
      });
    }
    expect(parseAmount('  ', 'SGD', 'en-SG')).toStrictEqual({ ok: false, problem: 'empty' });
  });
});

describe('amountHint', () => {
  it('says what to change, in plain language and the reader’s notation', () => {
    expect(amountHint('precision', 'SGD')).toBe('Use at most 2 decimal places.');
    expect(amountHint('precision', 'JPY')).toBe('Use a whole number: JPY has no smaller unit.');
    expect(amountHint('format', 'SGD', 'en-SG')).toBe(
      'Use digits and one decimal point, like 1250.50.',
    );
    expect(amountHint('format', 'IDR', 'id-ID')).toBe(
      'Use digits and one decimal comma, like 1250,50.',
    );
    expect(amountHint('format', 'JPY', 'en-SG')).toBe('Use digits only, like 1250.');
  });
});
