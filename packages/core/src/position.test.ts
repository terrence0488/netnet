import type { HoldingIn, ValueIn } from '@netnet/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { latestValues, position } from './position';
import { series } from './series';
import { holding, liability, value } from './testing/fixtures';

describe('latestValues', () => {
  const values = [
    value('a', '2026-03-01', 300, { id: 'val_3' }),
    value('a', '2026-01-01', 100, { id: 'val_1' }),
    value('a', '2026-02-01', 200, { id: 'val_2' }),
    value('b', '2026-02-15', 50, { id: 'val_4' }),
    value('b', '2026-02-15', 60, { id: 'val_5' }),
  ];

  it('keeps the latest value by date, whatever the order', () => {
    expect(latestValues(values, '2026-12-31').get('a')?.baseMinor).toBe(300);
    expect(latestValues([...values].reverse(), '2026-12-31').get('a')?.baseMinor).toBe(300);
  });

  it('ignores values dated after asOf', () => {
    const latest = latestValues(values, '2026-02-14');
    expect(latest.get('a')?.baseMinor).toBe(200);
    expect(latest.has('b')).toBe(false);
  });

  it('breaks a tie on one date by id, the later write', () => {
    expect(latestValues(values, '2026-12-31').get('b')?.id).toBe('val_5');
    expect(latestValues([...values].reverse(), '2026-12-31').get('b')?.id).toBe('val_5');
  });
});

describe('position', () => {
  const holdings = [
    holding('cash', { access: 'accessible' }),
    holding('fund', { access: 'accessible', typeId: 'typ_listed', universal: 'listed' }),
    holding('car', { access: 'illiquid', typeId: 'typ_vehicle', universal: 'vehicle' }),
    holding('pension', { access: 'locked', typeId: 'typ_retirement', universal: 'retirement' }),
    holding('flat', { access: 'undecided', typeId: 'typ_property', universal: 'property' }),
    holding('old', { access: 'accessible', archived: true }),
    holding('empty', { access: 'accessible' }),
    liability('loan'),
    liability('card', { typeId: 'typ_card', universal: 'card' }),
  ];
  const values = [
    value('cash', '2026-09-01', 1_200_000),
    value('fund', '2026-08-31', 3_400_000),
    value('car', '2025-06-30', 1_500_000),
    value('pension', '2026-07-01', 9_000_000),
    value('flat', '2026-01-10', 50_000_000),
    value('old', '2026-09-01', 7_777_700),
    value('loan', '2026-09-01', 30_000_000),
    value('card', '2026-09-20', -25_000),
  ];
  const latest = latestValues(values, '2026-09-27');

  it('splits assets by accessibility and nets off what is owed', () => {
    expect(position(holdings, latest)).toStrictEqual({
      netWorth: 65_100_000 - 29_975_000,
      assets: 65_100_000,
      owed: 29_975_000,
      couldUse: 4_600_000,
      sellFirst: 1_500_000,
      locked: 9_000_000,
      undecided: 50_000_000,
    });
  });

  it('applies a filter', () => {
    expect(position(holdings, latest, { show: 'assets', hideHoldingIds: ['flat'] })).toMatchObject({
      netWorth: 15_100_000,
      owed: 0,
      undecided: 0,
    });
  });

  it('is all zeros with nothing to count', () => {
    expect(position([], new Map())).toStrictEqual({
      netWorth: 0,
      assets: 0,
      owed: 0,
      couldUse: 0,
      sellFirst: 0,
      locked: 0,
      undecided: 0,
    });
  });
});

/* ---------------------------------------------------------------- properties */

const START = '2025-01-01';

/** A random book: up to 8 holdings, some archived, and up to 40 values over about a year. */
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
      { maxLength: 8 },
    ),
    values: fc.array(
      fc.record({
        holding: fc.nat(7),
        day: fc.nat(400),
        base: fc.integer({ min: -(10 ** 9), max: 10 ** 9 }),
      }),
      { maxLength: 40 },
    ),
    asOf: fc.nat(450),
  })
  .map(({ holdings, values, asOf }) => ({
    holdings: holdings.map((h, i): HoldingIn =>
      h.kind === 'asset'
        ? holding(`h${i}`, { ...h, kind: 'asset' })
        : liability(`h${i}`, { typeId: h.typeId, currency: h.currency, archived: h.archived }),
    ),
    values: values.map((v, i): ValueIn =>
      value(`h${v.holding}`, addDays(START, v.day), v.base, { id: `val_${i}` }),
    ),
    asOf: addDays(START, asOf),
  }));

const sumLatest = (
  holdings: readonly HoldingIn[],
  latest: Map<string, ValueIn>,
  keep: (h: HoldingIn) => boolean,
) =>
  holdings
    .filter((h) => !h.archived && keep(h))
    .reduce((sum, h) => sum + (latest.get(h.id)?.baseMinor ?? 0), 0);

describe('position properties', () => {
  it('net worth is assets minus owed, and assets are the four buckets', () => {
    fc.assert(
      fc.property(book, ({ holdings, values, asOf }) => {
        const p = position(holdings, latestValues(values, asOf));
        expect(p.assets).toBe(p.couldUse + p.sellFirst + p.locked + p.undecided);
        expect(p.netWorth).toBe(p.assets - p.owed);
      }),
    );
  });

  it('could use counts accessible assets only; undecided counts toward net worth alone', () => {
    fc.assert(
      fc.property(book, ({ holdings, values, asOf }) => {
        const latest = latestValues(values, asOf);
        const p = position(holdings, latest);
        const isAsset = (h: HoldingIn) => h.kind === 'asset';
        expect(p.couldUse).toBe(
          sumLatest(holdings, latest, (h) => isAsset(h) && h.access === 'accessible'),
        );
        expect(p.undecided).toBe(
          sumLatest(holdings, latest, (h) => isAsset(h) && h.access === 'undecided'),
        );
        const decided = holdings.filter((h) => h.access !== 'undecided');
        const without = position(decided, latest);
        expect(without.couldUse).toBe(p.couldUse);
        expect(p.netWorth - without.netWorth).toBe(p.undecided);
      }),
    );
  });

  it('archived holdings change nothing', () => {
    fc.assert(
      fc.property(book, ({ holdings, values, asOf }) => {
        const latest = latestValues(values, asOf);
        expect(position(holdings, latest)).toStrictEqual(
          position(
            holdings.filter((h) => !h.archived),
            latest,
          ),
        );
      }),
    );
  });

  it("agrees with the series' last point, total and access groups", () => {
    fc.assert(
      fc.property(book, ({ holdings, values, asOf }) => {
        const p = position(holdings, latestValues(values, asOf));
        const last = series(values, holdings, { from: START, to: asOf }, 'month', {}, 'access').at(
          -1,
        );
        expect(last?.total).toBe(p.netWorth);
        const groups = last?.groups ?? {};
        expect(groups.could_use ?? 0).toBe(p.couldUse);
        expect(groups.sell_first ?? 0).toBe(p.sellFirst);
        expect(groups.locked ?? 0).toBe(p.locked);
        expect(groups.undecided ?? 0).toBe(p.undecided);
        expect(0 - (groups.owed ?? 0)).toBe(p.owed);
      }),
    );
  });
});
