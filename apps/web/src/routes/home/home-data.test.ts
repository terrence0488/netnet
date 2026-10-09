import type { Holding, Snapshot, UserType, ValueIn, ValueTuple } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { homeData, homeTrendFrom, sharedLockedUntil, visibleHoldings } from './home-data';

const TYPES: UserType[] = [
  {
    id: 'typ_cash',
    universal: 'cash',
    packTypeKey: null,
    customName: null,
    sort: 0,
    archived: false,
  },
  {
    id: 'typ_prop',
    universal: 'property',
    packTypeKey: null,
    customName: null,
    sort: 1,
    archived: false,
  },
  {
    id: 'typ_loan',
    universal: 'loan',
    packTypeKey: null,
    customName: null,
    sort: 2,
    archived: false,
  },
];

function holding(over: Partial<Holding> & { id: string }): Holding {
  return {
    name: 'Holding',
    kind: 'asset',
    typeId: 'typ_cash',
    currency: 'SGD',
    cadenceDays: null,
    archived: false,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    rowVersion: 1,
    access: 'accessible',
    accessReason: null,
    accessUntil: null,
    accessBasis: null,
    tagIds: [],
    ...over,
  };
}

const value = (date: string, amountMinor: number, baseMinor: number = amountMinor): ValueTuple => [
  date,
  amountMinor,
  'SGD',
  baseMinor,
  'web',
  null,
  `val_${date}`,
];

function snapshot(holdings: Holding[], values: Record<string, ValueTuple[]>): Snapshot {
  return {
    dataVersion: 3,
    baseCurrency: 'SGD',
    packRef: [{ key: 'generic', version: 1 }],
    prefs: {},
    types: TYPES,
    tags: [],
    holdings,
    values,
  };
}

describe('homeData', () => {
  it('adds one holding’s value up into the total (PRD J1)', () => {
    const data = homeData(
      snapshot([holding({ id: 'hld_1', name: 'Everyday savings' })], {
        hld_1: [value('2026-09-20', 125_000)],
      }),
      '2026-09-23',
    );
    expect(data.position.netWorth).toBe(125_000);
    expect(data.position.couldUse).toBe(125_000);
    expect(data.position.owed).toBe(0);
  });

  it('counts undecided toward net worth, never toward could use (PRD J2)', () => {
    const data = homeData(
      snapshot(
        [
          holding({ id: 'hld_1' }),
          holding({ id: 'hld_2', typeId: 'typ_prop', access: 'undecided' }),
          holding({ id: 'hld_3', kind: 'liability', typeId: 'typ_loan', access: null }),
        ],
        {
          hld_1: [value('2026-09-20', 100_000)],
          hld_2: [value('2026-09-20', 300_000)],
          hld_3: [value('2026-09-20', 40_000)],
        },
      ),
      '2026-09-23',
    );
    expect(data.position).toMatchObject({
      netWorth: 360_000,
      couldUse: 100_000,
      undecided: 300_000,
      owed: 40_000,
    });
  });

  it('leaves archived holdings and future values out of the position', () => {
    const data = homeData(
      snapshot(
        [
          holding({ id: 'hld_1' }),
          holding({ id: 'hld_2', archived: true, archivedAt: '2026-09-21T00:00:00Z' }),
        ],
        {
          hld_1: [value('2026-09-24', 999_000), value('2026-09-20', 100_000)],
          hld_2: [value('2026-09-20', 500_000)],
        },
      ),
      '2026-09-23',
    );
    expect(data.position.netWorth).toBe(100_000);
    expect(visibleHoldings(data).map((h) => h.id)).toStrictEqual(['hld_1']);
  });
});

describe('sharedLockedUntil', () => {
  const locked = (id: string, until: string | null) =>
    holding({ id, typeId: 'typ_prop', access: 'locked', accessUntil: until });

  it('names the until when the locked holdings share one', () => {
    const data = homeData(
      snapshot([locked('hld_1', 'while you live in it')], {
        hld_1: [value('2026-09-20', 300_000)],
      }),
      '2026-09-23',
    );
    expect(sharedLockedUntil(data, visibleHoldings(data))).toBe('while you live in it');
  });

  it('says nothing when they differ or none is locked', () => {
    const data = homeData(
      snapshot([locked('hld_1', 'while you live in it'), locked('hld_2', 'until vesting')], {
        hld_1: [value('2026-09-20', 300_000)],
        hld_2: [value('2026-09-20', 50_000)],
      }),
      '2026-09-23',
    );
    expect(sharedLockedUntil(data, visibleHoldings(data))).toBeNull();
    const none = homeData(
      snapshot([holding({ id: 'hld_1' })], {
        hld_1: [value('2026-09-20', 100_000)],
      }),
      '2026-09-23',
    );
    expect(sharedLockedUntil(none, visibleHoldings(none))).toBeNull();
  });
});

describe('homeTrendFrom', () => {
  const grouped = (values: readonly ValueIn[]) => {
    const byHolding = new Map<string, ValueIn[]>();
    for (const value of values) {
      const track = byHolding.get(value.holdingId);
      if (track) track.push(value);
      else byHolding.set(value.holdingId, [value]);
    }
    return byHolding;
  };

  it('starts at the range, clamped to the shown holdings’ first value', () => {
    const data = homeData(
      snapshot([holding({ id: 'hld_1' }), holding({ id: 'hld_2' })], {
        hld_1: [value('2025-09-20', 100_000), value('2026-09-22', 120_000)],
        hld_2: [value('2026-09-22', 50_000)],
      }),
      '2026-09-23',
    );
    const shown = visibleHoldings(data);
    const byHolding = grouped(data.values);
    expect(homeTrendFrom(shown, byHolding, '2026-09-23', 0)).toBeUndefined();
    expect(homeTrendFrom(shown, byHolding, '2026-09-23', 6)).toBe('2026-03-23');
    expect(homeTrendFrom(shown, byHolding, '2026-09-23', -1)).toBe('2026-01-01');
    // Eight years back predates the first value: no $0 run-up.
    expect(homeTrendFrom(shown, byHolding, '2026-09-23', 96)).toBe('2025-09-20');
  });

  it('is undefined with nothing shown or nothing valued', () => {
    const data = homeData(snapshot([holding({ id: 'hld_1' })], {}), '2026-09-23');
    const byHolding = grouped(data.values);
    expect(homeTrendFrom(visibleHoldings(data), byHolding, '2026-09-23', 6)).toBeUndefined();
    expect(homeTrendFrom([], byHolding, '2026-09-23', 6)).toBeUndefined();
  });
});
