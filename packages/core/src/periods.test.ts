import type { HoldingIn, ValueIn } from '@netnet/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, bucketStart } from './dates';
import { periods } from './periods';
import { latestValues, position } from './position';
import { PERIOD_HOLDINGS, PERIOD_VALUES, holding, liability, value } from './testing/fixtures';

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

/** A period's % change against the previous end value, as the engine states it. */
const pct = (change: number, previous: number): number => (change / Math.abs(previous)) * 100;

describe('periods', () => {
  it('lists each month with its end value, change and ranked drivers, oldest first', () => {
    expect(periods(values, holdings, 'monthly', TODAY)).toStrictEqual([
      {
        start: '2026-01-01',
        end: '2026-01-31',
        endValue: 500,
        change: null,
        changePct: null,
        carried: false,
        drivers: [],
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

  it('gives the first period of each view its end value, but no change, % or drivers', () => {
    for (const view of ['monthly', 'quarterly', 'yearly'] as const) {
      const first = periods(PERIOD_VALUES, PERIOD_HOLDINGS, view, TODAY)[0];
      expect(first).toMatchObject({ change: null, changePct: null, drivers: [] });
      expect(first?.endValue).toBe(view === 'monthly' ? 5_000_37 : -2_999_63);
    }
  });

  it('keeps every later month’s figures to the cent', () => {
    const months = periods(PERIOD_VALUES, PERIOD_HOLDINGS, 'monthly', TODAY);
    expect(
      months.map((p) => [p.start, p.end, p.endValue, p.change, p.changePct, p.carried]),
    ).toStrictEqual([
      ['2024-11-01', '2024-11-30', 5_000_37, null, null, false],
      ['2024-12-01', '2024-12-31', -2_999_63, -8_000_00, pct(-8_000_00, 5_000_37), true],
      ['2025-01-01', '2025-01-31', -2_999_63, 0, 0, true],
      ['2025-02-01', '2025-02-28', -1_879_45, 1_120_18, pct(1_120_18, -2_999_63), true],
      ['2025-03-01', '2025-03-31', -1_879_45, 0, 0, true],
      ['2025-04-01', '2025-04-30', -1_879_45, 0, 0, true],
      ['2025-05-01', '2025-05-31', 1_120_56, 3_000_01, pct(3_000_01, -1_879_45), true],
      ['2025-06-01', '2025-06-30', 1_120_56, 0, 0, true],
      ['2025-07-01', '2025-07-31', 1_120_56, 0, 0, true],
      ['2025-08-01', '2025-08-31', 1_870_56, 750_00, pct(750_00, 1_120_56), true],
      ['2025-09-01', '2025-09-30', 1_870_56, 0, 0, true],
      ['2025-10-01', '2025-10-31', 1_870_56, 0, 0, true],
      ['2025-11-01', '2025-11-30', 1_870_56, 0, 0, true],
      ['2025-12-01', '2025-12-31', 2_230_20, 359_64, pct(359_64, 1_870_56), true],
      ['2026-01-01', '2026-01-31', 2_540_66, 310_46, pct(310_46, 2_230_20), true],
      ['2026-02-01', '2026-02-28', 2_540_66, 0, 0, true],
      ['2026-03-01', '2026-03-31', 3_075_47, 534_81, pct(534_81, 2_540_66), true],
      ['2026-04-01', '2026-04-15', 3_075_47, 0, 0, true],
    ]);
    expect(
      months.filter((p) => p.drivers.length > 0).map((p) => [p.start, p.drivers]),
    ).toStrictEqual([
      ['2024-12-01', [{ holdingId: 'loan', name: 'Car loan', contribution: -8_000_00 }]],
      ['2025-02-01', [{ holdingId: 'cash', name: 'Everyday pot', contribution: 1_120_18 }]],
      // A holding first valued in a later period counts toward that period's change.
      ['2025-05-01', [{ holdingId: 'fund', name: 'World fund', contribution: 3_000_01 }]],
      ['2025-08-01', [{ holdingId: 'loan', name: 'Car loan', contribution: 750_00 }]],
      ['2025-12-01', [{ holdingId: 'cash', name: 'Everyday pot', contribution: 359_64 }]],
      ['2026-01-01', [{ holdingId: 'fund', name: 'World fund', contribution: 310_46 }]],
      ['2026-03-01', [{ holdingId: 'cash', name: 'Everyday pot', contribution: 534_81 }]],
    ]);
  });

  it('keeps every later quarter’s and year’s figures to the cent', () => {
    const cash = (contribution: number) => ({
      holdingId: 'cash',
      name: 'Everyday pot',
      contribution,
    });
    const fund = (contribution: number) => ({
      holdingId: 'fund',
      name: 'World fund',
      contribution,
    });
    const loan = (contribution: number) => ({ holdingId: 'loan', name: 'Car loan', contribution });
    expect(periods(PERIOD_VALUES, PERIOD_HOLDINGS, 'quarterly', TODAY)).toStrictEqual([
      {
        start: '2024-10-01',
        end: '2024-12-31',
        endValue: -2_999_63,
        change: null,
        changePct: null,
        carried: false,
        drivers: [],
      },
      {
        start: '2025-01-01',
        end: '2025-03-31',
        endValue: -1_879_45,
        change: 1_120_18,
        changePct: pct(1_120_18, -2_999_63),
        carried: true,
        drivers: [cash(1_120_18)],
      },
      {
        start: '2025-04-01',
        end: '2025-06-30',
        endValue: 1_120_56,
        change: 3_000_01,
        changePct: pct(3_000_01, -1_879_45),
        carried: true,
        drivers: [fund(3_000_01)],
      },
      {
        start: '2025-07-01',
        end: '2025-09-30',
        endValue: 1_870_56,
        change: 750_00,
        changePct: pct(750_00, 1_120_56),
        carried: true,
        drivers: [loan(750_00)],
      },
      {
        start: '2025-10-01',
        end: '2025-12-31',
        endValue: 2_230_20,
        change: 359_64,
        changePct: pct(359_64, 1_870_56),
        carried: true,
        drivers: [cash(359_64)],
      },
      {
        start: '2026-01-01',
        end: '2026-03-31',
        endValue: 3_075_47,
        change: 845_27,
        changePct: pct(845_27, 2_230_20),
        carried: true,
        drivers: [cash(534_81), fund(310_46)],
      },
      {
        start: '2026-04-01',
        end: '2026-04-15',
        endValue: 3_075_47,
        change: 0,
        changePct: 0,
        carried: true,
        drivers: [],
      },
    ]);
    expect(periods(PERIOD_VALUES, PERIOD_HOLDINGS, 'yearly', TODAY)).toStrictEqual([
      {
        start: '2024-01-01',
        end: '2024-12-31',
        endValue: -2_999_63,
        change: null,
        changePct: null,
        carried: false,
        drivers: [],
      },
      {
        start: '2025-01-01',
        end: '2025-12-31',
        endValue: 2_230_20,
        change: 5_229_83,
        changePct: pct(5_229_83, -2_999_63),
        carried: false,
        drivers: [fund(3_000_01), cash(1_479_82), loan(750_00)],
      },
      {
        start: '2026-01-01',
        end: '2026-04-15',
        endValue: 3_075_47,
        change: 845_27,
        changePct: pct(845_27, 2_230_20),
        carried: true,
        drivers: [cash(534_81), fund(310_46)],
      },
    ]);
  });

  it('starts from the earliest period left after the filter', () => {
    const funds = periods(PERIOD_VALUES, PERIOD_HOLDINGS, 'monthly', TODAY, {
      typeIds: ['typ_listed'],
    });
    expect(funds[0]).toStrictEqual({
      start: '2025-05-01',
      end: '2025-05-31',
      endValue: 3_000_01,
      change: null,
      changePct: null,
      carried: false,
      drivers: [],
    });
    expect(funds.find((p) => p.start === '2026-01-01')).toMatchObject({
      endValue: 3_310_47,
      change: 310_46,
      changePct: pct(310_46, 3_000_01),
    });
  });

  it('starts from the earliest period left after the Don’t Show list', () => {
    // Without the savings, the account opens owing: its −€8,000 is where it started, not a loss.
    const owing = periods(PERIOD_VALUES, PERIOD_HOLDINGS, 'monthly', TODAY, undefined, {
      holdingIds: ['cash'],
    });
    expect(owing[0]).toStrictEqual({
      start: '2024-12-01',
      end: '2024-12-31',
      endValue: -8_000_00,
      change: null,
      changePct: null,
      carried: false,
      drivers: [],
    });
    expect(owing.find((p) => p.start === '2025-05-01')).toMatchObject({
      endValue: -4_999_99,
      change: 3_000_01,
      changePct: pct(3_000_01, -8_000_00),
      drivers: [{ holdingId: 'fund', name: 'World fund', contribution: 3_000_01 }],
    });
  });

  it('buckets by quarter and year, the current one still open', () => {
    expect(periods(values, holdings, 'quarterly', TODAY)).toStrictEqual([
      {
        start: '2026-01-01',
        end: '2026-03-31',
        endValue: 3100,
        change: null,
        changePct: null,
        carried: false,
        drivers: [],
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
        change: null,
        changePct: null,
        carried: false,
        drivers: [],
      },
    ]);
  });

  it('recomputes every figure over the filtered set', () => {
    const assets = periods(values, holdings, 'monthly', TODAY, { show: 'assets' });
    expect(assets.map((p) => p.endValue)).toEqual([1000, 3000, 3500, 3500]);
    expect(assets[0]).toMatchObject({ change: null, changePct: null, drivers: [] });
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
        change: null,
        changePct: null,
        carried: false,
        drivers: [],
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
    const tied = [
      holding('c', { name: 'Gamma' }),
      holding('b', { name: 'Beta' }),
      holding('a', { name: 'Alpha' }),
    ];
    const tiedValues = [
      value('c', '2026-02-10', 100),
      value('b', '2026-03-10', 100),
      value('a', '2026-03-11', 100),
    ];
    expect(periods(tiedValues, tied, 'monthly', TODAY)[1]?.drivers).toStrictEqual([
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
        change: null,
        changePct: null,
        carried: false,
        drivers: [],
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
        let previous: number | null = null;
        for (const period of periods(values, holdings, view, to)) {
          expect(period.endValue).toBe(
            position(holdings, latestValues(values, period.end)).netWorth,
          );
          if (previous === null) {
            // The first period has nothing earlier to compare with.
            expect(period).toMatchObject({ change: null, changePct: null, drivers: [] });
          } else {
            const change = period.endValue - previous;
            expect(period.change).toBe(change);
            expect(period.changePct).toBe(previous === 0 ? null : pct(change, previous));
          }
          const sum = period.drivers.reduce((a, d) => a + d.contribution, 0);
          expect(sum).toBe(period.change ?? 0);
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
