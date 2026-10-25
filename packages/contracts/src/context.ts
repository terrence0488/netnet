import { z } from 'zod';
import { ACCESSES } from './content';
import type { AccessBasis, HoldingIn, UserTypeIn, ValueIn } from './figures';
import { BASELINES } from './figures';

/**
 * The agent's context (architecture §7.5, PRD §2.4 and J8): what `core.compileContext` reads and
 * the document it returns, which is `get_financial_context`'s `outputSchema`. It states facts and
 * uncertainty, never what to do.
 */

/* ---------------------------------------------------------------- input */

/** An agent connection as the context needs it. Never its registered name (architecture §8). */
export interface ContextConnection {
  id: string;
  client: 'claude' | 'chatgpt' | 'other';
  /** The agent guide's name, for `claude` and `chatgpt`; the caller fills it from content. */
  guideName?: string;
}

/** A holding with its accessibility as applied (§6.7), never re-resolved against today's pack. */
export interface ContextHolding extends HoldingIn {
  accessReason: string | null;
  accessUntil: string | null;
  /** Null for a liability. */
  accessBasis: AccessBasis | null;
}

/** A value with the connection that wrote it, when an agent did. */
export interface ContextValue extends ValueIn {
  connectionId: string | null;
}

export interface ContextType extends UserTypeIn {
  id: string;
}

export interface ContextTag {
  id: string;
  name: string;
}

/** What `Ledger.context()` reads for `compileContext`. */
export interface ContextInput {
  baseCurrency: string;
  /** Every holding, archived ones included. */
  holdings: readonly ContextHolding[];
  /** Every value of those holdings. */
  values: readonly ContextValue[];
  types: readonly ContextType[];
  tags: readonly ContextTag[];
  /** The user's connections, revoked ones included (old values still name them). */
  connections: readonly ContextConnection[];
}

/* ---------------------------------------------------------------- output */

/** The document's size limit: its compact JSON, in UTF-8 bytes (8 KB). */
export const MAX_CONTEXT_BYTES = 8192;
/** The most holdings the document lists; the rest are summarised by type in `omitted`. */
export const MAX_CONTEXT_HOLDINGS = 25;
/** The most notes `picture.notes` carries. */
export const MAX_CONTEXT_NOTES = 5;

/** How current the picture is: more than half of the valued holdings stale is `mostly_stale`. */
export const FRESHNESS = ['empty', 'fresh', 'some_stale', 'mostly_stale'] as const;
export type Freshness = (typeof FRESHNESS)[number];

/** A listed holding's accessibility as applied, or `owed` for a liability. */
export const CONTEXT_ACCESSES = [...ACCESSES, 'undecided', 'owed'] as const;
export type ContextAccess = (typeof CONTEXT_ACCESSES)[number];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in the form YYYY-MM-DD.');
const currency = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code, such as "SGD".');
/** A decimal amount in major units. */
const amount = z.number();
/** A share of a whole (0.41) or a percent (1.21), to two decimal places. */
const ratio = z.number();
const count = z.int().nonnegative();
const text = z.string().min(1);

const answerGuideSchema = z.strictObject({
  for: text,
  use: text,
  never: text.exactOptional(),
  note: text.exactOptional(),
});

const changeSchema = z.strictObject({
  baseline: z.enum(BASELINES),
  /** The date measured from; null, with every figure, when there is nothing to compare. */
  since: date.nullable(),
  amount: amount.nullable(),
  /** Percent of the baseline's size; null when that is 0. */
  pct: ratio.nullable(),
});

const totalsSchema = z.strictObject({
  net_worth: amount,
  assets: amount,
  owed: amount,
  could_use: amount,
  sell_first: amount,
  locked: amount,
  /** Counts toward net worth, never toward `could_use` (PRD J2). */
  undecided: amount,
  /** `owed` over `could_use`; null when nothing could be used. */
  owed_to_could_use: ratio.nullable(),
  change: changeSchema,
});

const pictureSchema = z.strictObject({
  /** Holdings that are not archived. */
  holdings: count,
  /** Holdings whose latest value is older than their update cadence. */
  stale: count,
  /** Assets whose accessibility is not decided. */
  undecided: count,
  without_value: count,
  oldest_value_days: count.nullable(),
  freshness: z.enum(FRESHNESS),
  /** Fixed sentences filled with numbers and holding names only, most important first. */
  notes: z.array(text).max(MAX_CONTEXT_NOTES),
});

const exposureSchema = z.strictObject({
  /** Each currency's share of assets, largest first. */
  by_currency: z.array(z.strictObject({ currency, share: ratio })),
  /** The largest assets, each with its share of assets. */
  concentration: z.array(z.strictObject({ holding_id: text, name: text, share: ratio })),
});

const valueSchema = z.strictObject({
  /** In the value's own currency. */
  amount,
  currency,
  /** In the base currency, at the rate stored when the value was written. */
  base: amount,
  as_of: date,
  age_days: count,
  stale: z.boolean(),
  /** `web`, `system`, or `agent:<guide name>`, with `other` for an agent without a guide. */
  written_by: z.string().regex(/^(web|system|agent:.+)$/, 'Use web, system or agent:<name>.'),
});

/** What a type of holding is, from the pack: given once per type, not on every holding. */
const typeMeaningSchema = z.strictObject({
  /** As the holdings' `type` gives it. */
  type: text,
  meaning: text,
});

const holdingSchema = z.strictObject({
  id: text,
  name: text,
  /** The type's label in the current pack, or the user's own name for it; `types` says what it is. */
  type: text,
  tags: z.array(text),
  /** The holding's own currency, whether or not it has a value yet. */
  currency,
  access: z.enum(CONTEXT_ACCESSES),
  access_reason: text.nullable(),
  until: text.nullable(),
  /** The latest value on or before `as_of`; null when there is none. */
  value: valueSchema.nullable(),
  /** Its contribution to `totals.change`; negative for a liability when more is owed. */
  change: z.strictObject({ amount, pct: ratio.nullable() }).nullable(),
});

const omittedSchema = z.strictObject({
  holdings: count,
  /** The holdings not listed, by type, largest first. */
  by_type: z.array(
    z.strictObject({ type: text, holdings: z.int().positive(), assets: amount, owed: amount }),
  ),
  hint: text,
});

/**
 * Architecture §7.5's document, keys in its order. Amounts are in major units: totals and `base`
 * in `currency`, the document's base currency. At most `MAX_CONTEXT_BYTES` of JSON.
 */
export const financialContextSchema = z.strictObject({
  as_of: date,
  currency,
  /** Which figure answers which kind of question. */
  answer_guide: z.array(answerGuideSchema),
  totals: totalsSchema,
  picture: pictureSchema,
  exposure: exposureSchema,
  /** What each type in `holdings` is, once per type, in the order the holdings first use it. */
  types: z.array(typeMeaningSchema),
  /** Largest first (by base value, either way), at most `MAX_CONTEXT_HOLDINGS`. */
  holdings: z.array(holdingSchema).max(MAX_CONTEXT_HOLDINGS),
  omitted: omittedSchema,
});
export type FinancialContext = z.infer<typeof financialContextSchema>;
