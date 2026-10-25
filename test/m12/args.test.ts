import { describe, expect, it } from 'vitest';
import { UsageError, parseOptions } from '../../ops/m12/src/args';
import {
  ALTERNATE_ANSWER_MODEL,
  ANSWER_MODEL,
  DEFAULT_SEED,
  MAX_RUNS,
} from '../../ops/m12/src/config';

/**
 * The command line (P4-T9's interface contract): `pnpm m12 --approve-spend <usd> [--model <id>]
 * [--runs <n>] [--seed <n>] [--dry-run]`. A wrong argument is refused before the harness starts
 * a server or counts a token, so a typo never becomes a paid run.
 */

const base = ['--approve-spend', '2'];

describe('the command line', () => {
  it('takes the approval, and defaults the rest', () => {
    expect(parseOptions(base)).toStrictEqual({
      approveSpend: 2,
      model: ANSWER_MODEL,
      runs: 1,
      seed: DEFAULT_SEED,
      dryRun: false,
    });
  });

  it('takes each option the contract names', () => {
    expect(
      parseOptions([
        '--approve-spend',
        '3.5',
        '--model',
        ALTERNATE_ANSWER_MODEL,
        '--runs',
        String(MAX_RUNS),
        '--seed',
        '7',
        '--dry-run',
      ]),
    ).toStrictEqual({
      approveSpend: 3.5,
      model: ALTERNATE_ANSWER_MODEL,
      runs: MAX_RUNS,
      seed: 7,
      dryRun: true,
    });
  });

  it('requires an approval in both paths, because the same gate runs', () => {
    expect(() => parseOptions(['--dry-run'])).toThrow(UsageError);
    expect(() => parseOptions([])).toThrow(/--approve-spend is required/);
  });

  it('refuses a spend that is not a positive amount', () => {
    for (const value of ['0', '-1', 'ten', '']) {
      expect(() => parseOptions(['--approve-spend', value])).toThrow(UsageError);
    }
  });

  it('refuses a model it does not price, and a run count outside 1–3', () => {
    expect(() => parseOptions([...base, '--model', 'claude-opus-5-5'])).toThrow(/--model accepts/);
    expect(() => parseOptions([...base, '--runs', '0'])).toThrow(UsageError);
    expect(() => parseOptions([...base, '--runs', '4'])).toThrow(UsageError);
    expect(() => parseOptions([...base, '--runs', '1.5'])).toThrow(UsageError);
    expect(() => parseOptions([...base, '--seed', '-1'])).toThrow(UsageError);
  });

  it('refuses an unknown flag, and answers --help with nothing to run', () => {
    expect(() => parseOptions([...base, '--spend'])).toThrow(UsageError);
    expect(parseOptions(['--help'])).toBeNull();
  });
});
