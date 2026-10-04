import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_MINOR, convert, fromMinor, minorRate, toMinor } from './money';

/** One currency for each number of decimal places in the table: 0, 2 and 3. */
const CURRENCIES = { JPY: 0, SGD: 2, KWD: 3 } as const;

describe('toMinor', () => {
  it.each([
    ['1234.56', 'SGD', 123456],
    ['0.05', 'SGD', 5],
    ['-0.05', 'SGD', -5],
    ['12.300', 'SGD', 1230],
    ['007', 'SGD', 700],
    ['1234', 'JPY', 1234],
    ['1234.000', 'JPY', 1234],
    ['1.234', 'KWD', 1234],
    ['-12.5', 'KWD', -12500],
  ])('reads %s %s as %d minor units', (amount, currency, minor) => {
    expect(toMinor(amount, currency)).toBe(minor);
  });

  it('reads a number by the decimal it prints as', () => {
    expect(toMinor(1234.56, 'SGD')).toBe(123456);
    expect(toMinor(0.1, 'SGD')).toBe(10);
    expect(toMinor(-7, 'JPY')).toBe(-7);
    expect(toMinor(1.5e-2, 'KWD')).toBe(15);
    expect(toMinor(1e14, 'JPY')).toBe(1e14);
  });

  it('never returns negative zero', () => {
    expect(Object.is(toMinor('-0.00', 'SGD'), 0)).toBe(true);
    expect(Object.is(toMinor(-0, 'JPY'), 0)).toBe(true);
  });

  it.each([
    ['1234.567', 'SGD', 'SGD has 2 decimal places: give at most 2, such as 1234.56.'],
    ['1234.5', 'JPY', 'JPY has no minor unit: give a whole number, such as 1234.'],
    ['1.2345', 'KWD', 'KWD has 3 decimal places: give at most 3, such as 1234.567.'],
    [0.30000000000000004, 'SGD', 'SGD has 2 decimal places: give at most 2, such as 1234.56.'],
    [1e-7, 'SGD', 'SGD has 2 decimal places: give at most 2, such as 1234.56.'],
  ])('rejects extra precision in %s %s', (amount, currency, message) => {
    expect(toMinor(amount, currency)).toStrictEqual({ code: 'OUT_OF_RANGE', message });
  });

  it('accepts up to 10¹⁵ minor units either way, and rejects more', () => {
    expect(toMinor('10000000000000.00', 'SGD')).toBe(MAX_MINOR);
    expect(toMinor('-10000000000000', 'SGD')).toBe(-MAX_MINOR);
    expect(toMinor('1000000000000000', 'JPY')).toBe(MAX_MINOR);
    const tooBig = {
      code: 'OUT_OF_RANGE',
      message: 'Give an amount of at most 10000000000000.00 SGD either way.',
    };
    expect(toMinor('10000000000000.01', 'SGD')).toStrictEqual(tooBig);
    expect(toMinor('-10000000000000.01', 'SGD')).toStrictEqual(tooBig);
    expect(toMinor(1e21, 'SGD')).toStrictEqual(tooBig);
    expect(toMinor('1000000000000001', 'JPY')).toMatchObject({ code: 'OUT_OF_RANGE' });
  });

  it.each(['1,234.56', '', ' 12', '12 ', '+12', '1.', '.5', '1e3', 'SGD 12', '12-', '--1'])(
    'rejects %j as malformed, naming the allowed form',
    (amount) => {
      expect(toMinor(amount, 'SGD')).toStrictEqual({
        code: 'VALIDATION_FAILED',
        message:
          'Give the amount as a decimal number in SGD, such as 1234.56, with no symbols or separators.',
      });
    },
  );

  it('rejects numbers that are not finite', () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(toMinor(amount, 'JPY')).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it.each(['XYZ', 'sgd', 'XAU', ''])('rejects the currency %j', (currency) => {
    expect(toMinor('1', currency)).toStrictEqual({
      code: 'CURRENCY_UNSUPPORTED',
      message: `"${currency}" is not an ISO 4217 currency code in circulation. Use a code such as "USD".`,
    });
  });
});

describe('fromMinor', () => {
  it.each([
    [123456, 'SGD', '1234.56'],
    [5, 'SGD', '0.05'],
    [-5, 'SGD', '-0.05'],
    [0, 'SGD', '0.00'],
    [-0, 'SGD', '0.00'],
    [1234, 'JPY', '1234'],
    [-1234, 'JPY', '-1234'],
    [1234, 'KWD', '1.234'],
    [7, 'KWD', '0.007'],
    [MAX_MINOR, 'SGD', '10000000000000.00'],
  ])('writes %d %s as %s', (minor, currency, text) => {
    expect(fromMinor(minor, currency)).toBe(text);
  });

  it('rejects a fraction of a minor unit, an unsafe integer and an unknown currency', () => {
    expect(() => fromMinor(1.5, 'SGD')).toThrow(RangeError);
    expect(() => fromMinor(2 ** 53, 'SGD')).toThrow(RangeError);
    expect(() => fromMinor(1, 'XYZ')).toThrow('"XYZ" is not an ISO 4217 currency code');
  });
});

describe('convert', () => {
  it.each([
    [10000, '1.35', 13500],
    [100, '1.23456789', 123],
    [123456, '1', 123456],
    [0, '1.5', 0],
    [5, '0', 0],
    [MAX_MINOR, '1.5', 1.5e15],
  ])('converts %d at %s exactly to %d', (minor, rate, result) => {
    expect(convert(minor, rate)).toBe(result);
  });

  it.each([
    [1, '0.5', 1],
    [-1, '0.5', -1],
    [3, '0.5', 2],
    [-3, '0.5', -2],
    [5, '0.1', 1],
    [-5, '0.1', -1],
    [4, '0.1', 0],
    [-4, '0.1', 0],
    [15, '0.0333', 0],
    [25, '0.06', 2],
    [-25, '0.06', -2],
  ])('rounds %d × %s half away from zero to %d', (minor, rate, result) => {
    expect(convert(minor, rate)).toBe(result);
  });

  it('never returns negative zero', () => {
    expect(Object.is(convert(-4, '0.1'), 0)).toBe(true);
  });

  it.each(['1,35', '-1.35', '1e3', '', '.5', '1.', ' 1'])('rejects the rate %j', (rate) => {
    expect(() => convert(100, rate)).toThrow(RangeError);
  });

  it('rejects a fraction of a minor unit, and a result too large to hold exactly', () => {
    expect(() => convert(1.5, '1')).toThrow(RangeError);
    expect(() => convert(MAX_MINOR, '100')).toThrow('too large to hold exactly');
  });
});

describe('minorRate', () => {
  it.each([
    ['1.35', 'USD', 'SGD', '1.35'],
    ['0.0091', 'JPY', 'SGD', '0.91'],
    ['150', 'USD', 'JPY', '1.5'],
    ['2', 'JPY', 'USD', '200'],
    ['3.25', 'KWD', 'USD', '0.325'],
    ['0.5', 'KWD', 'JPY', '0.0005'],
    ['007.50', 'USD', 'EUR', '7.5'],
    ['0', 'USD', 'JPY', '0'],
  ])('turns 1 %2$s = %1$s %3$s into a rate between minor units', (rate, from, to, result) => {
    expect(minorRate(rate, from, to)).toBe(result);
  });

  it('converts between minor units with convert', () => {
    // 1 KWD = 3.25 USD, so 1.234 KWD (1234 fils) = 4.0105 USD, which rounds to 401 cents.
    expect(convert(1234, minorRate('3.25', 'KWD', 'USD'))).toBe(401);
    // 1 USD = 150.25 JPY, so 12.34 USD = 1854.085 JPY, which rounds to 1854 yen.
    expect(convert(1234, minorRate('150.25', 'USD', 'JPY'))).toBe(1854);
  });

  it('rejects a malformed rate and an unknown currency', () => {
    expect(() => minorRate('1,5', 'USD', 'JPY')).toThrow(RangeError);
    expect(() => minorRate('1.5', 'USD', 'XYZ')).toThrow(RangeError);
  });
});

describe('money properties', () => {
  const currency = fc.constantFrom(...(Object.keys(CURRENCIES) as (keyof typeof CURRENCIES)[]));
  const minor = fc.integer({ min: -MAX_MINOR, max: MAX_MINOR });
  /** A decimal rate with up to 9 decimal places, as its digits and scale. */
  const rate = fc
    .record({
      digits: fc.bigInt({ min: 0n, max: 10n ** 9n }),
      scale: fc.integer({ min: 0, max: 9 }),
    })
    .map(({ digits, scale }) => {
      const text = digits.toString().padStart(scale + 1, '0');
      return {
        digits,
        scale,
        text: scale === 0 ? text : `${text.slice(0, -scale)}.${text.slice(-scale)}`,
      };
    });

  it('reads back every amount it writes', () => {
    fc.assert(
      fc.property(minor, currency, (m, c) => {
        expect(toMinor(fromMinor(m, c), c)).toBe(m);
      }),
    );
  });

  it('rejects any amount with one decimal place more than the currency has', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 ** 6 }), fc.integer({ min: 1, max: 9 }), currency, (n, d, c) => {
        const amount = `${n}.${'0'.repeat(CURRENCIES[c])}${d}`;
        expect(toMinor(amount, c)).toMatchObject({ code: 'OUT_OF_RANGE' });
      }),
    );
  });

  it('rounds to the nearest whole minor unit, and halves away from zero', () => {
    fc.assert(
      fc.property(fc.integer({ min: -(10 ** 6), max: 10 ** 6 }), rate, (m, r) => {
        const result = BigInt(convert(m, r.text));
        const exact = BigInt(m) * r.digits;
        const unit = 10n ** BigInt(r.scale);
        const abs = (x: bigint) => (x < 0n ? -x : x);
        const twice = 2n * abs(result * unit - exact);
        expect(twice <= unit).toBe(true);
        // On a tie, the result is further from zero than the exact product.
        if (twice === unit) expect(abs(result * unit)).toBeGreaterThan(abs(exact));
      }),
    );
  });

  it('converts a negative amount to the negative of the positive one', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 ** 6 }), rate, (m, r) => {
        expect(convert(-m, r.text) + convert(m, r.text)).toBe(0);
      }),
    );
  });

  it('leaves an amount unchanged between currencies with the same decimal places at rate 1', () => {
    fc.assert(
      fc.property(minor, (m) => {
        expect(convert(m, minorRate('1', 'USD', 'EUR'))).toBe(m);
      }),
    );
  });
});
