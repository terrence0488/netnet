import type { Holding, Period, Snapshot, UserType, ValueTuple } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import {
  PERIOD_PAGE_SIZE,
  holdingPeriods,
  observedCount,
  pageCount,
  pageOf,
  periodLabel,
  periodShort,
  windowLabel,
} from './holding-periods';

const TYPES: UserType[] = [
  {
    id: 'typ_cash',
    universal: 'cash',
    packTypeKey: null,
    customName: null,
    sort: 0,
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

/** A fictional half-year of month-end values with a gap in June: July carries June's May value. */
const HALF_YEAR = [
  value('2026-03-15', 100_000),
  value('2026-04-15', 105_000),
  value('2026-05-15', 103_000),
  value('2026-07-15', 110_000),
  value('2026-08-15', 108_000),
];

describe('holdingPeriods', () => {
  it('buckets one holding’s values into calendar months, oldest first, the first unchanged', () => {
    const row = holding({ id: 'hld_1' });
    const months = holdingPeriods(
      snapshot([row], { hld_1: HALF_YEAR }),
      row,
      'cash',
      'monthly',
      '2026-08-20',
    );
    expect(months.map((p) => [p.start, p.end, p.endValue, p.change])).toStrictEqual([
      ['2026-03-01', '2026-03-31', 100_000, null],
      ['2026-04-01', '2026-04-30', 105_000, 5_000],
      ['2026-05-01', '2026-05-31', 103_000, -2_000],
      ['2026-06-01', '2026-06-30', 103_000, 0],
      ['2026-07-01', '2026-07-31', 110_000, 7_000],
      ['2026-08-01', '2026-08-20', 108_000, -2_000],
    ]);
  });

  it('marks only the months with nothing dated inside them carried', () => {
    const row = holding({ id: 'hld_1' });
    const months = holdingPeriods(
      snapshot([row], { hld_1: HALF_YEAR }),
      row,
      'cash',
      'monthly',
      '2026-08-20',
    );
    expect(months.map((p) => p.carried)).toStrictEqual([false, false, false, true, false, false]);
    expect(observedCount(months)).toBe(5);
  });

  it('keeps an archived holding’s own periods', () => {
    const row = holding({ id: 'hld_1', archived: true, archivedAt: '2026-09-10T00:00:00Z' });
    const months = holdingPeriods(
      snapshot([row], { hld_1: [value('2026-08-15', 100_000)] }),
      row,
      'cash',
      'monthly',
      '2026-08-20',
    );
    expect(months).toHaveLength(1);
    expect(observedCount(months)).toBe(1);
  });

  it('offers nothing without values', () => {
    const row = holding({ id: 'hld_1' });
    const months = holdingPeriods(snapshot([row], {}), row, 'cash', 'monthly', '2026-08-20');
    expect(months).toStrictEqual([]);
    expect(observedCount(months)).toBe(0);
  });
});

describe('paging', () => {
  const months = (count: number): Period[] =>
    Array.from({ length: count }, (_, i) => ({
      start: `2026-${String(i + 1).padStart(2, '0')}-01`,
      end: `2026-${String(i + 1).padStart(2, '0')}-28`,
      endValue: 100_000 + i,
      change: i === 0 ? null : 1,
      changePct: i === 0 ? null : 0.1,
      carried: false,
      drivers: [],
    }));

  it('walks newest first in fives, each window oldest first', () => {
    expect(PERIOD_PAGE_SIZE).toBe(5);
    const all = months(12);
    expect(pageCount(all.length, PERIOD_PAGE_SIZE)).toBe(3);
    expect(pageOf(all, 0, PERIOD_PAGE_SIZE).map((p) => p.start)).toStrictEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
    ]);
    expect(pageOf(all, 1, PERIOD_PAGE_SIZE).map((p) => p.start)).toStrictEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ]);
    expect(pageOf(all, 2, PERIOD_PAGE_SIZE).map((p) => p.start)).toStrictEqual([
      '2026-01-01',
      '2026-02-01',
    ]);
  });

  it('clamps past the ends to the nearest window', () => {
    const all = months(3);
    expect(pageCount(all.length, PERIOD_PAGE_SIZE)).toBe(1);
    expect(pageOf(all, -1, PERIOD_PAGE_SIZE)).toHaveLength(3);
    expect(pageOf(all, 4, PERIOD_PAGE_SIZE)).toHaveLength(3);
    expect(pageOf([], 0, PERIOD_PAGE_SIZE)).toStrictEqual([]);
  });
});

describe('period words', () => {
  const period = (end: string): Period => ({
    start: end.slice(0, 8) + '01',
    end,
    endValue: 100_000,
    change: 1_000,
    changePct: 1,
    carried: false,
    drivers: [],
  });

  it('names a period in full and short', () => {
    expect(periodLabel('monthly', period('2026-09-30'))).toBe('September 2026');
    expect(periodShort('monthly', period('2026-09-30'))).toBe('Sep');
    expect(periodLabel('quarterly', period('2026-09-30'))).toBe('Q3 2026');
    expect(periodShort('quarterly', period('2026-09-30'))).toBe('Q3');
    expect(periodLabel('yearly', period('2026-12-31'))).toBe('2026');
    expect(periodShort('yearly', period('2026-12-31'))).toBe('2026');
  });

  it('names the pagers window, naming the year once when shared', () => {
    const window = [period('2026-06-30'), period('2026-07-31'), period('2026-09-30')];
    expect(windowLabel('monthly', window)).toBe('Jun – Sep 2026');
    expect(windowLabel('quarterly', window)).toBe('Q2 2026 – Q3 2026');
    expect(windowLabel('yearly', [period('2024-12-31'), period('2026-12-31')])).toBe('2024 – 2026');
    expect(windowLabel('monthly', [period('2025-11-30'), period('2026-02-28')])).toBe(
      'Nov 2025 – Feb 2026',
    );
    expect(windowLabel('monthly', [period('2026-09-30')])).toBe('Sep 2026');
    expect(windowLabel('monthly', [])).toBe('');
  });
});
