import type { HoldingIn, ValueIn } from '@netnet/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, bucketStart } from './dates';
import { periods } from './periods';
import { latestValues, position } from './position';
import { holding, liability, value } from './testing/fixtures';

const holdings = [
  holding('cash', { name: 'Everyday pot', typeId: 'typ_cash' }),
  holding('fund', {
    name: 'World fund',
    typeId: 'typ_listed',
    universal: 'listed',
    currency: 'USD',
    tagIds: ['tag_hot'],
  }),
  holding('flat', { name: 'Flat', typeId: 'typ_property', access: 'undecided', archived: true }),
  liability('loan', { name: 'Home loan' }),
];
const values = [
  value('cash', '2026-01-10', 1000),
  value('cash', '2026-03-05', 1500),
  value('loan', '2026-01-31', 500),
  value('loan', '2026-03-15', 400),
  value('flat', '2026-01-20', 90_000),
  // Entered last, dated in February: value dates decide, never entry order. The stored
  // conversion (2000) is what counts, never the USD amount beside it.
  value('fund', '2026-02-20', 2000, { amountMinor: 1600, currency: 'USD' }),
];

const TODAY = '2026-04-15';

describe('periods', () => {
  it('lists each month with its end value, change and ranked drivers, oldest first', () => {
    expect(periods(values, holdings, 'monthly', TODAY)).toStrictEqual([
      {
        start: '2026-01-01',
        end: '2026-01-31',
        endValue: 500,
        change: 500,
        changePct: null,
        carried: false,
        drivers: [
          { holdingId: 'cash', name: 'Everyday pot', contribution: 1000 },
          { holdingId: 'loan', name: 'Home loan', contribution: -500 },
        ],
      },
      {
        start: '2026-02-01',
        end: '2026-02-28',
        endValue: 2500,
        change: 2000,
        changePct: 400,
        carried: true,
        drivers: [{ holdingId: 'fund', name: 'World fund', contribution: 2000 }],
      },
      {
        start: '2026-03-01',
        end: '2026-03-31',
        endValue: 3100,
        change: 600,
        changePct: 24,
        carried: true,
        drivers: [
          { holdingId: 'cash', name: 'Everyday pot', contribution: 500 },
          { holdingId: 'loan', name: 'Home loan', contribution: 100 },
        ],
      },
      {
        start: '2026-04-01',
        end: '2026-04-15',
        endValue: 3100,
        change: 0,
        changePct: 0,
        carried: true,
        drivers: [],
      },
    ]);
  });

  it('buckets by quarter and year, the current one still open', () => {
    expect(periods(values, holdings, 'quarterly', TODAY)).toStrictEqual([
      {
        start: '2026-01-01',
        end: '2026-03-31',
        endValue: 3100,
        change: 3100,
        changePct: null,
        carried: false,
        drivers: [
          { holdingId: 'fund', name: 'World fund', contribution: 2000 },
          { holdingId: 'cash', name: 'Everyday pot', contribution: 1500 },
          { holdingId: 'loan', name: 'Home loan', contribution: -400 },
        ],
      },
      {
        start: '2026-04-01',
        end: '2026-04-15',
        endValue: 3100,
        change: 0,
        changePct: 0,
        carried: true,
        drivers: [],
      },
    ]);
    expect(periods(values, holdings, 'yearly', TODAY)).toStrictEqual([
      {
        start: '2026-01-01',
        end: '2026-04-15',
        endValue: 3100,
        change: 3100,
        changePct: null,
        carried: false,
        drivers: [
          { holdingId: 'fund', name: 'World fund', contribution: 2000 },
          { holdingId: 'cash', name: 'Everyday pot', contribution: 1500 },
          { holdingId: 'loan', name: 'Home loan', contribution: -400 },
        ],
      },
    ]);
  });

  it('recomputes every figure over the filtered set', () => {
    const assets = periods(values, holdings, 'monthly', TODAY, { show: 'assets' });
    expect(assets.map((p) => p.endValue)).toEqual([1000, 3000, 3500, 3500]);
    expect(assets[0]).toMatchObject({
      change: 1000,
      changePct: null,
      drivers: [{ holdingId: 'cash', name: 'Everyday pot', contribution: 1000 }],
    });
    expect(assets[2]).toMatchObject({ change: 500, changePct: (500 / 3000) * 100 });
  });

  it('drops an excluded holding, type or tag from these figures only', () => {
    const noLoan = periods(values, holdings, 'monthly', TODAY, undefined, {
      holdingIds: ['loan'],
    });
    expect(noLoan.map((p) => p.endValue)).toEqual([1000, 3000, 3500, 3500]);
    const noFund = periods(values, holdings, 'monthly', TODAY, undefined, {
      typeIds: ['typ_listed'],
    });
    expect(noFund.map((p) => p.endValue)).toEqual([500, 500, 1100, 1100]);
    expect(noFund[2]?.drivers).toStrictEqual([
      { holdingId: 'cash', name: 'Everyday pot', contribution: 500 },
      { holdingId: 'loan', name: 'Home loan', contribution: 100 },
    ]);
    expect(
      periods(values, holdings, 'monthly', TODAY, undefined, { tagIds: ['tag_hot'] }).map(
        (p) => p.endValue,
      ),
    ).toEqual([500, 500, 1100, 1100]);
    // The filter and the exclusions combine; Home's own total never reads either.
    expect(
      periods(
        values,
        holdings,
        'monthly',
        TODAY,
        { show: 'assets' },
        { typeIds: ['typ_listed'] },
      ).map((p) => p.endValue),
    ).toEqual([1000, 1000, 1500, 1500]);
    expect(position(holdings, latestValues(values, TODAY)).netWorth).toBe(3100);
  });

  it('recomputes the affected periods when a value is back-dated, whatever order values arrive in', () => {
    const backDated = [
      ...values,
      value('fund', '2026-01-15', 1800, { amountMinor: 1500, currency: 'USD' }),
    ];
    expect(periods(backDated, holdings, 'monthly', TODAY)).toStrictEqual([
      {
        start: '2026-01-01',
        end: '2026-01-31',
        endValue: 2300,
        change: 2300,
        changePct: null,
        carried: false,
        drivers: [
          { holdingId: 'fund', name: 'World fund', contribution: 1800 },
          { holdingId: 'cash', name: 'Everyday pot', contribution: 1000 },
          { holdingId: 'loan', name: 'Home loan', contribution: -500 },
        ],
      },
      {
        start: '2026-02-01',
        end: '2026-02-28',
        endValue: 2500,
        change: 200,
        changePct: (200 / 2300) * 100,
        carried: true,
        drivers: [{ holdingId: 'fund', name: 'World fund', contribution: 200 }],
      },
      {
        start: '2026-03-01',
        end: '2026-03-31',
        endValue: 3100,
        change: 600,
        changePct: 24,
        carried: true,
        drivers: [
          { holdingId: 'cash', name: 'Everyday pot', contribution: 500 },
          { holdingId: 'loan', name: 'Home loan', contribution: 100 },
        ],
      },
      {
        start: '2026-04-01',
        end: '2026-04-15',
        endValue: 3100,
        change: 0,
        changePct: 0,
        carried: true,
        drivers: [],
      },
    ]);
    expect(periods([...backDated].reverse(), holdings, 'monthly', TODAY)).toStrictEqual(
      periods(backDated, holdings, 'monthly', TODAY),
    );
  });

  it('ranks tied drivers by name', () => {
    const tied = [holding('b', { name: 'Beta' }), holding('a', { name: 'Alpha' })];
    const tiedValues = [value('b', '2026-03-10', 100), value('a', '2026-03-11', 100)];
    expect(periods(tiedValues, tied, 'monthly', TODAY)[0]?.drivers).toStrictEqual([
      { holdingId: 'a', name: 'Alpha', contribution: 100 },
      { holdingId: 'b', name: 'Beta', contribution: 100 },
    ]);
  });

  it('ends the current period at today, and never counts a value dated after it', () => {
    const dated = [value('cash', '2026-01-10', 1000), value('cash', '2026-01-20', 1500)];
    expect(periods(dated, holdings, 'monthly', '2026-01-15')).toStrictEqual([
      {
        start: '2026-01-01',
        end: '2026-01-15',
        endValue: 1000,
        change: 1000,
        changePct: null,
        carried: false,
        drivers: [{ holdingId: 'cash', name: 'Everyday pot', contribution: 1000 }],
      },
    ]);
  });

  it('has no periods without values, before the first value, or with nothing left to count', () => {
    expect(periods([], holdings, 'monthly', TODAY)).toStrictEqual([]);
    expect(periods(values, holdings, 'monthly', '2025-12-31')).toStrictEqual([]);
    expect(
      periods(values, holdings, 'monthly', TODAY, undefined, {
        holdingIds: ['cash', 'fund', 'loan'],
      }),
    ).toStrictEqual([]);
    expect(periods(values, [holdings[2]!], 'monthly', TODAY)).toStrictEqual([]);
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
    view: fc.constantFrom('monthly', 'quarterly', 'yearly'),
  })
  .map(({ holdings, values, to, view }) => ({
    holdings: holdings.map((h, i): HoldingIn =>
      h.kind === 'asset'
        ? holding(`h${i}`, { ...h, kind: 'asset' })
        : liability(`h${i}`, { typeId: h.typeId, currency: h.currency, archived: h.archived }),
    ),
    values: values.map((v, i): ValueIn =>
      value(`h${v.holding}`, addDays(START, v.day), v.base, { id: `val_${i}` }),
    ),
    to: addDays(START, to),
    view,
  }));

const INTERVAL = { monthly: 'month', quarterly: 'quarter', yearly: 'year' } as const;

describe('periods properties', () => {
  it('each period ends at the net worth on its end date, and its drivers sum to its change', () => {
    fc.assert(
      fc.property(book, ({ holdings, values, to, view }) => {
        let previous = 0;
        for (const period of periods(values, holdings, view, to)) {
          expect(period.endValue).toBe(
            position(holdings, latestValues(values, period.end)).netWorth,
          );
          expect(period.change).toBe(period.endValue - previous);
          const sum = period.drivers.reduce((a, d) => a + d.contribution, 0);
          expect(sum).toBe(period.change);
          const contributions = period.drivers.map((d) => d.contribution);
          expect(contributions).toStrictEqual([...contributions].sort((a, b) => b - a));
          expect(contributions.every((c) => c !== 0)).toBe(true);
          previous = period.endValue;
        }
      }),
    );
  });

  it('a period is carried exactly when a holding counted in it has no value inside it', () => {
    fc.assert(
      fc.property(book, ({ holdings, values, to, view }) => {
        const interval = INTERVAL[view];
        for (const period of periods(values, holdings, view, to)) {
          const start = bucketStart(period.end, interval);
          expect(start).toBe(period.start);
          const counted = holdings.filter(
            (h) => !h.archived && values.some((v) => v.holdingId === h.id && v.date <= period.end),
          );
          const observed = (h: HoldingIn) =>
            values.some((v) => v.holdingId === h.id && v.date >= start && v.date <= period.end);
          expect(period.carried).toBe(counted.some((h) => !observed(h)));
        }
      }),
    );
  });
});
