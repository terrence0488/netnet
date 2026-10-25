import { describe, expect, it } from 'vitest';
import { agreement, hash32, pickBlindPairs, seededOrder } from '../../ops/m12/src/blind';

/**
 * Blinding (P4-T9): the order is a hash of the seed, the question and the run, so it is
 * reproducible and recorded; the pairs the sheet shows are seeded too; the agreement with the
 * judge is computed from the Founder's hand scores through that recorded order. The judge and the
 * sheet never see an arm's name.
 */

const pairs = Array.from({ length: 30 }, (_, i) => ({ id: `q${String(i + 1).padStart(2, '0')}` }));

describe('the seeded order', () => {
  it('is stable for the same seed, question and run, and split across both arms', () => {
    const first = seededOrder(1, 'q01', 1);
    expect(seededOrder(1, 'q01', 1)).toBe(first);
    const orders = pairs.map((pair) => seededOrder(1, pair.id, 1));
    expect(orders.filter((arm) => arm === 'netnet').length).toBeGreaterThan(5);
    expect(orders.filter((arm) => arm === 'spreadsheet').length).toBeGreaterThan(5);
  });

  it('changes with the seed, the question and the run', () => {
    const one = seededOrder(1, 'q01', 1);
    const variants = [seededOrder(2, 'q01', 1), seededOrder(1, 'q02', 1), seededOrder(1, 'q01', 2)];
    expect(variants.some((variant) => variant !== one)).toBe(true);
  });

  it('hashes the same text to the same number', () => {
    expect(hash32('m12')).toBe(hash32('m12'));
    expect(hash32('m12')).not.toBe(hash32('m13'));
  });
});

describe('the blind sheet’s pairs', () => {
  it('takes ten, seeded, and the same ten every time', () => {
    const chosen = pickBlindPairs(pairs, 1, 10);
    expect(chosen).toHaveLength(10);
    expect(chosen.map((pair) => pair.id)).toStrictEqual(
      pickBlindPairs(pairs, 1, 10).map((pair) => pair.id),
    );
    expect(new Set(chosen.map((pair) => pair.id)).size).toBe(10);
    for (const pair of chosen) expect(pairs).toContainEqual(pair);
  });

  it('takes what there is when there are fewer', () => {
    expect(pickBlindPairs(pairs.slice(0, 3), 1, 10)).toHaveLength(3);
    expect(pickBlindPairs([], 1, 10)).toStrictEqual([]);
  });
});

describe('the agreement with the judge', () => {
  const order = { A: 'netnet' as const, B: 'spreadsheet' as const };
  const judged = [
    { id: 'pair-1', judged: 'netnet' as const, order },
    { id: 'pair-2', judged: 'spreadsheet' as const, order },
    {
      id: 'pair-3',
      judged: 'tie' as const,
      order: { A: 'spreadsheet' as const, B: 'netnet' as const },
    },
  ];

  it('unblinds each hand score through the pair’s recorded order', () => {
    expect(agreement(judged, { 'pair-1': 'A', 'pair-2': 'B', 'pair-3': 'tie' })).toStrictEqual({
      scored: 3,
      agree: 3,
      rate: 1,
    });
    // The third pair's A was the spreadsheet arm, so "A" is not the judge's tie.
    expect(agreement(judged, { 'pair-3': 'A' })).toStrictEqual({ scored: 1, agree: 0, rate: 0 });
  });

  it('has no rate when nothing was scored, rather than a made-up one', () => {
    expect(agreement(judged, {})).toStrictEqual({ scored: 0, agree: 0, rate: null });
  });
});
