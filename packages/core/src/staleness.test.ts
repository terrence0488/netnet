import { describe, expect, it } from 'vitest';
import { packChain } from './pack-chain';
import { staleness } from './staleness';
import { COUNTRY, GENERIC } from './testing/fixtures';

const TODAY = '2026-09-27';
const generic = packChain([GENERIC, COUNTRY], null);
const country = packChain([GENERIC, COUNTRY], 'qz');

describe('staleness', () => {
  it("is stale once the value is older than the chain's cadence for the type", () => {
    const cash = { cadenceDays: null, universal: 'cash' } as const;
    expect(staleness(cash, { date: '2026-08-28' }, TODAY, generic)).toStrictEqual({
      stale: false,
      days: 30,
    });
    expect(staleness(cash, { date: '2026-08-27' }, TODAY, generic)).toStrictEqual({
      stale: true,
      days: 31,
    });
    // The country's cadence for cash is 14 days.
    expect(staleness(cash, { date: '2026-09-12' }, TODAY, country)).toStrictEqual({
      stale: true,
      days: 15,
    });
    // Property follows generic's 365 days.
    expect(
      staleness(
        { cadenceDays: null, universal: 'property' },
        { date: '2025-10-01' },
        TODAY,
        country,
      ),
    ).toStrictEqual({ stale: false, days: 361 });
  });

  it("uses the holding's own cadence when it has one", () => {
    expect(
      staleness({ cadenceDays: 7, universal: 'property' }, { date: '2026-09-19' }, TODAY, generic),
    ).toStrictEqual({ stale: true, days: 8 });
  });

  it('counts a value dated after today as fresh', () => {
    expect(
      staleness({ cadenceDays: null, universal: 'cash' }, { date: '2026-09-28' }, TODAY, generic),
    ).toStrictEqual({ stale: false, days: 0 });
  });

  it('needs a chain that ends with generic', () => {
    expect(() =>
      staleness({ cadenceDays: null, universal: 'loan' }, { date: TODAY }, TODAY, [COUNTRY]),
    ).toThrow('The pack chain has no cadenceDays for "loan"');
  });
});
