import { parseArgs } from 'node:util';
import { ANSWER_MODELS, DEFAULT_RUNS, DEFAULT_SEED, MAX_RUNS, type AnswerModel } from './config';

/**
 * `pnpm m12 --approve-spend <usd> [--model <id>] [--runs <n>] [--seed <n>] [--dry-run]`
 * (P4-T9's interface contract). Nothing here touches the network or the filesystem: a wrong
 * argument is refused before the harness starts a server or counts a token.
 */

export const USAGE =
  'Usage: pnpm m12 --approve-spend <usd> [--model <id>] [--runs <n>] [--seed <n>] [--dry-run]';

/** The run's options, once parsed and checked. */
export interface Options {
  /** The most the run may spend, in USD: approval and cap in one figure (the brief's gate). */
  readonly approveSpend: number;
  readonly model: AnswerModel;
  readonly runs: number;
  readonly seed: number;
  /** Run both arms against a fake model and a fake judge: no key, no network, no spend. */
  readonly dryRun: boolean;
}

/** A command line that cannot run: the message says what to change. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

const integer = (name: string, text: string, min: number, max: number): number => {
  if (!/^\d+$/.test(text)) throw new UsageError(`${name} takes a whole number, not "${text}".`);
  const value = Number(text);
  if (value < min || value > max) {
    throw new UsageError(`${name} must be between ${min} and ${max}: got ${text}.`);
  }
  return value;
};

/**
 * The options from the command line; `null` when `--help` was asked for. `--approve-spend` is
 * required in both paths: the dry run spends nothing, but the same gate runs before any call, so
 * the estimate is always printed against an explicit figure.
 */
export function parseOptions(args: readonly string[]): Options | null {
  let values: {
    'approve-spend'?: string | undefined;
    model?: string | undefined;
    runs?: string | undefined;
    seed?: string | undefined;
    'dry-run'?: boolean | undefined;
    help?: boolean | undefined;
  };
  try {
    values = parseArgs({
      args: [...args],
      options: {
        'approve-spend': { type: 'string' },
        model: { type: 'string' },
        runs: { type: 'string' },
        seed: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    }).values;
  } catch {
    throw new UsageError(USAGE);
  }
  if (values.help) return null;

  const approved = values['approve-spend'];
  if (approved === undefined) throw new UsageError(`--approve-spend is required. ${USAGE}`);
  const approveSpend = Number(approved);
  if (!Number.isFinite(approveSpend) || approveSpend <= 0) {
    throw new UsageError(`--approve-spend takes a positive amount in USD, not "${approved}".`);
  }

  const model = values.model ?? ANSWER_MODELS[0];
  if (!ANSWER_MODELS.some((known) => known === model)) {
    throw new UsageError(`--model accepts ${ANSWER_MODELS.join(' or ')}: got "${model}".`);
  }

  return {
    approveSpend,
    model: model as AnswerModel,
    runs: values.runs === undefined ? DEFAULT_RUNS : integer('--runs', values.runs, 1, MAX_RUNS),
    seed: values.seed === undefined ? DEFAULT_SEED : integer('--seed', values.seed, 0, 2 ** 31 - 1),
    dryRun: values['dry-run'] === true,
  };
}
