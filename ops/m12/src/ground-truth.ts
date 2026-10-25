import type {
  FinancialContext,
  M12Metric,
  M12Question,
  Position,
  VersionedPack,
} from '@netnet/contracts';
import {
  compileContext,
  fromMinor,
  latestValues,
  periods,
  position,
  staleness,
} from '@netnet/core';
import { readHouseholdData, type Household } from './household';

/**
 * The ground truth (P4-T9, PRD M12): every figure a question asks for, computed from the demo
 * household by `core` alone — `position` for the totals, `periods` for the changes, and
 * `compileContext` for the exposure, the picture and each holding's meaning. The harness never
 * asks the app or the model what the answer is, so both arms are scored against the same
 * deterministic computation, and the question set commits that computation's result beside each
 * question so a change to content or to core is caught before a paid call.
 *
 * `asOf` is the household's end date, not the machine's today: the household is a fixed file, and
 * a run a month later must score the same figures.
 */

export type Truth = number | string | null;

/** A ratio or percent to two decimal places, half away from zero, never -0. */
function round2(x: number): number {
  const rounded = (Math.sign(x) * Math.round(Math.abs(x) * 100)) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** A share the context reports as a fraction (`0.3421`) as a percent (`34.21`). */
const asPercent = (share: number) => round2(share * 100);

/** The computed answer to one question, and the pieces it was computed from. */
export class GroundTruth {
  readonly household: Household;
  readonly today: string;
  readonly doc: FinancialContext;
  readonly position: Position;

  constructor(household: Household, today: string = household.household.endDate) {
    this.household = household;
    this.today = today;
    const { context, chain } = household;
    const live = context.holdings.filter((h) => !h.archived);
    this.position = position(live, latestValues(context.values, today));
    this.doc = compileContext(context, chain, today);
  }

  /** The household's base currency, which every amount is in. */
  get currency(): string {
    return this.household.household.baseCurrency;
  }

  /** One amount in minor units as major units of the base currency. */
  private major(minor: number): number {
    return Number(fromMinor(minor, this.currency));
  }

  /** One holding as the harness built it, with the accessibility the pack chain gave it. */
  private holdingOf(metric: M12Metric, holding: string | undefined) {
    if (holding === undefined) {
      throw new RangeError(`"${metric}" is about one holding, but the question names none.`);
    }
    const entry = this.household.context.holdings.find((h) => h.name === holding);
    if (entry === undefined) {
      throw new RangeError(`The household has no holding "${holding}".`);
    }
    return entry;
  }

  /** One holding's latest value in minor units of the base currency. */
  private latestOf(holding: string | undefined): number {
    const entry = this.holdingOf('holding_value', holding);
    const latest = latestValues(this.household.context.values, this.today).get(entry.id);
    if (latest === undefined) throw new RangeError(`"${holding}" has no value to report.`);
    return latest.baseMinor;
  }

  /** The value `core` computes for `metric`, about `holding` when the metric needs one. */
  value(metric: M12Metric, holding?: string): Truth {
    const { doc, position: pos } = this;
    switch (metric) {
      case 'net_worth':
        return this.major(pos.netWorth);
      case 'assets':
        return this.major(pos.assets);
      case 'owed':
        return this.major(pos.owed);
      case 'could_use':
        return this.major(pos.couldUse);
      case 'sell_first':
        return this.major(pos.sellFirst);
      case 'locked':
        return this.major(pos.locked);
      case 'undecided':
        return this.major(pos.undecided);
      case 'usd_share_pct': {
        const usd = doc.exposure.by_currency.find((c) => c.currency === 'USD');
        return usd === undefined ? 0 : asPercent(usd.share);
      }
      case 'largest_holding_share_pct': {
        const largest = doc.exposure.concentration[0];
        return largest === undefined ? 0 : asPercent(largest.share);
      }
      case 'quarter_change':
      case 'year_change': {
        const view = metric === 'quarter_change' ? 'quarterly' : 'yearly';
        const buckets = periods(
          this.household.context.values,
          this.household.context.holdings,
          view,
          this.today,
        );
        const last = [...buckets].reverse().find((bucket) => bucket.change !== null);
        if (last?.change === null || last?.change === undefined) {
          throw new RangeError(`The household has no ${view} change to report.`);
        }
        return this.major(last.change);
      }
      case 'undecided_count':
        return doc.picture.undecided;
      case 'without_value_count':
        return doc.picture.without_value;
      case 'largest_holding': {
        const largest = doc.exposure.concentration[0];
        if (largest === undefined) throw new RangeError('The household has no assets to rank.');
        return largest.name;
      }
      case 'stale_holding': {
        const stale = doc.holdings
          .filter((h) => h.value?.stale === true)
          .sort((a, b) => (b.value?.age_days ?? 0) - (a.value?.age_days ?? 0));
        const oldest = stale[0];
        if (oldest === undefined) throw new RangeError('The household has no stale value.');
        return oldest.name;
      }
      case 'undecided_holding': {
        // The picture counts it from every holding; the name comes from the ones core resolved,
        // largest first, so an account with several still gets one answer.
        const latest = latestValues(this.household.context.values, this.today);
        const undecided = this.household.context.holdings
          .filter((h) => h.kind !== 'liability' && h.access === 'undecided')
          .sort(
            (a, b) =>
              Math.abs(latest.get(b.id)?.baseMinor ?? 0) -
                Math.abs(latest.get(a.id)?.baseMinor ?? 0) || a.name.localeCompare(b.name),
          );
        const first = undecided[0];
        if (first === undefined) throw new RangeError('The household has no undecided holding.');
        return first.name;
      }
      case 'holding_value':
        return this.major(this.latestOf(holding));
      case 'holding_access':
        return this.holdingOf(metric, holding).access ?? 'undecided';
      case 'holding_staleness': {
        const entry = this.holdingOf(metric, holding);
        const latest = latestValues(this.household.context.values, this.today).get(entry.id);
        if (latest === undefined) throw new RangeError(`"${holding}" has no value to judge.`);
        return staleness(entry, latest, this.today, this.household.chain).stale ? 'stale' : 'fresh';
      }
      case 'holding_until': {
        const until = this.holdingOf(metric, holding).accessUntil;
        if (until === null) {
          throw new RangeError(`"${holding}" has no "until": its accessibility does not name one.`);
        }
        return until;
      }
      case 'unknown':
        return null;
      default: {
        const unreachable: never = metric;
        throw new RangeError(`No ground truth for "${String(unreachable)}".`);
      }
    }
  }

  /** The truth for one question, from its metric and holding. */
  forQuestion(question: Pick<M12Question, 'metric' | 'holding'>): Truth {
    return this.value(question.metric, question.holding);
  }

  /** The pack chain the context was compiled with, for a caller that wants to say so. */
  chain(): readonly VersionedPack[] {
    return this.household.chain;
  }
}

/** One question whose committed ground truth is not what `core` computes now. */
export interface Mismatch {
  readonly id: string;
  readonly expected: Truth;
  readonly computed: Truth;
}

/**
 * Every question whose committed `expected` differs from what `core` gives now. Numbers compare
 * exactly (they are the same computation), text exactly: a difference means the household, the
 * packs or `core` changed under a committed set, so the run must not start.
 */
export function mismatches(
  questions: readonly Pick<M12Question, 'id' | 'metric' | 'holding' | 'expected'>[],
  truth: GroundTruth,
): Mismatch[] {
  const found: Mismatch[] = [];
  for (const question of questions) {
    const computed = truth.forQuestion(question);
    const same =
      typeof computed === 'number' && typeof question.expected === 'number'
        ? Math.abs(computed - question.expected) <= 1e-9 * Math.max(1, Math.abs(computed))
        : computed === question.expected;
    if (!same) found.push({ id: question.id, expected: question.expected, computed });
  }
  return found;
}

/** The household's ground truth from its files: what a run and its pinned test both build. */
export function readGroundTruth(root?: string): GroundTruth {
  return new GroundTruth(readHouseholdData(root));
}
