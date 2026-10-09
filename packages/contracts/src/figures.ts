import type { Access, Outcome, Pack, Universal } from './content';
import type { ErrorCode } from './errors';

/**
 * What `packages/core` computes figures from and returns (architecture §7.9), shared by the web
 * app, the API and native. Amounts are integers in a currency's minor unit; totals are in the
 * ledger's base currency, from each value's stored `baseMinor` (PRD J2, J11). Dates are value
 * dates, `YYYY-MM-DD`.
 */

/* ---------------------------------------------------------------- inputs */

export const HOLDING_KINDS = ['asset', 'liability'] as const;
export type HoldingKind = (typeof HOLDING_KINDS)[number];

/** A holding's accessibility: the three outcomes, or not yet decided (PRD J2). */
export type HoldingAccess = Access | 'undecided';

export const VALUE_SOURCES = ['web', 'agent', 'system'] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export interface HoldingIn {
  id: string;
  name: string;
  kind: HoldingKind;
  typeId: string;
  /** The universal type behind `typeId`. */
  universal: Universal;
  currency: string;
  /** The holding's own update cadence, or null to follow the pack chain (J9). */
  cadenceDays: number | null;
  archived: boolean;
  /** Null for a liability. */
  access: HoldingAccess | null;
  tagIds: readonly string[];
}

export interface ValueIn {
  id: string;
  holdingId: string;
  /** The value date, never the time it was entered. */
  date: string;
  amountMinor: number;
  currency: string;
  /** The conversion into the base currency, stored when the value was written. */
  baseMinor: number;
  source: ValueSource;
  clientName: string | null;
}

/** A user's type, as `typeLabel` names it: no name is stored until the user renames it. */
export interface UserTypeIn {
  universal: Universal;
  packTypeKey: string | null;
  customName: string | null;
}

/** A pack together with the published version it was read at, as `resolveAccess` records it. */
export type VersionedPack = Pack & { version: number };

/** The answer that leaves a holding undecided (architecture §7.4, `access_answer`). */
export const NOT_SURE = 'not_sure';

/** What Home's and Insights' filters keep (PRD J4, J11). */
export interface HoldingFilter {
  show?: 'all' | 'assets' | 'liabilities';
  /** Show only these types. */
  typeIds?: readonly string[];
  /** Show only holdings with these tags: any of them, or all with `tagMode: 'all'`. */
  tagIds?: readonly string[];
  tagMode?: TagMode;
  /** Don't show these types. */
  hideTypeIds?: readonly string[];
  /** Don't show holdings with these tags: any of them, or all with `hideTagMode: 'all'`. */
  hideTagIds?: readonly string[];
  hideTagMode?: TagMode;
  /** Don't show these holdings (Insights' exclusions). */
  hideHoldingIds?: readonly string[];
  /** Keep archived holdings too (J4's archived inclusion); left out by default. */
  includeArchived?: boolean;
}

export type TagMode = 'any' | 'all';

/** A series runs from `from` (by default the earliest value) to `to`, both inclusive. */
export interface DateRange {
  from?: string;
  to: string;
}

export const INTERVALS = ['day', 'month', 'quarter', 'year'] as const;
export type Interval = (typeof INTERVALS)[number];

export const GROUP_BYS = ['none', 'type', 'access', 'currency'] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

/** PRD J4's comparison baselines. */
export const BASELINES = [
  'initial',
  'last_update',
  'last_month',
  'last_quarter',
  'year_start',
  'last_year',
] as const;
export type Baseline = (typeof BASELINES)[number];

/** What a new holding is compared with existing holdings on (architecture §7.4). */
export type HoldingDraft = Pick<HoldingIn, 'name' | 'kind' | 'currency' | 'universal'>;

/* ---------------------------------------------------------------- outputs */

/** A typed error a `core` function returns, with a message naming the allowed form. */
export interface Err {
  code: Extract<ErrorCode, 'VALIDATION_FAILED' | 'OUT_OF_RANGE' | 'CURRENCY_UNSUPPORTED'>;
  message: string;
}

/**
 * Why a holding has its accessibility, stored with it (`access_basis`, architecture §6.3).
 * `via: 'undecided'` with `answer: 'not_sure'` is the user's "Not sure"; with `answer: null`,
 * the type's question was not answered.
 */
export interface AccessBasis {
  via: 'default' | 'answer' | 'undecided';
  /** The pack that supplied the default or the question. */
  pack: string;
  pack_version: number;
  /** The universal type whose question was answered (`other` to override a default). */
  question: Universal | null;
  answer: string | null;
}

export type AccessQuestion = NonNullable<Pack['questions'][Universal]>;

/** What applies to a universal type in a pack chain: a default, or a question to ask. */
export interface AccessRule {
  /** The outcome applied when nothing is asked, or null when the type needs an answer. */
  default: Outcome | null;
  /** The question: the type's own, or (with a default, or none) the `other` question. */
  questionKey: Universal;
  question: AccessQuestion;
}

export type AccessOutcome = (Outcome | { access: 'undecided' }) & { basis: AccessBasis };

/** Where a holding's value counts in the position (architecture §7.5's totals). */
export const ACCESS_BUCKETS = ['could_use', 'sell_first', 'locked', 'undecided', 'owed'] as const;
export type AccessBucket = (typeof ACCESS_BUCKETS)[number];

/** The position, in base-currency minor units. `assets` = the four asset buckets' sum. */
export interface Position {
  netWorth: number;
  assets: number;
  owed: number;
  couldUse: number;
  sellFirst: number;
  locked: number;
  /** Counts toward net worth, never toward what could be used (PRD J2). */
  undecided: number;
}

export interface Point {
  /** The bucket's last day, or the range's end in the last bucket. */
  date: string;
  /** Net worth on that date: assets minus liabilities. */
  total: number;
  /** The total split by type id, access bucket or currency; the groups sum to `total`. */
  groups?: Record<string, number>;
  /** Some holding counted here had no value dated inside this bucket (PRD J11). */
  carried: boolean;
}

/** A change against a baseline. All null when the series offers nothing to compare. */
export interface Change {
  baseline: Baseline;
  /** The date of the point the change is measured from. */
  since: string | null;
  amount: number | null;
  /** Percent of the baseline's size; null when the baseline total is 0. */
  pct: number | null;
}

export interface Staleness {
  stale: boolean;
  /** Days since the latest value's date. */
  days: number;
}

/** A likely duplicate of a new holding (`LIKELY_DUPLICATE`, architecture §7.5). */
export interface Candidate {
  id: string;
  name: string;
  latest: { date: string; amountMinor: number; currency: string } | null;
}
