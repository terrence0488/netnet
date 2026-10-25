import { describe, expect, it } from 'vitest';
import {
  Spend,
  SpendCapReached,
  SpendRefused,
  ZERO_USAGE,
  addUsage,
  estimateCalls,
  priceOf,
  requireApproval,
  usd,
} from '../../ops/m12/src/spend';
import { ANSWER_MODEL, JUDGE_MODEL, PRICING } from '../../ops/m12/src/config';

/**
 * Spend (P4-T9, architecture §12 risk 9): the estimate is priced from the config, the run only
 * goes with an approval at or above it, and it stops as soon as what it has spent passes that
 * figure. No test makes a call: the arithmetic is the whole of it.
 */

describe('pricing', () => {
  it('prices a usage from the per-million-token rates', () => {
    const price = PRICING[ANSWER_MODEL];
    expect(price).toBeDefined();
    expect(priceOf(ANSWER_MODEL, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(
      (price?.input ?? 0) + (price?.output ?? 0),
    );
    expect(priceOf(ANSWER_MODEL, ZERO_USAGE)).toBe(0);
  });

  it('refuses to price a model it has no rate for', () => {
    expect(() => priceOf('a-model-nobody-priced', ZERO_USAGE)).toThrow(/no price/);
  });

  it('adds usages', () => {
    expect(
      addUsage({ inputTokens: 1, outputTokens: 2 }, { inputTokens: 3, outputTokens: 4 }),
    ).toStrictEqual({ inputTokens: 4, outputTokens: 6 });
  });
});

describe('the estimate', () => {
  it('adds every call up, per model', () => {
    const estimate = estimateCalls([
      { model: ANSWER_MODEL, usage: { inputTokens: 1_000_000, outputTokens: 0 } },
      { model: ANSWER_MODEL, usage: { inputTokens: 0, outputTokens: 1_000_000 } },
      { model: JUDGE_MODEL, usage: { inputTokens: 0, outputTokens: 1_000_000 } },
    ]);
    expect(estimate.calls).toBe(3);
    expect(estimate.usd).toBeCloseTo(
      (PRICING[ANSWER_MODEL]?.input ?? 0) +
        (PRICING[ANSWER_MODEL]?.output ?? 0) +
        (PRICING[JUDGE_MODEL]?.output ?? 0),
    );
    expect(estimate.byModel[ANSWER_MODEL]).toStrictEqual({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
  });

  it('is four decimal places in USD, so a small figure is not "0.00"', () => {
    expect(usd(0.004)).toBe('$0.0040');
  });
});

describe('the approval gate', () => {
  it('runs at or above the estimate, and refuses a cent below it', () => {
    expect(() => requireApproval(2, 2)).not.toThrow();
    expect(() => requireApproval(2, 3)).not.toThrow();
    expect(() => requireApproval(2, 1.99)).toThrow(SpendRefused);
  });

  it('says what to approve', () => {
    expect(() => requireApproval(2, 1)).toThrow(/approve at least the estimate/);
  });
});

describe('the cap', () => {
  const million = { inputTokens: 1_000_000, outputTokens: 0 };

  it('counts what was spent, and stops right after the call that passes the cap', () => {
    const spend = new Spend(priceOf(ANSWER_MODEL, million) * 2);
    spend.record(ANSWER_MODEL, million);
    expect(spend.exhausted).toBe(false);
    expect(() => spend.record(ANSWER_MODEL, million)).not.toThrow();
    expect(spend.spentUsd).toBeCloseTo(priceOf(ANSWER_MODEL, million) * 2);
    expect(() => spend.record(ANSWER_MODEL, million)).toThrow(SpendCapReached);
    expect(spend.exhausted).toBe(true);
  });

  it('carries what it had spent in the error, for the report', () => {
    const spend = new Spend(0.0001);
    try {
      spend.record(JUDGE_MODEL, { inputTokens: 1_000_000, outputTokens: 0 });
      expect.unreachable('the cap should have stopped it');
    } catch (error) {
      expect(error).toBeInstanceOf(SpendCapReached);
      expect((error as SpendCapReached).spentUsd).toBeCloseTo(15);
      expect((error as SpendCapReached).capUsd).toBe(0.0001);
    }
  });
});
