import { z } from 'zod';
import { universalSchema, type Universal } from './content';
import type { EventProps } from './events';
import {
  BASELINES,
  GROUP_BYS,
  HOLDING_KINDS,
  INTERVALS,
  PERIOD_VIEWS,
  type AccessBasis,
  type Baseline,
  type GroupBy,
  type HoldingAccess,
  type HoldingKind,
  type Interval,
  type Period,
  type PeriodView,
  type Point,
  type Staleness,
  type ValueSource,
} from './figures';

/**
 * The Ledger's inputs and outputs (architecture §7.3), shared by REST (§7.2) and MCP (§7.4): one
 * implementation behind both, so the web and an agent can do the same things and get the same
 * answers (PRD J6). Field names are camelCase; MCP's snake_case parameters map onto them one to
 * one. Amounts come in as decimals in major units (strings, or numbers) and go out as integers in
 * the currency's minor unit, which `core` reads (CONVENTIONS §5). Dates are `YYYY-MM-DD` value
 * dates; instants are ISO-8601 UTC.
 */

/* ---------------------------------------------------------------- limits */

/** Holding, type and tag names (PRD J6). */
export const MAX_NAME_LENGTH = 120;
/** Tags on one holding. */
export const MAX_TAGS_PER_HOLDING = 20;
/** Items in one `recordValues` call (architecture §7.4, `record_values`). */
export const MAX_VALUES_PER_CALL = 200;
/** A page of holdings (`list_holdings`). */
export const MAX_HOLDINGS_PAGE = 100;
/** A page of a holding's values (`get_holding`'s `values_limit`). */
export const MAX_VALUES_PAGE = 500;
/** Periods in one `get_period_changes` answer (architecture §7.4); 12 when left out. */
export const MAX_PERIODS = 24;
export const DEFAULT_PERIODS = 12;
/** Drivers per period (`get_period_changes`' `drivers`); 5 when left out. */
export const MAX_DRIVERS = 25;
export const DEFAULT_DRIVERS = 5;
/** A page of the activity log (`list_activity`). */
export const MAX_ACTIVITY_PAGE = 100;
/** Ids in one filter list. */
const MAX_FILTER_IDS = 500;
/** The longest custom cadence: ten years. */
const MAX_CADENCE_DAYS = 3650;

/* ---------------------------------------------------------------- formats */

/** An id such as `hld_01J…`. Any string is looked up; one that is not there is NOT_FOUND. */
const id = z
  .string({ error: 'Give the id as a string, such as "hld_01J…".' })
  .min(1, 'Give the id, such as "hld_01J…".')
  .max(64, 'An id is at most 64 characters.');

const name = z
  .string({ error: 'Give the name as text.' })
  .trim()
  .min(1, 'Give a name; it cannot be blank.')
  .max(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters.`);

/**
 * A decimal amount in major units, as a string (`"1234.56"`) or a number. Its precision and size
 * are checked against the currency it is in, which may be the holding's (`core.toMinor`).
 */
const amount = z.union([z.string(), z.number()], {
  error: 'Give the amount as a decimal number in major units, such as "1234.56".',
});

/** An ISO 4217 code; lower case is accepted and raised. */
const currency = z
  .string({ error: 'Give the currency as a three-letter ISO 4217 code, such as "USD".' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a three-letter ISO 4217 code, such as "USD".');

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in the form `YYYY-MM-DD`. */
function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = m === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
  return m >= 1 && m <= 12 && d >= 1 && d <= days;
}

const date = z
  .string({ error: 'Give the date as YYYY-MM-DD, such as "2026-08-31".' })
  .refine(isCalendarDate, 'Use a calendar date in the form YYYY-MM-DD, such as "2026-08-31".');

const RATE = /^\d+(\.\d+)?$/;

/**
 * An exchange rate a caller supplies (architecture §6.6), as a statement shows it: 1 unit of the
 * value's currency = `rate` units of the base currency. A positive decimal, kept as a string.
 */
const fxRate = z
  .union([z.string(), z.number()], {
    error: 'Give the rate as a positive decimal, such as "1.3456".',
  })
  .transform((r) => (typeof r === 'number' ? String(r) : r.trim()))
  .refine(
    (r) => RATE.test(r) && /[1-9]/.test(r) && r.length <= 32,
    'Give the rate as a positive decimal, such as "1.3456": 1 of the value’s currency in the base currency.',
  );

/**
 * An accessibility answer (`access_answer`, the same on web and MCP): an answer id from the
 * question for the holding's type, or from the `other` question to override a type's default, or
 * `"not_sure"` (undecided). Left out, the type's default applies.
 */
export const accessAnswerSchema = z
  .string({ error: 'Give an answer id from the question for this type, or "not_sure".' })
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Give an answer id from the question for this type, such as "yes", or "not_sure".',
  );
export type AccessAnswer = z.infer<typeof accessAnswerSchema>;
const accessAnswer = accessAnswerSchema;

const ids = (max: number) =>
  z.array(id, { error: 'Give a list of ids.' }).max(max, `Give at most ${max} ids.`);

/* ---------------------------------------------------------------- inputs */

export const VIAS = ['guided', 'form'] as const;
export type Via = (typeof VIAS)[number];

/** A holding's first value, written with it. Its currency is the holding's. */
export const openingValueSchema = z.strictObject({
  amount,
  /** Defaults to the user's today. */
  date: date.optional(),
  fxRate: fxRate.optional(),
});

/**
 * `createHolding` (`POST /api/holdings`, `create_holding`). The type is `typeId`, or `universal`
 * for the user's type of that universal type. `access` is the answer to the type's question, or to
 * the `other` question to override the type's default, or `"not_sure"`; left out, the type's
 * default applies (or undecided, when the type asks). Liabilities have no accessibility.
 */
export const createHoldingSchema = z
  .strictObject({
    name,
    kind: z.enum(HOLDING_KINDS, { error: 'Use "asset" or "liability".' }),
    typeId: id.optional(),
    universal: universalSchema.optional(),
    currency,
    tagIds: ids(MAX_TAGS_PER_HOLDING).optional(),
    access: accessAnswer.optional(),
    opening: openingValueSchema.optional(),
    /** How the web app's Add flow created it (`holding_created {via}`); never from an agent. */
    via: z.enum(VIAS).optional(),
    /** Create it even though it looks like an existing holding (`LIKELY_DUPLICATE`). */
    allowDuplicate: z.boolean().optional(),
  })
  .refine((h) => (h.typeId === undefined) !== (h.universal === undefined), {
    path: ['typeId'],
    message: 'Give typeId, or universal for your type of that universal type, but not both.',
  });
export type CreateHolding = z.input<typeof createHoldingSchema>;

/**
 * `updateHolding` (`PATCH /api/holdings/:id`, `update_holding`). `access: null` goes back to the
 * type's default; `cadenceDays: null` follows the pack again; `archived` archives or unarchives.
 */
export const holdingPatchSchema = z.strictObject({
  name: name.optional(),
  typeId: id.optional(),
  tagIds: ids(MAX_TAGS_PER_HOLDING).optional(),
  access: accessAnswer.nullable().optional(),
  cadenceDays: z
    .int('Give the cadence as a whole number of days.')
    .min(1, 'Give at least 1 day.')
    .max(MAX_CADENCE_DAYS, `Give at most ${MAX_CADENCE_DAYS} days.`)
    .nullable()
    .optional(),
  archived: z.boolean().optional(),
});
export type HoldingPatch = z.input<typeof holdingPatchSchema>;

/**
 * One value for `recordValues` (`record_values`). The currency defaults to the holding's, the
 * date to the user's today; a date may be at most a day after it.
 */
export const newValueSchema = z.strictObject({
  holdingId: id,
  amount,
  date: date.optional(),
  currency: currency.optional(),
  fxRate: fxRate.optional(),
});
export type NewValue = z.input<typeof newValueSchema>;

export const newValuesSchema = z
  .array(newValueSchema, { error: 'Give a list of values.' })
  .min(1, `Give 1 to ${MAX_VALUES_PER_CALL} values.`)
  .max(MAX_VALUES_PER_CALL, `Give 1 to ${MAX_VALUES_PER_CALL} values; split a longer list.`);

/** `updateValue` (`PATCH /api/values/:id`, `update_value`). `fxRate: null` drops a given rate. */
export const valuePatchSchema = z.strictObject({
  amount: amount.optional(),
  date: date.optional(),
  currency: currency.optional(),
  fxRate: fxRate.nullable().optional(),
});
export type ValuePatch = z.input<typeof valuePatchSchema>;

/** `upsertType` (`upsert_type`): without `id`, a new type of `universal`; with it, a rename. */
export const typeInputSchema = z
  .strictObject({
    id: id.optional(),
    name,
    universal: universalSchema.optional(),
  })
  .refine((t) => t.id !== undefined || t.universal !== undefined, {
    path: ['universal'],
    message: 'Give the universal type a new type means, such as "cash".',
  });
export type TypeInput = z.input<typeof typeInputSchema>;

/** `upsertTag` (`upsert_tag`): without `id`, a new tag; with it, a rename. */
export const tagInputSchema = z.strictObject({ id: id.optional(), name });
export type TagInput = z.input<typeof tagInputSchema>;

const tagMode = z.enum(['any', 'all']);

/** A saved filter (PRD J4's Show Only and Don't Show, J11's filters and exclusions). */
export const holdingFilterSchema = z.strictObject({
  show: z.enum(['all', 'assets', 'liabilities']).optional(),
  typeIds: ids(MAX_FILTER_IDS).optional(),
  tagIds: ids(MAX_FILTER_IDS).optional(),
  tagMode: tagMode.optional(),
  hideTypeIds: ids(MAX_FILTER_IDS).optional(),
  hideTagIds: ids(MAX_FILTER_IDS).optional(),
  hideTagMode: tagMode.optional(),
  hideHoldingIds: ids(MAX_FILTER_IDS).optional(),
  /** J4's archived inclusion: archived holdings join the figures and the list. */
  includeArchived: z.boolean().optional(),
});
export type SavedFilter = z.output<typeof holdingFilterSchema>;

/**
 * Insights' Don't Show list (PRD J11): the holdings, types and tags dropped from Insights
 * figures only. It is its own pref key so the screen can keep it apart from the filter.
 */
export const insightsExclusionsSchema = z.strictObject({
  holdingIds: ids(MAX_FILTER_IDS).optional(),
  typeIds: ids(MAX_FILTER_IDS).optional(),
  tagIds: ids(MAX_FILTER_IDS).optional(),
});
export type SavedExclusions = z.output<typeof insightsExclusionsSchema>;

/** How Home lists holdings (the prototype's Sort By). */
export const HOLDING_SORTS = [
  'name',
  'updated',
  'value_desc',
  'value_asc',
  'type',
  'change_pct',
  'change_value',
] as const;
export type HoldingSort = (typeof HOLDING_SORTS)[number];

/** `setPrefs` (`PATCH /api/prefs`): each key given is set, or cleared with `null`. */
export const prefsPatchSchema = z.strictObject({
  homeFilter: holdingFilterSchema.nullable().optional(),
  insightsFilter: holdingFilterSchema.nullable().optional(),
  insightsExclusions: insightsExclusionsSchema.nullable().optional(),
  baseline: z.enum(BASELINES).nullable().optional(),
  sort: z.enum(HOLDING_SORTS).nullable().optional(),
});
export type PrefsPatch = z.input<typeof prefsPatchSchema>;

/** The prefs that are set. */
export interface Prefs {
  homeFilter?: SavedFilter;
  insightsFilter?: SavedFilter;
  insightsExclusions?: SavedExclusions;
  baseline?: Baseline;
  sort?: HoldingSort;
}

export const PREF_KEYS = [
  'homeFilter',
  'insightsFilter',
  'insightsExclusions',
  'baseline',
  'sort',
] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

const cursor = z.string().min(1).max(200);

/** A page request: an opaque cursor from the previous page, and a page size. */
export const pageReqSchema = z.strictObject({
  cursor: cursor.optional(),
  limit: z
    .int('Give the limit as a whole number.')
    .min(1, 'Give a limit of at least 1.')
    .max(MAX_VALUES_PAGE, `Give a limit of at most ${MAX_VALUES_PAGE}.`)
    .optional(),
});
export type PageReq = z.input<typeof pageReqSchema>;

/** `listHoldings` (`list_holdings`). `query` matches names; `archived` defaults to `exclude`. */
export const holdingQuerySchema = z.strictObject({
  query: z.string().trim().max(MAX_NAME_LENGTH).optional(),
  typeIds: ids(MAX_FILTER_IDS).optional(),
  tagIds: ids(MAX_FILTER_IDS).optional(),
  archived: z.enum(['exclude', 'include', 'only']).optional(),
  staleOnly: z.boolean().optional(),
  cursor: cursor.optional(),
  limit: z
    .int('Give the limit as a whole number.')
    .min(1, 'Give a limit of at least 1.')
    .max(MAX_HOLDINGS_PAGE, `Give a limit of at most ${MAX_HOLDINGS_PAGE}.`)
    .optional(),
});
export type HoldingQuery = z.input<typeof holdingQuerySchema>;

/**
 * `activity` (`GET /api/activity`, `list_activity`): the audit log, newest first. `batchId`
 * filters to one agent turn.
 */
export const activityQuerySchema = z.strictObject({
  cursor: cursor.optional(),
  limit: z
    .int('Give the limit as a whole number.')
    .min(1, 'Give a limit of at least 1.')
    .max(MAX_ACTIVITY_PAGE, `Give a limit of at most ${MAX_ACTIVITY_PAGE}.`)
    .optional(),
  batchId: id.optional(),
});
export type ActivityQuery = z.input<typeof activityQuerySchema>;

/** `undo` (`undo`): exactly one of an entry and a whole agent turn. */
export const undoTargetSchema = z.union(
  [z.strictObject({ entryId: id }), z.strictObject({ batchId: id })],
  { error: 'Give entryId for one entry, or batchId for a whole agent turn, but not both.' },
);
export type UndoTarget = z.input<typeof undoTargetSchema>;

/** `history` (`get_net_worth_history`). `to` defaults to today, `interval` to `month`. */
export const historyQuerySchema = z
  .strictObject({
    from: date.optional(),
    to: date.optional(),
    interval: z.enum(INTERVALS).optional(),
    groupBy: z.enum(GROUP_BYS).optional(),
    typeIds: ids(MAX_FILTER_IDS).optional(),
    tagIds: ids(MAX_FILTER_IDS).optional(),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    path: ['from'],
    message: 'Give a from date on or before the to date.',
  });
export type HistoryQuery = z.input<typeof historyQuerySchema>;

/**
 * `periods` (`get_period_changes`): the newest `periods` calendar periods in `view`, each with
 * its top `drivers` contributors.
 */
export const periodQuerySchema = z.strictObject({
  view: z.enum(PERIOD_VIEWS, { error: 'Use "monthly", "quarterly" or "yearly".' }),
  periods: z
    .int('Give the periods as a whole number.')
    .min(1, 'Give at least 1 period.')
    .max(MAX_PERIODS, `Give at most ${MAX_PERIODS} periods.`)
    .optional(),
  drivers: z
    .int('Give the drivers as a whole number.')
    .min(1, 'Give at least 1 driver.')
    .max(MAX_DRIVERS, `Give at most ${MAX_DRIVERS} drivers.`)
    .optional(),
});
export type PeriodQuery = z.input<typeof periodQuerySchema>;

/**
 * A pack chain by reference: the country's pack (when there is one), then generic, each at a
 * published version. The web app fetches each once (`GET /api/content/pack/:key@:version`).
 */
export const packRefSchema = z
  .array(
    z.strictObject({
      key: z
        .string()
        .regex(
          /^(generic|[a-z]{2})$/,
          'Use "generic" or a lowercase ISO 3166-1 code, such as "sg".',
        ),
      version: z.int('Give the version as a whole number.').min(1, 'Versions start at 1.'),
    }),
    { error: 'Give the pack chain as a list of {key, version}.' },
  )
  .min(1, 'Give the pack chain: the country’s pack (if any), then generic.')
  .max(2, 'A pack chain is the country’s pack (if any), then generic.');

/** A published pack version. */
export interface PackVersion {
  key: string;
  version: number;
}

export type PackRef = readonly PackVersion[];

/* ---------------------------------------------------------------- outputs */

/** A user's type. No name is stored until the user renames it, so labels follow the pack. */
export interface UserType {
  id: string;
  universal: Universal;
  /** The pack's type key, such as `car_loan`; null for a universal or custom type. */
  packTypeKey: string | null;
  customName: string | null;
  sort: number;
  archived: boolean;
}

export interface Tag {
  id: string;
  name: string;
  sort: number;
}

/** A holding as stored: its accessibility outcome, reason and basis are kept as applied (§6.7). */
export interface Holding {
  id: string;
  name: string;
  kind: HoldingKind;
  typeId: string;
  currency: string;
  /** Null follows the pack chain (J9). */
  cadenceDays: number | null;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  rowVersion: number;
  /** Null for a liability. */
  access: HoldingAccess | null;
  accessReason: string | null;
  accessUntil: string | null;
  accessBasis: AccessBasis | null;
  tagIds: string[];
}

export const VALUE_FX_SOURCES = ['ecb', 'fallback', 'same', 'user', 'agent'] as const;
export type ValueFxSource = (typeof VALUE_FX_SOURCES)[number];

/** A value with its provenance and the conversion stored when it was written (§6.6). */
export interface Value {
  id: string;
  holdingId: string;
  date: string;
  amountMinor: number;
  currency: string;
  baseMinor: number;
  baseCurrency: string;
  /** 1 of `currency` in `baseCurrency`, in major units: the form a statement shows. */
  fxRate: string;
  fxRateDate: string | null;
  fxSource: ValueFxSource;
  source: ValueSource;
  /** The agent's name as shown: untrusted text, escaped wherever it is shown. */
  clientName: string | null;
  connectionId: string | null;
  batchId: string | null;
  enteredAt: string;
  updatedAt: string;
  rowVersion: number;
}

/** A value in the snapshot (§7.2): `[date, amountMinor, currency, baseMinor, source, clientName, id]`. */
export type ValueTuple = [
  date: string,
  amountMinor: number,
  currency: string,
  baseMinor: number,
  source: ValueSource,
  clientName: string | null,
  id: string,
];

/** `GET /api/snapshot`: everything the web app computes figures from, once (§7.2). */
export interface Snapshot {
  /** The ETag: up by one on every write. */
  dataVersion: number;
  baseCurrency: string;
  /** The pack chain labels and defaults follow. */
  packRef: PackRef;
  prefs: Prefs;
  types: UserType[];
  tags: Tag[];
  holdings: Holding[];
  /** Each holding's values, oldest first, keyed by holding id. */
  values: Record<string, ValueTuple[]>;
}

/** A holding as listed: its type, its latest value and how old that is. */
export interface HoldingView extends Holding {
  universal: Universal;
  /** The type's name: the user's own, else the current pack's label. */
  typeLabel: string;
  /** The latest value by date, or null when it has none. */
  latest: Value | null;
  /** Null when it has no value. */
  staleness: Staleness | null;
}

/** A holding with a page of its values, newest first. */
export interface HoldingDetail extends HoldingView {
  values: Page<Value>;
}

/** Net worth over time, in the base currency's minor units. */
export interface Series {
  currency: string;
  interval: Interval;
  groupBy: GroupBy;
  points: Point[];
}

/** Change per calendar period, newest first, in the base currency's minor units. */
export interface PeriodTable {
  currency: string;
  view: PeriodView;
  periods: Period[];
}

export interface Page<T> {
  items: T[];
  /** Pass as `cursor` for the next page; null on the last. */
  nextCursor: string | null;
}

/** Who made an activity entry: the person, an agent, or NetNet itself. */
export const ACTORS = ['user', 'agent', 'system'] as const;
export type Actor = (typeof ACTORS)[number];

/**
 * One activity entry: an audit row as the log reads it (architecture §6.8, §7.2). `before` and
 * `after` are the entity as stored (a holding, value, type, tag, pref, ledger or connection
 * snapshot), so old → new is on the entry; a revocation's `clientName` is the disconnected
 * agent's name. `summary` is the one-line reading both the web and an agent show.
 */
export interface AuditEntry {
  id: string;
  /** The instant it was written, ISO-8601 UTC. */
  at: string;
  actor: Actor;
  /** The agent's name as shown when an agent wrote it, or the agent a revocation disconnected. */
  clientName: string | null;
  connectionId: string | null;
  /** The agent turn it belongs to, or null for the person's and NetNet's own writes. */
  batchId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  /** The entry this one undoes, when it is itself an undo. */
  undoes: string | null;
  /** The entry that undid this one, when it has been undone. */
  undoneBy: string | null;
  /** How the entry reads, such as "Agent disconnected" for a revocation. */
  summary: string;
}

/** What an undo restored, in the order it was undone (a batch newest first). */
export interface UndoResult {
  undone: { entryId: string; entity: string; entityId: string | null }[];
  /** The new audit entries' ids, one per undone entry, in the same order. */
  undoIds: string[];
}

/** `UNDO_CONFLICT`'s `blockers`: a later change to undo first (architecture §7.5). */
export interface UndoBlocker {
  entry_id: string;
  action: string;
  /** The instant it was written, ISO-8601 UTC. */
  at: string;
}

export const WARNING_CODES = ['SAME_DATE_REPLACED'] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

/** Something a write did that the caller should know about. `path` names the item, if one. */
export interface Warning {
  code: WarningCode;
  message: string;
  path?: string;
}

/** The analytics events a write gives back for the edge to `track()` (PRD J3, §7.7). */
export const DOMAIN_EVENT_NAMES = [
  'holding_created',
  'value_recorded',
  'value_corrected',
  'value_undone',
] as const;
export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];

export type DomainEvent = {
  [N in DomainEventName]: { name: N; props: EventProps<N> };
}[DomainEventName];

/** Every write's result (§7.2, §7.3). */
export interface Write<T> {
  result: T;
  /** The ledger's `data_version` after the write. */
  dataVersion: number;
  warnings: Warning[];
  events: DomainEvent[];
}

/** One `recordValues` item's outcome, in the order given. */
export interface ValueResult {
  /** The value as stored for this item's holding and date. */
  value: Value;
  /** It replaced a value already stored for that holding and date. */
  replaced: boolean;
  warnings: Warning[];
}

/* ---------------------------------------------------------------- export */

/**
 * `GET /api/export?format=` (architecture §7.2, PRD J10): the full bundle as JSON, or one flat
 * values table as CSV.
 */
export const exportFormatSchema = z.enum(['json', 'csv']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

/** A type as exported: the stored row plus the label the current pack gives it. */
export interface ExportType extends UserType {
  /** The type's name: the user's own, else the current pack's label. */
  label: string;
}

/**
 * `GET /api/export?format=json`: everything, to rebuild a spreadsheet from — the accessibility
 * outcome and the answer behind it ride on each holding. Before the ledger exists (no country
 * confirmed yet) the bundle is empty, with a null currency and version.
 */
export interface ExportBundle {
  exportedAt: string;
  baseCurrency: string | null;
  dataVersion: number | null;
  types: ExportType[];
  tags: Tag[];
  holdings: Holding[];
  /** Every value, by holding, oldest first. */
  values: Value[];
}

/**
 * The CSV export's header (P3-T4, an additive detail under plan rule 4): one row per value, in the
 * bundle's order. Amounts are decimals in major units; tags are `;`-separated names.
 */
export const EXPORT_CSV_HEADER =
  'holding_id,holding_name,kind,type,currency,date,amount,base_amount,base_currency,fx_rate,fx_rate_date,fx_source,source,client,access,access_reason,tags';
