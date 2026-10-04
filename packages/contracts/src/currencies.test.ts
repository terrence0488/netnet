import { describe, expect, it } from 'vitest';
import { countriesSchema } from './content';
import { CURRENCY_CODES, CURRENCY_EXPONENTS, currencyExponent, isCurrency } from './currencies';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Every two-letter key, to carry up to 676 currencies in one countries document. */
const KEYS = [...LETTERS].flatMap((a) => [...LETTERS].map((b) => a + b));

/** The three-letter codes content validation accepts as a country's currency. */
function codesContentAccepts(): string[] {
  const accepted: string[] = [];
  for (const first of LETTERS) {
    const codes = KEYS.map((rest) => first + rest);
    const doc = Object.fromEntries(KEYS.map((key, i) => [key, { currency: codes[i] }]));
    const result = countriesSchema.safeParse(doc);
    const rejected = new Set(result.error?.issues.map((issue) => issue.path[0]) ?? []);
    accepted.push(...codes.filter((_, i) => !rejected.has(KEYS[i])));
  }
  return accepted;
}

describe('the ISO 4217 table', () => {
  it('has exactly the codes content validation accepts', () => {
    expect(CURRENCY_CODES).toStrictEqual(codesContentAccepts());
  });

  it('is in code order, with 155 currencies', () => {
    expect(CURRENCY_CODES).toStrictEqual([...CURRENCY_CODES].sort());
    expect(CURRENCY_CODES).toHaveLength(155);
  });

  it('gives each currency its ISO 4217 minor unit', () => {
    const byExponent = (n: number) => CURRENCY_CODES.filter((c) => CURRENCY_EXPONENTS[c] === n);
    expect(byExponent(0)).toStrictEqual(
      'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX VND VUV XAF XOF XPF'.split(' '),
    );
    expect(byExponent(3)).toStrictEqual('BHD IQD JOD KWD LYD OMR TND'.split(' '));
    expect(byExponent(2)).toHaveLength(155 - 16 - 7);
  });

  it('answers for a code, and for anything else', () => {
    expect(isCurrency('SGD')).toBe(true);
    expect(currencyExponent('IDR')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    for (const code of ['sgd', 'XAU', 'XXX', 'toString', '']) {
      expect(isCurrency(code), code).toBe(false);
      expect(currencyExponent(code), code).toBeUndefined();
    }
  });
});
