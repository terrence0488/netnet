import type { HoldingDraft } from '@netnet/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { likelyDuplicates, nameSimilarity, normaliseName } from './duplicates';
import { latestValues } from './position';
import { holding, liability, value } from './testing/fixtures';

describe('normaliseName', () => {
  it.each([
    ['  Everyday   Saver ', 'everyday saver'],
    ['Café-Fund (Joint)', 'cafe fund joint'],
    ['ÉPARGNE #2', 'epargne 2'],
    ['株式 口座', '株式 口座'],
    ['!!!', '!!!'],
  ])('normalises %j to %j', (name, normalised) => {
    expect(normaliseName(name)).toBe(normalised);
  });
});

describe('nameSimilarity', () => {
  it('is 1 for names that are the same once normalised, in any word order', () => {
    expect(nameSimilarity('Everyday Saver', 'everyday-saver')).toBe(1);
    expect(nameSimilarity('Saver Everyday', 'Everyday Saver')).toBe(1);
  });

  it('is high for a typo or an extra word, and low for different names', () => {
    expect(nameSimilarity('Everyday Saver', 'Everyday Savr')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Everyday Saver', 'Everyday Saver account')).toBeGreaterThan(0.6);
    expect(nameSimilarity('Everyday Saver', 'Global Index Fund')).toBeLessThan(0.2);
    expect(nameSimilarity('A', 'B')).toBe(0);
  });
});

describe('likelyDuplicates', () => {
  const existing = [
    holding('hld_1', { name: 'Everyday Saver', universal: 'cash' }),
    holding('hld_2', { name: 'Everyday Saver', universal: 'cash', currency: 'USD' }),
    holding('hld_3', { name: 'Everyday Saver', universal: 'listed' }),
    holding('hld_4', { name: 'Everyday Savr', universal: 'other' }),
    holding('hld_5', { name: 'everyday saver', universal: 'cash', archived: true }),
    holding('hld_6', { name: 'Everyday Saver 2', universal: 'cash' }),
    holding('hld_7', { name: 'Holiday Fund', universal: 'cash' }),
    liability('hld_8', { name: 'Everyday Saver', currency: 'EUR' }),
  ];
  const draft: HoldingDraft = {
    name: 'Everyday saver',
    kind: 'asset',
    currency: 'EUR',
    universal: 'cash',
  };
  const latest = latestValues(
    [value('hld_1', '2026-09-01', 120_000), value('hld_1', '2026-09-20', 125_000)],
    '2026-09-27',
  );

  it('finds holdings of the same kind and currency, a compatible type and a similar name', () => {
    expect(likelyDuplicates(existing, draft, latest)).toStrictEqual([
      {
        id: 'hld_1',
        name: 'Everyday Saver',
        latest: { date: '2026-09-20', amountMinor: 125_000, currency: 'EUR' },
      },
      { id: 'hld_5', name: 'everyday saver', latest: null },
      { id: 'hld_6', name: 'Everyday Saver 2', latest: null },
    ]);
  });

  it('counts "other" as compatible with any type', () => {
    expect(
      likelyDuplicates(existing, { ...draft, name: 'Everyday Savr' }).map((c) => c.id),
    ).toStrictEqual(['hld_4', 'hld_1', 'hld_5']);
  });

  it('finds nothing when nothing is alike', () => {
    expect(likelyDuplicates(existing, { ...draft, name: 'Brokerage' })).toStrictEqual([]);
    expect(likelyDuplicates([], draft)).toStrictEqual([]);
  });

  it('returns at most three, in an order that does not depend on the input order', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(existing), (subset) => {
        const found = likelyDuplicates(subset, draft);
        expect(found.length).toBeLessThanOrEqual(3);
        expect(likelyDuplicates([...subset].reverse(), draft)).toStrictEqual(found);
      }),
    );
  });
});
