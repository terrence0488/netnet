import type { Change, HoldingIn, ValueIn } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { sortHoldings, sortLabel, type HomeSort } from './sort';

function holding(over: Partial<HoldingIn> & { id: string }): HoldingIn {
  return {
    name: over.id,
    kind: 'asset',
    typeId: 'typ_cash',
    universal: 'cash',
    currency: 'SGD',
    cadenceDays: null,
    archived: false,
    access: 'accessible',
    tagIds: [],
    ...over,
  };
}

const value = (holdingId: string, date: string, baseMinor: number): ValueIn => ({
  id: `val_${holdingId}_${date}`,
  holdingId,
  date,
  amountMinor: baseMinor,
  currency: 'SGD',
  baseMinor,
  source: 'web',
  clientName: null,
});

const change = (amount: number | null, pct: number | null): Change => ({
  baseline: 'last_month',
  since: '2026-08-31',
  amount,
  pct,
});

/** Four fictional holdings: a spare account, the main one, a debt, and one without a value. */
const holdings = [
  holding({ id: 'hld_spare', name: 'Spare account' }),
  holding({ id: 'hld_main', name: 'Main account' }),
  holding({ id: 'hld_loan', name: 'Old loan', kind: 'liability' }),
  holding({ id: 'hld_empty', name: 'Unvalued plot' }),
];
const latest = new Map([
  ['hld_spare', value('hld_spare', '2026-09-20', 125_000)],
  ['hld_main', value('hld_main', '2026-09-25', 500_000)],
  ['hld_loan', value('hld_loan', '2026-09-25', 200_000)],
]);
const changes = new Map([
  ['hld_spare', change(25_000, 25)],
  ['hld_main', change(10_000, 2.04)],
  ['hld_loan', change(-5_000, -2.44)],
]);

const orderOf = (sort: HomeSort) => sortHoldings(holdings, sort, latest, changes).map((h) => h.id);

describe('sortHoldings', () => {
  it('keeps the snapshot order until the person sorts', () => {
    expect(orderOf('added')).toStrictEqual(['hld_spare', 'hld_main', 'hld_loan', 'hld_empty']);
  });

  it('sorts by value, highest first, a debt below every asset, unvalued last', () => {
    expect(orderOf('value_desc')).toStrictEqual(['hld_main', 'hld_spare', 'hld_loan', 'hld_empty']);
  });

  it('sorts by name, A to Z', () => {
    expect(orderOf('name')).toStrictEqual(['hld_main', 'hld_loan', 'hld_spare', 'hld_empty']);
  });

  it('sorts by change in money, largest first', () => {
    expect(orderOf('change_value')).toStrictEqual([
      'hld_spare',
      'hld_main',
      'hld_loan',
      'hld_empty',
    ]);
  });

  it('sorts by change in percent, largest first', () => {
    expect(orderOf('change_pct')).toStrictEqual(['hld_spare', 'hld_main', 'hld_loan', 'hld_empty']);
  });

  it('sorts by last updated, newest first, unvalued last', () => {
    expect(orderOf('updated')).toStrictEqual(['hld_main', 'hld_loan', 'hld_spare', 'hld_empty']);
  });

  it('reads an unoffered sort as added', () => {
    expect(orderOf('value_asc')).toStrictEqual(['hld_spare', 'hld_main', 'hld_loan', 'hld_empty']);
    expect(orderOf('type')).toStrictEqual(['hld_spare', 'hld_main', 'hld_loan', 'hld_empty']);
  });
});

describe('sortLabel', () => {
  it('names every sort Home offers', () => {
    expect(sortLabel('added')).toBe('As added');
    expect(sortLabel('change_pct')).toBe('Largest change, %');
  });
});
