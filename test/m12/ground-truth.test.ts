import { describe, expect, it } from 'vitest';
import { fromMinor, latestValues, position } from '@netnet/core';
import { GroundTruth, mismatches, readGroundTruth } from '../../ops/m12/src/ground-truth';
import { buildHousehold, readContentDocs, readHousehold } from '../../ops/m12/src/household';
import { readQuestions } from '../../ops/m12/src/questions';

/**
 * The ground truth (P4-T9, PRD M12): every question's committed answer is what `core` computes
 * from the demo household, so a change to the household, the packs or core fails here before a
 * paid run can score against a stale pin. The tests also hold the harness to using core's own
 * functions — `position`, `periods` and `compileContext` — rather than a second implementation.
 */

const truth = readGroundTruth();
const set = readQuestions();

describe('the ground truth is core’s', () => {
  it('pins every question: the committed expected is what core computes now', () => {
    expect(mismatches(set.questions, truth)).toStrictEqual([]);
  });

  it('computes the totals with position(), in the base currency', () => {
    const { context } = truth.household;
    const live = context.holdings.filter((holding) => !holding.archived);
    const pos = position(live, latestValues(context.values, truth.today));
    const major = (minor: number) => Number(fromMinor(minor, context.baseCurrency));
    expect(truth.value('net_worth')).toBe(major(pos.netWorth));
    expect(truth.value('assets')).toBe(major(pos.assets));
    expect(truth.value('owed')).toBe(major(pos.owed));
    expect(truth.value('could_use')).toBe(major(pos.couldUse));
    expect(truth.value('locked')).toBe(major(pos.locked));
    expect(truth.value('sell_first')).toBe(major(pos.sellFirst));
    expect(truth.value('undecided')).toBe(major(pos.undecided));
    // The buckets add up to the position, as the context states them.
    expect(pos.assets).toBe(pos.couldUse + pos.sellFirst + pos.locked + pos.undecided);
  });

  it('computes the changes with periods(), at the household’s end date', () => {
    expect(truth.today).toBe(truth.household.household.endDate);
    const quarter = truth.value('quarter_change');
    const year = truth.value('year_change');
    expect(typeof quarter).toBe('number');
    expect(typeof year).toBe('number');
    expect(quarter).not.toBe(year);
  });

  it('resolves each holding’s accessibility through the pack chain', () => {
    for (const holding of truth.household.context.holdings) {
      const access = truth.value('holding_access', holding.name);
      expect(
        ['accessible', 'illiquid', 'locked', 'undecided', 'owed'].includes(String(access)),
        holding.name,
      ).toBe(true);
    }
  });

  it('answers every committed question without throwing, and matches its metric’s type', () => {
    for (const question of set.questions) {
      const value = truth.forQuestion(question);
      if (question.expected === null) expect(value).toBeNull();
      else expect(typeof value).toBe(typeof question.expected);
    }
  });
});

describe('a stale pin stops a run', () => {
  it('reports the question whose expected is no longer what core computes', () => {
    const changed = set.questions.map((question, index) =>
      index === 0 ? { ...question, expected: (question.expected as number) + 1 } : question,
    );
    const found = mismatches(changed, truth);
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(set.questions[0]?.id);
  });

  it('builds the same context from the household a second time (N11: deterministic)', () => {
    const household = readHousehold();
    const { packs, countries } = readContentDocs();
    const again = new GroundTruth(buildHousehold(household, packs, countries));
    expect(again.doc).toStrictEqual(truth.doc);
  });
});
