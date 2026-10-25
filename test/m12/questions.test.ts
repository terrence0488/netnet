import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { m12QuestionsSchema } from '@netnet/contracts';
import { checkQuestions, CONTENT_DIR } from '../../scripts/content-check';
import { readQuestions } from '../../ops/m12/src/questions';

/**
 * The question set (P4-T9, PRD M12): about thirty committed questions with `core`'s ground truth
 * beside each. The schema catches a malformed question, `content:check` catches a set that does
 * not match the household it asks about, and the runner refuses to start on either.
 */

const QUESTIONS_FILE = 'demo/m12-questions.json';
const HOUSEHOLD_FILE = 'demo/household.json';

type RawSet = {
  version: number;
  household: string;
  asOf: string;
  currency: string;
  questions: Record<string, unknown>[];
};

/** The committed set as plain JSON, so a test can break one thing at a time. */
function rawSet(): RawSet {
  return JSON.parse(readFileSync(join(CONTENT_DIR, QUESTIONS_FILE), 'utf8')) as RawSet;
}

/** A content directory holding the repository's household and `questions`. */
function contentWith(questions: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'm12-questions-'));
  mkdirSync(join(dir, 'demo'));
  copyFileSync(join(CONTENT_DIR, HOUSEHOLD_FILE), join(dir, HOUSEHOLD_FILE));
  writeFileSync(join(dir, QUESTIONS_FILE), JSON.stringify(questions));
  return dir;
}

/** Why `set` fails its schema, as one message for the test to match. */
function refusal(set: unknown): string {
  const parsed = m12QuestionsSchema.safeParse(set);
  return parsed.success ? '' : parsed.error.issues.map((issue) => issue.message).join(' | ');
}

describe('the committed question set', () => {
  const set = readQuestions();

  it('is about thirty questions with unique ids, for this household and its end date', () => {
    expect(set.questions.length).toBe(30);
    expect(new Set(set.questions.map((question) => question.id)).size).toBe(30);
    expect(set.household).toBe(HOUSEHOLD_FILE);
    expect(set.asOf).toBe('2026-09-30');
  });

  it('is what content:check validates', () => {
    expect(checkQuestions()).toStrictEqual([]);
  });

  it('asks every layer, and fabrication only as questions the data cannot answer', () => {
    const layers = new Set(set.questions.map((question) => question.layer));
    expect([...layers].sort()).toStrictEqual([
      'answer_shape',
      'arithmetic',
      'fabrication',
      'provenance',
      'semantics',
    ]);
    for (const question of set.questions.filter((q) => q.layer === 'fabrication')) {
      expect(question.metric).toBe('unknown');
      expect(question.expected).toBeNull();
    }
    for (const question of set.questions.filter((q) => q.metric === 'unknown')) {
      expect(question.layer).toBe('fabrication');
    }
  });
});

describe('the question schema', () => {
  it('refuses a metric it does not compute', () => {
    const set = rawSet();
    set.questions[0] = { ...set.questions[0], metric: 'vibes' };
    expect(refusal(set)).toMatch(/metric/);
  });

  it('refuses a numeric metric without a tolerance, and text with one', () => {
    const numeric = rawSet();
    delete numeric.questions[0]?.['tolerance'];
    expect(refusal(numeric)).toMatch(/tolerance/);

    const text = rawSet().questions.find((question) => question['metric'] === 'largest_holding');
    expect(text).toBeDefined();
    const set = rawSet();
    const index = set.questions.findIndex((question) => question['metric'] === 'largest_holding');
    set.questions[index] = { ...set.questions[index], tolerance: 1 };
    expect(refusal(set)).toMatch(/no tolerance/);
  });

  it('refuses a holding metric without a holding, and a holding on any other metric', () => {
    const without = rawSet();
    const holdingAt = without.questions.findIndex((q) => q['metric'] === 'holding_access');
    delete without.questions[holdingAt]?.['holding'];
    expect(refusal(without)).toMatch(/name it/);

    const withOne = rawSet();
    withOne.questions[0] = { ...withOne.questions[0], holding: 'Family home' };
    expect(refusal(withOne)).toMatch(/not about one holding/);
  });

  it('refuses an unknown question with a value, and a fabrication question that is not unknown', () => {
    const withValue = rawSet();
    const unknownAt = withValue.questions.findIndex((q) => q['metric'] === 'unknown');
    withValue.questions[unknownAt] = { ...withValue.questions[unknownAt], expected: 1 };
    expect(refusal(withValue)).toMatch(/no expected value/);

    const wrongLayer = rawSet();
    wrongLayer.questions[unknownAt] = { ...wrongLayer.questions[unknownAt], layer: 'arithmetic' };
    expect(refusal(wrongLayer)).toMatch(/fabrication/);
  });

  it('refuses duplicate ids and a set that is too small', () => {
    const duplicate = rawSet();
    duplicate.questions[1] = { ...duplicate.questions[1], id: duplicate.questions[0]?.['id'] };
    expect(refusal(duplicate)).toMatch(/already|another question has this id/i);

    const small = rawSet();
    small.questions = small.questions.slice(0, 10);
    expect(refusal(small)).toMatch(/at least 24/);
  });
});

describe('content:check on the question set', () => {
  it('refuses a set computed at another date or in another currency', () => {
    const set = rawSet();
    set.asOf = '2026-08-31';
    set.currency = 'USD';
    expect(
      checkQuestions(contentWith(set))
        .map((error) => error.path)
        .sort(),
    ).toStrictEqual(['asOf', 'currency']);
  });

  it('refuses a question about a holding the household does not have', () => {
    const set = rawSet();
    const index = set.questions.findIndex((question) => question['holding'] !== undefined);
    set.questions[index] = { ...set.questions[index], holding: 'A holding that is not there' };
    const errors = checkQuestions(contentWith(set));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe(`questions.${index}.holding`);
  });

  it('refuses a set that is not there, or not JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm12-questions-none-'));
    mkdirSync(join(dir, 'demo'));
    copyFileSync(join(CONTENT_DIR, HOUSEHOLD_FILE), join(dir, HOUSEHOLD_FILE));
    expect(checkQuestions(dir).map((error) => error.doc)).toStrictEqual([QUESTIONS_FILE]);

    writeFileSync(join(dir, QUESTIONS_FILE), '{ not json');
    expect(checkQuestions(dir)[0]?.message).toMatch(/^Cannot be read as JSON: /);
  });
});
