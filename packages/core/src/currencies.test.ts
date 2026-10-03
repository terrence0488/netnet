import { CURRENCY_CODES, CURRENCY_EXPONENTS } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { exponentOf, requireExponent } from './currencies';

describe("core's copy of the ISO 4217 table", () => {
  it('gives every code in contracts the same number of decimal places', () => {
    for (const code of CURRENCY_CODES) {
      expect(exponentOf(code), code).toBe(CURRENCY_EXPONENTS[code]);
    }
  });

  it('knows no code that contracts does not', () => {
    for (const code of ['XYZ', 'usd', 'XAU', 'XDR', 'XTS', 'toString', '']) {
      expect(exponentOf(code), code).toBeUndefined();
    }
    expect(() => requireExponent('XYZ')).toThrow(
      '"XYZ" is not an ISO 4217 currency code in circulation.',
    );
    expect(requireExponent('KWD')).toBe(3);
  });
});
