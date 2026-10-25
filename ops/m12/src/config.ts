/**
 * The harness's fixed configuration (P4-T9): the models, what they cost, and the limits that keep
 * a run inside the Founder's approval (PRD M12, architecture §12 risk 9). It is the only place a
 * model id or a price appears; a prompt never carries either.
 *
 * The model ids are the brief's: the weakest current Claude answers at `low` effort, so a lift
 * cannot be the model's, and a stronger one judges at `high`. They are configuration, not yet
 * checked against the Models API: F22 (the key) is not set, so the check runs before the first
 * paid run (the brief's start step). `ALTERNATE_ANSWER_MODEL` is the second weak model `--model`
 * accepts, for a repeat on a different one.
 */

/** The answering model: the weakest current Claude, at `low` effort. */
export const ANSWER_MODEL = 'claude-haiku-5-5';
/** The second weak model `--model` accepts. */
export const ALTERNATE_ANSWER_MODEL = 'claude-haiku-4-5';
/** The judge: a stronger model, at `high` effort, because it grades blind. */
export const JUDGE_MODEL = 'claude-opus-5-5';

/** Every model `--model` accepts, in the order the usage names them. */
export const ANSWER_MODELS = [ANSWER_MODEL, ALTERNATE_ANSWER_MODEL] as const;
export type AnswerModel = (typeof ANSWER_MODELS)[number];

export const ANSWER_EFFORT = 'low';
export const JUDGE_EFFORT = 'high';

/** `output_config.effort`: how hard the model works, which the API takes beside the model. */
export type Effort = 'low' | 'high';

/** USD per million tokens, input and output. */
export interface Price {
  readonly input: number;
  readonly output: number;
}

/**
 * The per-token rates the estimate and the cap use, in USD per million tokens. Checked against
 * the Models API before the first paid run (F22): until then they are the published rates this
 * was written with, and the harness prints them with the estimate so a wrong one is visible.
 */
export const PRICING: Readonly<Record<string, Price>> = {
  [ANSWER_MODEL]: { input: 1, output: 5 },
  [ALTERNATE_ANSWER_MODEL]: { input: 0.8, output: 4 },
  [JUDGE_MODEL]: { input: 15, output: 75 },
};

/** The most tool rounds one question gets in the NetNet arm, before the answer is its last text. */
export const MAX_ROUNDS = 10;
/** The most tokens one answer or one judgement may take. */
export const MAX_TOKENS = 2048;

/** What the estimate assumes an answer and a judgement spend, before any is written. */
export const ASSUMED_OUTPUT_TOKENS = { answer: 700, judge: 600 };

export const DEFAULT_RUNS = 1;
/** Three runs are expected well under US$10; more is a different decision. */
export const MAX_RUNS = 3;
/** Fixed, so a run is reproducible and its order is recorded; `--seed` changes it. */
export const DEFAULT_SEED = 1;
/** How many pairs the blind sheet gives the Founder, per the brief. */
export const BLIND_PAIRS = 10;

/** What M12 counts as a win: NetNet takes at least this share of pairs (PRD M12). */
export const WIN_BAR = 0.8;

/** Where the harness reads the household and the question set, beside each other under content/. */
export const HOUSEHOLD_FILE = 'content/demo/household.json';
export const QUESTION_SET_FILE = 'content/demo/m12-questions.json';

/** Where a run's outputs go, under the package: only `report.md` is not gitignored. */
export const RUNS_DIR = 'ops/m12/runs';

/** The password the scratch database's app role gets; random per run, never printed. */
export const APP_PASSWORD_LENGTH = 32;
