import type { Holding, Snapshot, UserType, ValueTuple } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_LABELS,
  HOLDING_BASELINE_DEFAULT,
  formatPct,
  holdingChange,
  holdingTrend,
  stalenessText,
} from './holding-data';

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

function snapshot(
  holdings: Holding[],
  values: Record<string, ValueTuple[]>,
  prefs: Snapshot['prefs'] = {},
): Snapshot {
  return {
    dataVersion: 3,
    baseCurrency: 'SGD',
    packRef: [{ key: 'generic', version: 1 }],
    prefs,
    types: TYPES,
    tags: [],
    holdings,
    values,
  };
}

describe('holdingTrend', () => {
  it('draws one point per day from the first value to today', () => {
    const row = holding({ id: 'hld_1' });
    const points = holdingTrend(
      snapshot([row], { hld_1: [value('2026-09-20', 100_000), value('2026-09-22', 120_000)] }),
      row,
      'cash',
      '2026-09-23',
    );
    expect(points.map((p) => [p.date, p.total])).toStrictEqual([
      ['2026-09-20', 100_000],
      ['2026-09-21', 100_000],
      ['2026-09-22', 120_000],
      ['2026-09-23', 120_000],
    ]);
  });

  it('keeps an archived holding’s own trend', () => {
    const row = holding({ id: 'hld_1', archived: true, archivedAt: '2026-09-10T00:00:00Z' });
    const points = holdingTrend(
      snapshot([row], { hld_1: [value('2026-09-20', 100_000)] }),
      row,
      'cash',
      '2026-09-21',
    );
    expect(points.map((p) => p.total)).toStrictEqual([100_000, 100_000]);
  });

  it('has no points without values', () => {
    const row = holding({ id: 'hld_1' });
    expect(holdingTrend(snapshot([row], {}), row, 'cash', '2026-09-21')).toStrictEqual([]);
  });
});

describe('holdingChange', () => {
  it('measures the holding against the selected baseline (PRD J4)', () => {
    const row = holding({ id: 'hld_1' });
    const snap = snapshot(
      [row],
      { hld_1: [value('2026-08-15', 100_000), value('2026-09-20', 125_000)] },
      { baseline: 'last_month' },
    );
    expect(holdingChange(snap, row, 'cash', '2026-09-23')).toStrictEqual({
      baseline: 'last_month',
      since: '2026-08-31',
      amount: 25_000,
      pct: 25,
    });
  });

  it('defaults to last month, and keeps an archived holding’s own change', () => {
    const row = holding({ id: 'hld_1', archived: true, archivedAt: '2026-09-10T00:00:00Z' });
    const snap = snapshot([row], {
      hld_1: [value('2026-08-15', 100_000), value('2026-09-20', 90_000)],
    });
    expect(HOLDING_BASELINE_DEFAULT).toBe('last_month');
    expect(holdingChange(snap, row, 'cash', '2026-09-23')).toStrictEqual({
      baseline: 'last_month',
      since: '2026-08-31',
      amount: -10_000,
      pct: -10,
    });
  });

  it('has nothing to compare with a single value over last update', () => {
    const row = holding({ id: 'hld_1' });
    const snap = snapshot(
      [row],
      { hld_1: [value('2026-09-20', 100_000)] },
      { baseline: 'initial' },
    );
    expect(holdingChange(snap, row, 'cash', '2026-09-23')).toStrictEqual({
      baseline: 'initial',
      since: null,
      amount: null,
      pct: null,
    });
  });
});

describe('formatPct', () => {
  it('signs the percent with at most one decimal', () => {
    expect(formatPct(25)).toBe('+25%');
    expect(formatPct(0.68)).toBe('+0.7%');
    expect(formatPct(-10)).toBe('−10%');
    expect(formatPct(0)).toBe('+0%');
  });
});

describe('stalenessText', () => {
  it('names the age, and staleness past the cadence (PRD J9)', () => {
    expect(stalenessText(false, 'today')).toBe('Updated today');
    expect(stalenessText(false, '3 days ago')).toBe('Updated 3 days ago');
    expect(stalenessText(true, '6 weeks ago')).toBe('Stale · updated 6 weeks ago');
  });
});

describe('BASELINE_LABELS', () => {
  it('names all six baselines', () => {
    expect(Object.values(BASELINE_LABELS)).toStrictEqual([
      'Initial value',
      'Last update',
      'Last month',
      'Last quarter',
      'Jan 1',
      'Last year',
    ]);
  });
});
