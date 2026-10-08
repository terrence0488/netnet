import type { Change } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { formatChangePct, rowChangeShown } from './change';
import { baselineLabel, BASELINE_OPTIONS } from './baselines';

describe('formatChangePct', () => {
  it('signs the percentage, with at most one decimal', () => {
    expect(formatChangePct(23.333)).toBe('+23.3%');
    expect(formatChangePct(-2)).toBe('−2%');
    expect(formatChangePct(0)).toBe('0%');
  });
});

describe('rowChangeShown', () => {
  const change = (amount: number | null, pct: number | null): Change => ({
    baseline: 'last_month',
    since: '2026-08-31',
    amount,
    pct,
  });

  it('shows the money by default', () => {
    expect(rowChangeShown(change(25_000, 25), false)).toStrictEqual({
      kind: 'money',
      minor: 25_000,
    });
  });

  it('shows the percentage when sorted by it', () => {
    expect(rowChangeShown(change(25_000, 25), true)).toStrictEqual({ kind: 'pct', pct: 25 });
  });

  it('shows nothing when nothing changed or compares', () => {
    expect(rowChangeShown(change(0, 0), false)).toBeNull();
    expect(rowChangeShown(change(null, null), true)).toBeNull();
  });

  it('falls back to the money when the percentage cannot be worked out', () => {
    expect(rowChangeShown(change(25_000, null), true)).toStrictEqual({
      kind: 'money',
      minor: 25_000,
    });
  });
});

describe('baselines', () => {
  it('labels all six baselines in the contract’s order', () => {
    expect(BASELINE_OPTIONS.map((option) => option.label)).toStrictEqual([
      'Initial value',
      'Last update',
      'Last month',
      'Last quarter',
      'Jan 1',
      'Last year',
    ]);
    expect(baselineLabel('year_start')).toBe('Jan 1');
  });
});
