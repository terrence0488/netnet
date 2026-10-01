import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgSchema,
  primaryKey,
  text,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { checkCurrency, checkId, checkOneOf, instant } from '../db/columns';

/**
 * The `ledger` schema (architecture §6.3): every row belongs to one user. Only
 * `apps/api/src/ledger/**` imports this file, and only through `withUser()` (CONVENTIONS §3).
 *
 * Every table has `user_id` first in its primary key, hangs off `ledger_state` (so a user's write
 * lock row exists before any of their data), points at other rows only by composite foreign keys
 * that include `user_id`, and has the one policy below. `ENABLE` comes with the policy; `FORCE` and
 * the grants are in the migrations. `apps/api/test/rls/schema.test.ts` checks all of it in the
 * catalog, for every table, including ones added later.
 */
export const ledger = pgSchema('ledger');

export const UNIVERSALS = [
  'cash',
  'listed',
  'retirement',
  'property',
  'vehicle',
  'equity',
  'crypto',
  'mortgage',
  'loan',
  'wrapper',
  'card',
  'other',
] as const;
export const HOLDING_KINDS = ['asset', 'liability'] as const;
export const ACCESS = ['accessible', 'illiquid', 'locked', 'undecided'] as const;
export const VALUE_FX_SOURCES = ['ecb', 'fallback', 'same', 'user', 'agent'] as const;
export const VALUE_SOURCES = ['web', 'agent', 'system'] as const;
export const ACTORS = ['user', 'agent', 'system'] as const;

/** The setting `withUser()` sets for one transaction. Unset, it matches no row. */
const CURRENT_USER_ID = sql`current_setting('app.user_id', true)`;

/** The one policy every `ledger` table has (architecture §6.1). */
function userIsolation() {
  return pgPolicy('user_isolation', {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: sql`user_id = ${CURRENT_USER_ID}`,
    withCheck: sql`user_id = ${CURRENT_USER_ID}`,
  });
}

/** Every table but `ledger_state` itself: deleting the state row deletes the user's ledger. */
function belongsToState(table: string, userId: AnyPgColumn) {
  return foreignKey({
    name: `${table}_state_fk`,
    columns: [userId],
    foreignColumns: [ledgerState.userId],
  }).onDelete('cascade');
}

export const ledgerState = ledger.table(
  'ledger_state',
  {
    userId: text('user_id').primaryKey(),
    baseCurrency: text('base_currency').notNull(),
    /** Up by one on every write; the snapshot's ETag. */
    dataVersion: integer('data_version').notNull().default(0),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    checkCurrency('ledger_state', t.baseCurrency),
    check('ledger_state_data_version_check', sql`${t.dataVersion} >= 0`),
    userIsolation(),
  ],
);

export const userType = ledger.table(
  'user_type',
  {
    userId: text('user_id').notNull(),
    /** `typ_` */
    id: text('id').notNull(),
    universal: text('universal', { enum: UNIVERSALS }).notNull(),
    /** The pack's type key, such as `car_loan`; null for a universal or custom type. */
    packTypeKey: text('pack_type_key'),
    /** Null until the user renames the type, so labels follow the current pack. */
    customName: text('custom_name'),
    sort: integer('sort').notNull().default(0),
    archived: boolean('archived').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    belongsToState('user_type', t.userId),
    checkId('user_type', t.id, 'typ'),
    checkOneOf('user_type', t.universal, UNIVERSALS),
    userIsolation(),
  ],
);

export const tag = ledger.table(
  'tag',
  {
    userId: text('user_id').notNull(),
    /** `tag_` */
    id: text('id').notNull(),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    belongsToState('tag', t.userId),
    checkId('tag', t.id, 'tag'),
    uniqueIndex('tag_user_id_name_key').on(t.userId, sql`lower(${t.name})`),
    userIsolation(),
  ],
);

export const holding = ledger.table(
  'holding',
  {
    userId: text('user_id').notNull(),
    /** `hld_` */
    id: text('id').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: HOLDING_KINDS }).notNull(),
    typeId: text('type_id').notNull(),
    currency: text('currency').notNull(),
    /** Expected update cadence (J9); null follows the pack. */
    cadenceDays: integer('cadence_days'),
    archivedAt: instant('archived_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
    rowVersion: integer('row_version').notNull().default(1),
    /** The applied outcome, kept as applied; a pack edit never moves it (§6.7). */
    access: text('access', { enum: ACCESS }),
    /** `{via, pack, pack_version, question, answer}` */
    accessBasis: jsonb('access_basis'),
    accessReason: text('access_reason'),
    accessUntil: text('access_until'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    belongsToState('holding', t.userId),
    checkId('holding', t.id, 'hld'),
    foreignKey({
      name: 'holding_type_fk',
      columns: [t.userId, t.typeId],
      foreignColumns: [userType.userId, userType.id],
    }),
    index('holding_user_id_type_id_idx').on(t.userId, t.typeId),
    checkOneOf('holding', t.kind, HOLDING_KINDS),
    checkCurrency('holding', t.currency),
    checkOneOf('holding', t.access, ACCESS),
    check('holding_access_kind_check', sql`(${t.kind} = 'liability') = (${t.access} is null)`),
    check('holding_cadence_days_check', sql`${t.cadenceDays} > 0`),
    userIsolation(),
  ],
);

export const holdingTag = ledger.table(
  'holding_tag',
  {
    userId: text('user_id').notNull(),
    holdingId: text('holding_id').notNull(),
    tagId: text('tag_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.holdingId, t.tagId] }),
    belongsToState('holding_tag', t.userId),
    foreignKey({
      name: 'holding_tag_holding_fk',
      columns: [t.userId, t.holdingId],
      foreignColumns: [holding.userId, holding.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'holding_tag_tag_fk',
      columns: [t.userId, t.tagId],
      foreignColumns: [tag.userId, tag.id],
    }).onDelete('cascade'),
    index('holding_tag_user_id_tag_id_idx').on(t.userId, t.tagId),
    userIsolation(),
  ],
);

/** One agent turn (§6.8). */
export const batch = ledger.table(
  'batch',
  {
    userId: text('user_id').notNull(),
    /** `bat_` */
    id: text('id').notNull(),
    connectionId: text('connection_id').notNull(),
    openedAt: instant('opened_at').notNull(),
    lastWriteAt: instant('last_write_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    belongsToState('batch', t.userId),
    checkId('batch', t.id, 'bat'),
    index('batch_user_id_connection_id_last_write_at_idx').on(
      t.userId,
      t.connectionId,
      t.lastWriteAt,
    ),
    userIsolation(),
  ],
);

export const value = ledger.table(
  'value',
  {
    userId: text('user_id').notNull(),
    /** `val_` */
    id: text('id').notNull(),
    holdingId: text('holding_id').notNull(),
    /** The value date. */
    date: date('date', { mode: 'string' }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    /** The conversion stored at write time, which totals and periods use (J2, J11). */
    baseMinor: bigint('base_minor', { mode: 'number' }).notNull(),
    baseCurrency: text('base_currency').notNull(),
    fxRate: numeric('fx_rate').notNull(),
    fxRateDate: date('fx_rate_date', { mode: 'string' }),
    fxSource: text('fx_source', { enum: VALUE_FX_SOURCES }).notNull(),
    source: text('source', { enum: VALUE_SOURCES }).notNull(),
    clientName: text('client_name'),
    connectionId: text('connection_id'),
    batchId: text('batch_id'),
    enteredAt: instant('entered_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    rowVersion: integer('row_version').notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    belongsToState('value', t.userId),
    checkId('value', t.id, 'val'),
    foreignKey({
      name: 'value_holding_fk',
      columns: [t.userId, t.holdingId],
      foreignColumns: [holding.userId, holding.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'value_batch_fk',
      columns: [t.userId, t.batchId],
      foreignColumns: [batch.userId, batch.id],
    }),
    /** Last write wins for a holding and date, with a warning (J3). */
    uniqueIndex('value_user_id_holding_id_date_key').on(t.userId, t.holdingId, t.date),
    index('value_user_id_batch_id_idx').on(t.userId, t.batchId),
    checkCurrency('value', t.currency),
    checkCurrency('value', t.baseCurrency),
    check('value_fx_rate_check', sql`${t.fxRate} > 0`),
    checkOneOf('value', t.fxSource, VALUE_FX_SOURCES),
    checkOneOf('value', t.source, VALUE_SOURCES),
    userIsolation(),
  ],
);

export const prefs = ledger.table(
  'prefs',
  {
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    belongsToState('prefs', t.userId),
    userIsolation(),
  ],
);

/** One row per entity changed (§6.8). `before` for a deleted holding includes its values. */
export const audit = ledger.table(
  'audit',
  {
    userId: text('user_id').notNull(),
    /** `aud_` */
    id: text('id').notNull(),
    at: instant('at').notNull(),
    actor: text('actor', { enum: ACTORS }).notNull(),
    clientName: text('client_name'),
    connectionId: text('connection_id'),
    batchId: text('batch_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    undoes: text('undoes'),
    undoneBy: text('undone_by'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    belongsToState('audit', t.userId),
    checkId('audit', t.id, 'aud'),
    foreignKey({
      name: 'audit_batch_fk',
      columns: [t.userId, t.batchId],
      foreignColumns: [batch.userId, batch.id],
    }),
    foreignKey({
      name: 'audit_undoes_fk',
      columns: [t.userId, t.undoes],
      foreignColumns: [t.userId, t.id],
    }),
    foreignKey({
      name: 'audit_undone_by_fk',
      columns: [t.userId, t.undoneBy],
      foreignColumns: [t.userId, t.id],
    }),
    index('audit_user_id_at_idx').on(t.userId, t.at),
    index('audit_user_id_batch_id_idx').on(t.userId, t.batchId),
    checkOneOf('audit', t.actor, ACTORS),
    userIsolation(),
  ],
);
