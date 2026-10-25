import { describe, expect, it } from 'vitest';
import type { M12Layer } from '@netnet/contracts';
import {
  compareScores,
  matchesText,
  pairOutcome,
  scoreAnswer,
  summarise,
  type Judgement,
  type PairRecord,
  type Scored,
} from '../../ops/m12/src/scoring';

/**
 * Scoring and the win rule (P4-T9, PRD M12): numeric correctness against core's ground truth,
 * the judge's qualification and fabrication, a pair to the higher total and a tie to no one. The
 * 80% bar and the fabrication rule are the report's — these tests hold them to the PRD.
 */

const judgement = (overrides: Partial<Judgement> = {}): Judgement => ({
  figures: [],
  value: '',
  qualification: 1,
  fabricated: false,
  reason: 'planted',
  ...overrides,
});

const amount = (expected: number, tolerance: number) => ({
  metric: 'net_worth' as const,
  expected,
  tolerance,
});

describe('an answer’s score', () => {
  it('gives 2 points for a figure inside the tolerance, and none outside it', () => {
    const inside = scoreAnswer(amount(1000, 1), judgement({ figures: [1000.4] }));
    expect(inside.correctness).toBe(1);
    expect(inside.total).toBe(2 + 1 + 1);

    const outside = scoreAnswer(amount(1000, 1), judgement({ figures: [1002] }));
    expect(outside.correctness).toBe(0);
    expect(outside.total).toBe(1 + 1);
  });

  it('accepts any of the figures when the answer states several', () => {
    expect(scoreAnswer(amount(1000, 1), judgement({ figures: [12, 999.6] })).correctness).toBe(1);
  });

  it('scores an unanswerable question on saying so, not on a figure', () => {
    const unknown = { metric: 'unknown' as const, expected: null };
    expect(
      scoreAnswer(unknown, judgement({ value: 'unknown', qualification: 2, figures: [] })).total,
    ).toBe(5);
    expect(scoreAnswer(unknown, judgement({ figures: [5000] })).correctness).toBe(0);
    expect(scoreAnswer(unknown, judgement({ figures: [5000], fabricated: true })).total).toBe(1);
  });

  it('matches a text answer exactly, or as a paraphrase of most of its words', () => {
    expect(matchesText('locked', 'locked')).toBe(true);
    expect(matchesText('No — it is locked while you live in it', 'locked')).toBe(true);
    expect(
      matchesText('you can withdraw when you are eligible', 'until you’re eligible to withdraw'),
    ).toBe(true);
    expect(matchesText('accessible', 'locked')).toBe(false);
    expect(matchesText('', 'locked')).toBe(false);
    const text = { metric: 'holding_access' as const, expected: 'locked' };
    expect(scoreAnswer(text, judgement({ value: 'it is locked' })).correctness).toBe(1);
    expect(scoreAnswer(text, judgement({ value: 'you can sell it' })).correctness).toBe(0);
  });

  it('clamps the judge’s qualification to 0–2, and a fabrication costs its point', () => {
    expect(scoreAnswer(amount(1, 0), judgement({ qualification: 9 })).qualification).toBe(2);
    expect(scoreAnswer(amount(1, 0), judgement({ qualification: -3 })).qualification).toBe(0);
    expect(scoreAnswer(amount(1, 0), judgement({ fabricated: true })).fabrication).toBe(0);
  });
});

describe('the pair’s winner', () => {
  it('goes to the higher total, and a tie is no win', () => {
    const better: Scored = { correctness: 1, qualification: 1, fabrication: 1, total: 4 };
    const worse: Scored = { correctness: 0, qualification: 1, fabrication: 1, total: 2 };
    expect(compareScores(better, worse)).toBe('A');
    expect(compareScores(worse, better)).toBe('B');
    expect(compareScores(better, better)).toBe('tie');
  });

  it('unblinds the answers through the seeded order', () => {
    const outcome = pairOutcome(
      amount(1000, 1),
      { A: 'spreadsheet', B: 'netnet' },
      { A: judgement({ figures: [1] }), B: judgement({ figures: [1000] }) },
    );
    expect(outcome.winner).toBe('netnet');
    expect(outcome.netnet.correctness).toBe(1);
    expect(outcome.spreadsheet.correctness).toBe(0);
  });
});

describe('the summary', () => {
  it('counts wins, ties, the rate, the bar and each layer', () => {
    const records = [
      pairAt('arithmetic', 'netnet'),
      pairAt('arithmetic', 'tie'),
      pairAt('provenance', 'spreadsheet'),
      pairAt('fabrication', 'netnet'),
      pairAt('answer_shape', 'netnet'),
    ];
    const summary = summarise(records);
    expect(summary.pairs).toBe(5);
    expect(summary.wins).toBe(3);
    expect(summary.ties).toBe(1);
    expect(summary.losses).toBe(1);
    expect(summary.winRate).toBeCloseTo(0.6);
    expect(summary.meetsBar).toBe(false);
    expect(summary.layers.arithmetic).toStrictEqual({ pairs: 2, wins: 1, losses: 0, ties: 1 });
  });

  it('meets the 80% bar at 4 of 5, and not at 3 of 4', () => {
    expect(
      summarise([
        pairAt('arithmetic', 'netnet'),
        pairAt('arithmetic', 'netnet'),
        pairAt('semantics', 'netnet'),
        pairAt('provenance', 'netnet'),
        pairAt('fabrication', 'tie'),
      ]).meetsBar,
    ).toBe(true);
    expect(
      summarise([
        pairAt('arithmetic', 'netnet'),
        pairAt('arithmetic', 'netnet'),
        pairAt('semantics', 'netnet'),
        pairAt('provenance', 'spreadsheet'),
      ]).meetsBar,
    ).toBe(false);
  });

  it('counts fabrication per arm, and NetNet must never have more', () => {
    const good = summarise([pairAt('fabrication', 'netnet')]);
    expect(good.fabricated).toStrictEqual({ netnet: 0, spreadsheet: 0 });
    expect(good.fabricationBarMet).toBe(true);

    const worse = summarise([
      pairAt('fabrication', 'netnet', { netnet: true, spreadsheet: false }),
      pairAt('fabrication', 'netnet', { netnet: true, spreadsheet: false }),
    ]);
    expect(worse.fabricated).toStrictEqual({ netnet: 2, spreadsheet: 0 });
    expect(worse.fabricationBarMet).toBe(false);
  });

  it('has no rate and no bar at all with no pairs (a stopped run)', () => {
    const empty = summarise([]);
    expect(empty.winRate).toBe(0);
    expect(empty.meetsBar).toBe(false);
  });
});

function pairAt(
  layer: M12Layer,
  winner: PairRecord['winner'],
  fabricated: { netnet: boolean; spreadsheet: boolean } = { netnet: false, spreadsheet: false },
): PairRecord {
  const scored = (fabricatedHere: boolean): Scored => ({
    correctness: 1,
    qualification: 1,
    fabrication: fabricatedHere ? 0 : 1,
    total: fabricatedHere ? 4 : 5,
  });
  return {
    run: 1,
    questionId: `q-${layer}-${winner}`,
    layer,
    order: { A: 'netnet', B: 'spreadsheet' },
    A: scored(fabricated.netnet),
    B: scored(fabricated.spreadsheet),
    netnet: scored(fabricated.netnet),
    spreadsheet: scored(fabricated.spreadsheet),
    winner,
  };
}
