import type { HoldingIn, ValueIn } from '@netnet/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, bucketStart } from './dates';
import { latestValues, position } from './position';
import { series } from './series';
import { holding, liability, value } from './testing/fixtures';

const holdings = [
  holding('cash', { typeId: 'typ_cash' }),
  holding('fund', { typeId: 'typ_listed', universal: 'listed', currency: 'USD' }),
  holding('flat', { typeId: 'typ_property', access: 'undecided', archived: true }),
  liability('loan'),
];
const values = [
  value('cash', '2026-01-10', 1000),
  value('cash', '2026-03-05', 1500),
  value('loan', '2026-01-31', 500),
  value('flat', '2026-01-20', 90_000),
  // Entered last, dated in February: value dates decide, never entry order.
  value('fund', '2026-02-20', 2000),
];

describe('series', () => {
  it('has a point at the end of each month, the last at the range end', () => {
    expect(series(values, holdings, { to: '2026-04-15' }, 'month')).toStrictEqual([
      { date: '2026-01-31', total: 500, carried: false },
      { date: '2026-02-28', total: 2500, carried: true },
      { date: '2026-03-31', total: 3000, carried: true },
      { date: '2026-04-15', total: 3000, carried: true },
    ]);
  });

  it('buckets by quarter, year and day', () => {
    expect(series(values, holdings, { to: '2026-04-15' }, 'quarter')).toStrictEqual([
      { date: '2026-03-31', total: 3000, carried: false },
      { date: '2026-04-15', total: 3000, carried: true },
    ]);
    expect(series(values, holdings, { to: '2026-04-15' }, 'year')).toStrictEqual([
      { date: '2026-04-15', total: 3000, carried: false },
    ]);
    expect(series(values, holdings, { from: '2026-01-30', to: '2026-02-01' }, 'day')).toStrictEqual(
      [
        { date: '2026-01-30', total: 1000, carried: true },
        { date: '2026-01-31', total: 500, carried: true },
        { date: '2026-02-01', total: 500, carried: true },
      ],
    );
  });

  it('starts at the earliest value unless told otherwise, at zero before any value', () => {
    expect(
      series(values, holdings, { from: '2025-12-15', to: '2026-01-31' }, 'month'),
    ).toStrictEqual([
      { date: '2025-12-31', total: 0, carried: false },
      { date: '2026-01-31', total: 500, carried: false },
    ]);
  });

  it('splits each point into groups that sum to its total', () => {
    const points = (groupBy: 'type' | 'access' | 'currency') =>
      series(values, holdings, { to: '2026-02-28' }, 'month', {}, groupBy).map((p) => p.groups);
    expect(points('type')).toStrictEqual([
      { typ_cash: 1000, typ_loan: -500 },
      { typ_cash: 1000, typ_listed: 2000, typ_loan: -500 },
    ]);
    expect(points('access')).toStrictEqual([
      { could_use: 1000, owed: -500 },
      { could_use: 3000, owed: -500 },
    ]);
    expect(points('currency')).toStrictEqual([{ EUR: 500 }, { EUR: 500, USD: 2000 }]);
    expect(
      series(values, holdings, { to: '2026-02-28' }, 'month', {}, 'none')[0],
    ).not.toHaveProperty('groups');
  });

  it('recomputes when a value is back-dated, and ignores the order values arrive in', () => {
    const backDated = [...values, value('fund', '2026-01-15', 1800)];
    const january = { to: '2026-01-31' };
    expect(series(backDated, holdings, january, 'month')).toStrictEqual([
      { date: '2026-01-31', total: 2300, carried: false },
    ]);
    expect(series([...backDated].reverse(), holdings, january, 'month')).toStrictEqual(
      series(backDated, holdings, january, 'month'),
    );
  });

  it('leaves out archived holdings and what the filter hides', () => {
    expect(
      series(values, holdings, { to: '2026-01-31' }, 'month', { show: 'liabilities' }),
    ).toStrictEqual([{ date: '2026-01-31', total: -500, carried: false }]);
  });

  it('has no points without values, or with the range reversed', () => {
    expect(series([], holdings, { to: '2026-04-15' }, 'month')).toStrictEqual([]);
    expect(series(values, holdings, { from: '2026-05-01', to: '2026-04-15' }, 'day')).toStrictEqual(
      [],
    );
  });
});

/* ---------------------------------------------------------------- properties */

const START = '2025-01-01';

const book = fc
  .record({
    holdings: fc.array(
      fc.record({
        kind: fc.constantFrom('asset', 'liability'),
        access: fc.constantFrom('accessible', 'illiquid', 'locked', 'undecided'),
        archived: fc.boolean(),
        typeId: fc.constantFrom('typ_a', 'typ_b', 'typ_c'),
        currency: fc.constantFrom('EUR', 'USD', 'JPY'),
      }),
      { maxLength: 6 },
    ),
    values: fc.array(
      fc.record({
        holding: fc.nat(5),
        day: fc.nat(500),
        base: fc.integer({ min: -(10 ** 9), max: 10 ** 9 }),
      }),
      { maxLength: 30 },
    ),
    to: fc.nat(550),
    interval: fc.constantFrom('day', 'month', 'quarter', 'year'),
    groupBy: fc.constantFrom('type', 'access', 'currency'),
  })
  .map(({ holdings, values, to, interval, groupBy }) => ({
    holdings: holdings.map((h, i): HoldingIn =>
      h.kind === 'asset'
        ? holding(`h${i}`, { ...h, kind: 'asset' })
        : liability(`h${i}`, { typeId: h.typeId, currency: h.currency, archived: h.archived }),
    ),
    values: values.map((v, i): ValueIn =>
      value(`h${v.holding}`, addDays(START, v.day), v.base, { id: `val_${i}` }),
    ),
    to: addDays(START, to),
    interval,
    groupBy,
  }));

describe('series properties', () => {
  it("each point's total is the net worth on its date, and its groups sum to it", () => {
    fc.assert(
      fc.property(book, ({ holdings, values, to, interval, groupBy }) => {
        for (const point of series(values, holdings, { to }, interval, {}, groupBy)) {
          expect(point.total).toBe(position(holdings, latestValues(values, point.date)).netWorth);
          const sum = Object.values(point.groups ?? {}).reduce((a, b) => a + b, 0);
          expect(sum).toBe(point.total);
        }
      }),
    );
  });

  it('a point is carried exactly when a holding counted in it has no value in its bucket', () => {
    fc.assert(
      fc.property(book, ({ holdings, values, to, interval }) => {
        for (const point of series(values, holdings, { to }, interval)) {
          const start = bucketStart(point.date, interval);
          const counted = holdings.filter(
            (h) => !h.archived && values.some((v) => v.holdingId === h.id && v.date <= point.date),
          );
          const observed = (h: HoldingIn) =>
            values.some((v) => v.holdingId === h.id && v.date >= start && v.date <= point.date);
          expect(point.carried).toBe(counted.some((h) => !observed(h)));
        }
      }),
    );
  });
});
