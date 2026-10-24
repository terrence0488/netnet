import { z } from 'zod';
import { universalSchema } from '../content';
import { errorCodeSchema } from '../errors';
import { HOLDING_KINDS, VALUE_SOURCES } from '../figures';
import {
  MAX_ACTIVITY_PAGE,
  MAX_HOLDINGS_PAGE,
  MAX_NAME_LENGTH,
  MAX_TAGS_PER_HOLDING,
  MAX_VALUES_PAGE,
  VALUE_FX_SOURCES,
  WARNING_CODES,
} from '../ledger';

/**
 * What the MCP tool schemas share (architecture §7.4): snake_case parameters over the Ledger's
 * own inputs, and snake_case outputs with amounts as decimals in major units. Each tool maps its
 * input onto the Ledger's camelCase input, which checks it again; the outputs are mapped back at
 * the edge, converting money once with `core.fromMinor`. Descriptions live with the server, in
 * `apps/api/src/mcp/tools/`, so this package stays copy-free.
 */

/* ---------------------------------------------------------------- input primitives */

const MAX_FILTER_IDS = 500;
const MAX_CADENCE_DAYS = 3650;
const MAX_ID_LENGTH = 64;
const MAX_CURSOR_LENGTH = 200;

/** An id such as `hld_01J…`. Any string is looked up; one that is not there is NOT_FOUND. */
export const mcpId = z
  .string({ error: 'Give the id as a string, such as "hld_01J…".' })
  .min(1, 'Give the id, such as "hld_01J…".')
  .max(MAX_ID_LENGTH, `An id is at most ${MAX_ID_LENGTH} characters.`);

export const mcpName = z
  .string({ error: 'Give the name as text.' })
  .trim()
  .min(1, 'Give a name; it cannot be blank.')
  .max(MAX_NAME_LENGTH, `Use at most ${MAX_NAME_LENGTH} characters.`);

/**
 * A decimal amount in major units, as a string (`"1234.56"`) or a number. Its precision and size
 * are checked against the currency it is in.
 */
export const mcpAmount = z.union([z.string(), z.number()], {
  error: 'Give the amount as a decimal number in major units, such as "1234.56".',
});

/** An ISO 4217 code; lower case is accepted and raised. */
export const mcpCurrency = z
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

export const mcpDate = z
  .string({ error: 'Give the date as YYYY-MM-DD, such as "2026-08-31".' })
  .refine(isCalendarDate, 'Use a calendar date in the form YYYY-MM-DD, such as "2026-08-31".');

const RATE = /^\d+(\.\d+)?$/;

/**
 * An exchange rate a caller supplies, as a statement shows it: 1 unit of the value's currency =
 * `rate` units of the base currency. A positive decimal, kept as a string.
 */
export const mcpFxRate = z
  .union([z.string(), z.number()], {
    error: 'Give the rate as a positive decimal, such as "1.3456".',
  })
  .transform((r) => (typeof r === 'number' ? String(r) : r.trim()))
  .refine(
    (r) => RATE.test(r) && /[1-9]/.test(r) && r.length <= 32,
    'Give the rate as a positive decimal, such as "1.3456": 1 of the value’s currency in the base currency.',
  );

export const mcpIds = (max: number) =>
  z.array(mcpId, { error: 'Give a list of ids.' }).max(max, `Give at most ${max} ids.`);

export const mcpFilterIds = mcpIds(MAX_FILTER_IDS);
export const mcpTagIds = mcpIds(MAX_TAGS_PER_HOLDING);

export const mcpCursor = z.string().min(1).max(MAX_CURSOR_LENGTH);

export const mcpHoldingsLimit = z
  .int('Give the limit as a whole number.')
  .min(1, 'Give a limit of at least 1.')
  .max(MAX_HOLDINGS_PAGE, `Give a limit of at most ${MAX_HOLDINGS_PAGE}.`)
  .optional();

export const mcpValuesLimit = z
  .int('Give the limit as a whole number.')
  .min(1, 'Give a limit of at least 1.')
  .max(MAX_VALUES_PAGE, `Give a limit of at most ${MAX_VALUES_PAGE}.`)
  .optional();

export const mcpActivityLimit = z
  .int('Give the limit as a whole number.')
  .min(1, 'Give a limit of at least 1.')
  .max(MAX_ACTIVITY_PAGE, `Give a limit of at most ${MAX_ACTIVITY_PAGE}.`)
  .optional();

export const mcpCadenceDays = z
  .int('Give the cadence as a whole number of days.')
  .min(1, 'Give at least 1 day.')
  .max(MAX_CADENCE_DAYS, `Give at most ${MAX_CADENCE_DAYS} days.`)
  .nullable()
  .optional();

/* ---------------------------------------------------------------- outputs */

/** A decimal amount in major units, in the output's currency. */
const major = z.number();

const majorCurrency = z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code, such as "SGD".');
const outputDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in the form YYYY-MM-DD.');

/** A value with its provenance and the conversion stored when it was written. */
export const mcpValueSchema = z.strictObject({
  id: z.string(),
  holding_id: z.string(),
  date: outputDate,
  /** In the value's own currency. */
  amount: major,
  currency: majorCurrency,
  /** In the base currency, at the rate stored when the value was written. */
  base_amount: major,
  base_currency: majorCurrency,
  /** 1 of `currency` in `base_currency`, in major units: the form a statement shows. */
  fx_rate: z.string(),
  fx_rate_date: outputDate.nullable(),
  fx_source: z.enum(VALUE_FX_SOURCES),
  source: z.enum(VALUE_SOURCES),
  /** The agent's name as shown when an agent wrote it: third-party text, shown escaped. */
  client_name: z.string().nullable(),
  entered_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export type McpValue = z.infer<typeof mcpValueSchema>;

/** A holding as stored: its accessibility outcome and reason are kept as applied. */
export const mcpHoldingSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  kind: z.enum(HOLDING_KINDS),
  type_id: z.string(),
  currency: majorCurrency,
  /** Null follows the pack chain. */
  cadence_days: z.int().nullable(),
  archived: z.boolean(),
  archived_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  /** Null for a liability. */
  access: z.enum(['accessible', 'illiquid', 'locked', 'undecided']).nullable(),
  access_reason: z.string().nullable(),
  until: z.string().nullable(),
  tag_ids: z.array(z.string()),
});
export type McpHolding = z.infer<typeof mcpHoldingSchema>;

/** A holding as listed: its type, its latest value and how old that is. */
export const mcpHoldingViewSchema = mcpHoldingSchema.extend({
  universal_type: universalSchema,
  /** The type's name: the user's own, else the current pack's label. */
  type_label: z.string(),
  /** The latest value by date, or null when it has none. */
  latest: mcpValueSchema.nullable(),
  /** Null when it has no value. */
  staleness: z.strictObject({ stale: z.boolean(), days: z.int() }).nullable(),
});
export type McpHoldingView = z.infer<typeof mcpHoldingViewSchema>;

/** A user's type. No name is stored until the user renames it, so labels follow the pack. */
export const mcpTypeSchema = z.strictObject({
  id: z.string(),
  universal_type: universalSchema,
  /** The type's name: the user's own, else the current pack's label. */
  label: z.string(),
  /** What the universal type is, from the pack: what the agent is told it means. */
  meaning: z.string(),
  custom_name: z.string().nullable(),
  /** The pack's type key, such as `car_loan`; null for a universal or custom type. */
  pack_type_key: z.string().nullable(),
  archived: z.boolean(),
});
export type McpType = z.infer<typeof mcpTypeSchema>;

export const mcpTagSchema = z.strictObject({ id: z.string(), name: z.string() });
export type McpTag = z.infer<typeof mcpTagSchema>;

/** Something a write did that the caller should know about. `path` names the item, if one. */
export const mcpWarningSchema = z.strictObject({
  code: z.enum(WARNING_CODES),
  message: z.string(),
  path: z.string().exactOptional(),
});
export type McpWarning = z.infer<typeof mcpWarningSchema>;

/**
 * Every write's output (§7.2's shape, in snake_case): the result, the ledger's `data_version`
 * after the write, and its warnings. Deletes return `result: null`.
 */
export function mcpWriteOutput<R extends z.ZodType>(result: R) {
  return z.strictObject({
    result,
    /** The ledger's `data_version` after the write. */
    data_version: z.int(),
    warnings: z.array(mcpWarningSchema),
  });
}

/** A likely duplicate of a new holding (`LIKELY_DUPLICATE`). */
export const mcpCandidateSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  latest: z.strictObject({ date: outputDate, amount: major, currency: majorCurrency }).nullable(),
});
export type McpCandidate = z.infer<typeof mcpCandidateSchema>;

/**
 * One activity entry: the audit row as the log reads it. `before` and `after` are the entity
 * exactly as the Ledger stores it (old → new on the entry), so they keep the Ledger's camelCase
 * and minor units; everything else is snake_case.
 */
export const mcpAuditEntrySchema = z.strictObject({
  id: z.string(),
  /** The instant it was written, ISO-8601 UTC. */
  at: z.iso.datetime(),
  actor: z.enum(['user', 'agent', 'system']),
  /** The agent's name as shown when an agent wrote it, or the agent a revocation disconnected. */
  client_name: z.string().nullable(),
  connection_id: z.string().nullable(),
  /** The agent turn it belongs to, or null for the person's and NetNet's own writes. */
  batch_id: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entity_id: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  /** How the entry reads, such as "Agent disconnected" for a revocation. */
  summary: z.string(),
});
export type McpAuditEntry = z.infer<typeof mcpAuditEntrySchema>;

/**
 * A failed call's `structuredContent`: the error code, what to change, the bad fields, and the
 * code's own details beside them (`candidates` with `LIKELY_DUPLICATE`).
 */
export const mcpErrorSchema = z.strictObject({
  error: z.looseObject({
    code: errorCodeSchema,
    message: z.string().min(1),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type McpError = z.infer<typeof mcpErrorSchema>;
