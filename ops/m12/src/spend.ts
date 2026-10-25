import { PRICING } from './config';

/**
 * Spend (P4-T9, architecture §12 risk 9): before any call that costs, the harness counts the
 * tokens a dry pass would send, prices them from `config.PRICING`, prints the estimate, and runs
 * only with `--approve-spend` at or above it. The same figure is the cap: the run stops as soon
 * as what it has spent passes it. The arithmetic is plain numbers in USD and never hidden behind
 * a rounded figure until it is printed.
 */

/** Tokens one call used, as the API reports them. */
export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** USD a usage costs on `model`, from the per-million-token rates in the config. */
export function priceOf(model: string, usage: Usage): number {
  const price = PRICING[model];
  if (!price) throw new RangeError(`There is no price for "${model}" in config.PRICING.`);
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** What a run is expected to spend, and what it is expected to send, over every call. */
export interface Estimate {
  readonly usd: number;
  readonly calls: number;
  /** Per model: what the estimate assumed it would be asked and would answer. */
  readonly byModel: Readonly<Record<string, Usage>>;
}

/** The estimate over every call the run plans, priced per model. */
export function estimateCalls(
  calls: readonly { readonly model: string; readonly usage: Usage }[],
): Estimate {
  const byModel: Record<string, Usage> = {};
  let usd = 0;
  for (const { model, usage } of calls) {
    byModel[model] = addUsage(byModel[model] ?? ZERO_USAGE, usage);
    usd += priceOf(model, usage);
  }
  return { usd, calls: calls.length, byModel };
}

/** The run was not approved: nothing that costs may be sent. */
export class SpendRefused extends Error {
  override readonly name = 'SpendRefused';
}

/**
 * The gate: the approved figure must be at or above the estimate. At the estimate exactly it
 * runs; a cent below it does not. `dryRun` still prints the estimate and passes through the same
 * check — it spends nothing, but the same code path runs.
 */
export function requireApproval(estimateUsd: number, approvedUsd: number): void {
  if (!(approvedUsd >= estimateUsd)) {
    throw new SpendRefused(
      `The estimate is ${usd(estimateUsd)} and --approve-spend is ${usd(approvedUsd)}: ` +
        'approve at least the estimate, or nothing is sent.',
    );
  }
}

/** The cap was passed: the run stops, and says what it had spent when it did. */
export class SpendCapReached extends Error {
  override readonly name = 'SpendCapReached';
  readonly spentUsd: number;
  readonly capUsd: number;

  constructor(spentUsd: number, capUsd: number) {
    super(`Spend passed the approved ${usd(capUsd)}: stopped at ${usd(spentUsd)}.`);
    this.spentUsd = spentUsd;
    this.capUsd = capUsd;
  }
}

/** What the run has spent, and the cap it may not pass: checked after every call. */
export class Spend {
  readonly capUsd: number;
  private total = 0;

  constructor(capUsd: number) {
    this.capUsd = capUsd;
  }

  get spentUsd(): number {
    return this.total;
  }

  get exhausted(): boolean {
    return this.total > this.capUsd;
  }

  /**
   * Records what one call used, then throws `SpendCapReached` when the total has passed the cap:
   * the call has already been made and paid for, so the run stops after it, never before it is
   * counted.
   */
  record(model: string, usage: Usage): void {
    this.total += priceOf(model, usage);
    if (this.exhausted) throw new SpendCapReached(this.total, this.capUsd);
  }
}

/** A USD figure as the harness prints it: four places, so a small estimate is not "0.00". */
export function usd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
