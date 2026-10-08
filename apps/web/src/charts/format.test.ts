import { describe, expect, it } from 'vitest';
import { formatAxisDate, formatCompactMoney } from './format';

describe('formatCompactMoney', () => {
  it('compacts thousands and millions, and leaves small amounts whole', () => {
    expect(formatCompactMoney(79799200, 'USD', 'en-US')).toBe('$798K');
    expect(formatCompactMoney(184025000, 'USD', 'en-US')).toBe('$1.84M');
    expect(formatCompactMoney(99900, 'USD', 'en-US')).toBe('$999');
    expect(formatCompactMoney(0, 'USD', 'en-US')).toBe('$0');
  });

  it('uses the true minus, never on a zero', () => {
    expect(formatCompactMoney(-120050, 'USD', 'en-US')).toBe('−$1K');
    expect(formatCompactMoney(-184025000, 'USD', 'en-US')).toBe('−$1.84M');
    expect(formatCompactMoney(0, 'USD', 'en-US').startsWith('−')).toBe(false);
  });

  it('reads a zero-exponent currency and an unknown code without breaking', () => {
    expect(formatCompactMoney(125000, 'JPY', 'en-US')).toBe('¥125K');
    expect(formatCompactMoney(1255000, 'XXQ', 'en-US')).toContain('13K');
  });

  it('rejects what is not an amount in minor units', () => {
    expect(() => formatCompactMoney(1.5, 'USD')).toThrow(RangeError);
    expect(() => formatCompactMoney(Number.NaN, 'USD')).toThrow(RangeError);
  });
});

describe('formatAxisDate', () => {
  it('labels a point with its month and year', () => {
    expect(formatAxisDate('2026-05-17', 'en-US')).toBe('May 2026');
  });
});
