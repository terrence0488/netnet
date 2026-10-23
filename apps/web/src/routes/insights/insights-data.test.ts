import type { Holding, Snapshot, UserType, ValueTuple } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { homeData } from '../home/home-data';
import {
  countedHoldings,
  distributionColumns,
  insightPeriods,
  insightSplits,
  insightSummary,
  OTHER_KEY,
  periodLabel,
  periodShort,
  periodWindow,
  rangedPeriods,
  slotKey,
  windowLabel,
  ytdTake,
} from './insights-data';

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
    id: 'typ_loan',
    universal: 'loan',
    packTypeKey: null,
    customName: null,
    sort: 1,
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
    createdAt: '2026-01-01T00:00:00Z',
    rowVersion: 1,
    access: 'accessible',
    accessReason: null,
    accessUntil: null,
    accessBasis: null,
    tagIds: [],
    ...over,
  };
}

const value = (date: string, amountMinor: number): ValueTuple => [
  date,
  amountMinor,
  'SGD',
  amountMinor,
  'web',
  null,
  `val_${date}_${amountMinor}`,
];

const TODAY = '2026-06-15';
const SLOTS = new Map([
  ['typ_cash', 0],
  ['typ_loan', 1],
]);

/** Savings rising $1,000 → $1,500 → $1,800 across Jan–Mar; a $400 loan from Feb. */
function ledger() {
  return homeData(
    {
      dataVersion: 3,
      baseCurrency: 'SGD',
      packRef: [{ key: 'generic', version: 1 }],
      prefs: {},
      types: TYPES,
      tags: [],
      holdings: [
        holding({ id: 'hld_cash', name: 'Everyday savings' }),
        holding({
          id: 'hld_loan',
          name: 'Student loan',
          kind: 'liability',
          typeId: 'typ_loan',
          access: null,
        }),
      ],
      values: {
        hld_cash: [
          value('2026-01-10', 100_000),
          value('2026-02-10', 150_000),
          value('2026-03-10', 180_000),
        ],
        hld_loan: [value('2026-02-15', 40_000)],
      },
    } satisfies Snapshot,
    TODAY,
  );
}

describe('insightPeriods', () => {
  it('lists the calendar periods newest-first, with drivers ranked by contribution', () => {
    const all = insightPeriods(ledger(), 'monthly', TODAY, {}, {});
    expect(all.map((period) => period.start)).toStrictEqual([
      '2026-06-01',
      '2026-05-01',
      '2026-04-01',
      '2026-03-01',
      '2026-02-01',
      '2026-01-01',
    ]);
    const february = all.find((period) => period.start === '2026-02-01');
    expect(february?.endValue).toBe(110_000);
    expect(february?.change).toBe(10_000);
    expect(february?.drivers.map((driver) => driver.holdingId)).toStrictEqual([
      'hld_cash',
      'hld_loan',
    ]);
  });

  it('recomputes every figure over the filtered set, and drops the Don’t Show list', () => {
    const data = ledger();
    const filtered = insightPeriods(data, 'monthly', TODAY, { typeIds: ['typ_cash'] }, {});
    expect(filtered.find((period) => period.start === '2026-02-01')?.endValue).toBe(150_000);
    const excluded = insightPeriods(data, 'monthly', TODAY, {}, { holdingIds: ['hld_loan'] });
    expect(excluded.find((period) => period.start === '2026-02-01')?.endValue).toBe(150_000);
    expect(excluded.find((period) => period.start === '2026-02-01')?.drivers).toStrictEqual([
      { holdingId: 'hld_cash', name: 'Everyday savings', contribution: 50_000 },
    ]);
  });
});

describe('the first period', () => {
  it('has its end value but no change, % or drivers, whatever the view', () => {
    for (const view of ['monthly', 'quarterly', 'yearly'] as const) {
      expect(insightPeriods(ledger(), view, TODAY, {}, {}).at(-1)).toMatchObject({
        start: '2026-01-01',
        change: null,
        changePct: null,
        drivers: [],
      });
    }
    expect(insightPeriods(ledger(), 'monthly', TODAY, {}, {}).at(-1)?.endValue).toBe(100_000);
  });

  it('is the earliest left after the filter or the Don’t Show list', () => {
    const data = ledger();
    // Without the savings the set opens in February, owing: no change, never a −$400 loss.
    const owing = {
      start: '2026-02-01',
      end: '2026-02-28',
      endValue: -40_000,
      change: null,
      changePct: null,
      carried: false,
      drivers: [],
    };
    expect(
      insightPeriods(data, 'monthly', TODAY, {}, { holdingIds: ['hld_cash'] }).at(-1),
    ).toStrictEqual(owing);
    expect(
      insightPeriods(data, 'monthly', TODAY, { typeIds: ['typ_loan'] }, {}).at(-1),
    ).toStrictEqual(owing);
  });
});

describe('rangedPeriods', () => {
  it('takes All, the year so far, or the newest N', () => {
    const all = insightPeriods(ledger(), 'monthly', TODAY, {}, {});
    expect(rangedPeriods(all, 0, 'monthly', TODAY)).toHaveLength(6);
    expect(rangedPeriods(all, -1, 'monthly', TODAY)).toHaveLength(6);
    expect(rangedPeriods(all, 2, 'monthly', TODAY).map((period) => period.start)).toStrictEqual([
      '2026-06-01',
      '2026-05-01',
    ]);
  });

  it('counts the year so far per view', () => {
    expect(ytdTake('monthly', '2026-06-15')).toBe(6);
    expect(ytdTake('quarterly', '2026-06-15')).toBe(2);
    expect(ytdTake('quarterly', '2026-01-05')).toBe(1);
  });
});

describe('periodWindow', () => {
  it('pages five at a time from the newest end, and clamps past the end', () => {
    const oldestFirst = [...insightPeriods(ledger(), 'monthly', TODAY, {}, {})].reverse();
    const first = periodWindow(oldestFirst, 0);
    expect(first.windowed.map((period) => period.start)).toStrictEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
    expect(first.maxPage).toBe(1);
    const clamped = periodWindow(oldestFirst, 9);
    expect(clamped.page).toBe(1);
    expect(clamped.windowed.map((period) => period.start)).toStrictEqual(['2026-01-01']);
  });
});

describe('insightSplits', () => {
  it('splits each ranged period into assets and liabilities over the same set', () => {
    const data = ledger();
    const oldestFirst = [...insightPeriods(data, 'monthly', TODAY, {}, {})].reverse();
    const { assets, liabilities } = insightSplits(oldestFirst, data, 'monthly', TODAY, {}, {});
    expect(assets).toStrictEqual([100_000, 150_000, 180_000, 180_000, 180_000, 180_000]);
    expect(liabilities).toStrictEqual([0, -40_000, -40_000, -40_000, -40_000, -40_000]);
    for (const [index, period] of oldestFirst.entries()) {
      expect((assets[index] ?? 0) + (liabilities[index] ?? 0)).toBe(period.endValue);
    }
  });
});

describe('distributionColumns', () => {
  it('stacks each period end by type, totalling to the period’s end value', () => {
    const data = ledger();
    const columns = distributionColumns(
      data,
      ['2026-02-28', '2026-03-31'],
      'monthly',
      {},
      {},
      SLOTS,
    );
    expect(columns[0]).toStrictEqual([
      { key: slotKey(0), value: 150_000 },
      { key: slotKey(1), value: -40_000 },
    ]);
    const totals = columns.map((column) => column.reduce((sum, part) => sum + part.value, 0));
    expect(totals).toStrictEqual([110_000, 140_000]);
  });

  it('folds the ninth type on into Other', () => {
    const data = ledger();
    const deep = new Map([
      ['typ_cash', 0],
      ['typ_loan', 9],
    ]);
    const [column] = distributionColumns(data, ['2026-02-28'], 'monthly', {}, {}, deep);
    expect(column).toStrictEqual([
      { key: slotKey(0), value: 150_000 },
      { key: OTHER_KEY, value: -40_000 },
    ]);
  });
});

describe('insightSummary', () => {
  it('averages the comparable periods, and is null with only one', () => {
    const oldestFirst = [...insightPeriods(ledger(), 'monthly', TODAY, {}, {})].reverse();
    const summary = insightSummary(oldestFirst);
    expect(summary?.count).toBe(5);
    expect(summary?.avgAbs).toBe(8_000);
    expect(summary?.avgPct).toBeCloseTo(7.45, 2);
    expect(insightSummary(oldestFirst.slice(0, 1))).toBeNull();
  });
});

describe('countedHoldings', () => {
  it('counts what the filter and Don’t Show list leave', () => {
    const data = ledger();
    expect(countedHoldings(data, {}, {})).toBe(2);
    expect(countedHoldings(data, { typeIds: ['typ_cash'] }, {})).toBe(1);
    expect(countedHoldings(data, {}, { holdingIds: ['hld_cash', 'hld_loan'] })).toBe(0);
  });
});

describe('labels', () => {
  it('names the period by its end', () => {
    expect(periodLabel('monthly', '2026-06-15', 'en-SG')).toBe('June 2026');
    expect(periodLabel('quarterly', '2026-06-15', 'en-SG')).toBe('Q2 2026');
    expect(periodLabel('yearly', '2026-06-15', 'en-SG')).toBe('2026');
    expect(periodShort('monthly', '2026-06-15', 'en-SG')).toBe('Jun');
    expect(periodShort('quarterly', '2026-06-15', 'en-SG')).toBe('Q2');
  });

  it('names the pager window once for the whole span', () => {
    const oldestFirst = [...insightPeriods(ledger(), 'monthly', TODAY, {}, {})].reverse();
    expect(windowLabel(periodWindow(oldestFirst, 0).windowed, 'monthly', 'en-SG')).toBe(
      'Feb – Jun 2026',
    );
    expect(windowLabel(oldestFirst.slice(0, 1), 'monthly', 'en-SG')).toBe('Jan 2026');
    expect(windowLabel([], 'monthly', 'en-SG')).toBe('');
  });
});
