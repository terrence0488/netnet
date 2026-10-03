import { describe, expect, it } from 'vitest';
import { decimalFromNumber, divideDecimal, normalizeDecimal, RATE_DIGITS } from './decimal';

describe('divideDecimal', () => {
  it('keeps twelve significant digits by default', () => {
    expect(RATE_DIGITS).toBe(12);
    expect(divideDecimal('2', '3')).toBe('0.666666666667');
    expect(divideDecimal('1', '3')).toBe('0.333333333333');
    expect(divideDecimal('171.2', '1.165')).toBe('146.9527897');
    expect(divideDecimal('19024.65', '1.165')).toBe('16330.1716738');
  });

  it('rounds half away from zero', () => {
    expect(divideDecimal('1', '8', 2)).toBe('0.13');
    expect(divideDecimal('1', '8', 1)).toBe('0.1');
    expect(divideDecimal('5', '2', 1)).toBe('3');
    expect(divideDecimal('9.9999999999995', '1')).toBe('10');
  });

  it('is exact when the quotient terminates, with no trailing zeros', () => {
    expect(divideDecimal('1', '4')).toBe('0.25');
    expect(divideDecimal('3.6725', '1')).toBe('3.6725');
    expect(divideDecimal('26145', '1.000')).toBe('26145');
    expect(divideDecimal('0', '7')).toBe('0');
  });

  it('keeps significant digits for very small and very large quotients', () => {
    expect(divideDecimal('1.28326180258', '26145')).toBe('0.0000490824938833');
    expect(divideDecimal('100', '0.0003')).toBe('333333.333333');
    expect(divideDecimal('26145', '0.00001', 3)).toBe('2610000000');
  });

  it('refuses a zero divisor and anything that is not a plain decimal', () => {
    expect(() => divideDecimal('1', '0')).toThrow('Division by zero');
    expect(() => divideDecimal('-1', '2')).toThrow('Not a plain decimal');
    expect(() => divideDecimal('1e3', '2')).toThrow('Not a plain decimal');
  });
});

describe('normalizeDecimal', () => {
  it('gives the shortest plain form', () => {
    expect(normalizeDecimal('1.2300')).toBe('1.23');
    expect(normalizeDecimal('007')).toBe('7');
    expect(normalizeDecimal('0.000')).toBe('0');
  });
});

describe('decimalFromNumber', () => {
  it('prints a rate with the digits it was published with', () => {
    expect(decimalFromNumber(1.165)).toBe('1.165');
    expect(decimalFromNumber(26145)).toBe('26145');
    expect(decimalFromNumber(1.0)).toBe('1');
  });

  it('expands exponent notation', () => {
    expect(decimalFromNumber(1e-7)).toBe('0.0000001');
    expect(decimalFromNumber(1.25e-7)).toBe('0.000000125');
    expect(decimalFromNumber(2e21)).toBe('2000000000000000000000');
  });

  it('refuses zero, negatives and non-finite numbers', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => decimalFromNumber(bad)).toThrow('positive finite');
    }
  });
});
