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
  pgSchema,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';
import { checkCurrency, checkId, checkOneOf, instant } from './columns';

/**
 * The `core` and `analytics` schemas (architecture §6.2, §6.4). `core` holds no money. Better
 * Auth's OAuth plugin's tables join `core` with their own task. Only `apps/api/src/db/**` touches
 * these tables (CONVENTIONS §3); Better Auth reaches its own through the adapter in `auth-adapter.ts`.
 */
export const core = pgSchema('core');
export const analytics = pgSchema('analytics');

/*
 * Better Auth's tables (architecture §6.2), as its Drizzle adapter addresses them: each table by
 * the model name it is passed under, each column by its field name. Columns are snake_case and
 * instants `timestamptz`. The user's id is ours, a `usr_` ULID, because `withUser` takes no other.
 */

export const user = core.table(
  'user',
  {
    /** `usr_` */
    id: text('id').primaryKey(),
    /** Always empty: sign-up asks for nothing but an email and a password (PRD J1). */
    name: text('name').notNull(),
    /** Lowercase, as Better Auth stores it. Never logged, tracked or put in a message body. */
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    /** Always null: NetNet keeps no picture of anyone. */
    image: text('image'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [checkId('user', t.id, 'usr')],
);

export const session = core.table(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: instant('expires_at').notNull(),
    /** The cookie's value, before its signature. */
    token: text('token').notNull().unique(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull(),
    /** Always null: neither the address nor the browser is kept. */
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

/** A way to sign in: `credential` (the password's scrypt hash), and later Google and Apple. */
export const account = core.table(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: instant('access_token_expires_at'),
    refreshTokenExpiresAt: instant('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

/** Short-lived tokens, such as a password reset's. */
export const verification = core.table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const SEGMENTS = ['starting_out', 'accumulating', 'established', 'unknown'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Where onboarding resumes (J1): P1's steps in order. P2 adds its own. */
export const ONBOARDING_STATES = ['country', 'segment', 'done'] as const;

/** The guide chosen, or a connection's classification (§3); never a registered name. */
export const CLIENTS = ['claude', 'chatgpt', 'other'] as const;
export const REGISTRATIONS = ['cimd', 'dcr'] as const;
export const ATTEMPT_ENTRIES = ['onboarding', 'home', 'holding', 'agent'] as const;
export const ATTEMPT_PLATFORMS = ['phone', 'computer', 'any'] as const;
export const ATTEMPT_STATES = ['started', 'approved', 'live', 'failed'] as const;
export const ATTEMPT_FAILED_STEPS = ['authorise', 'callback', 'discovery', 'first_call'] as const;
export const FX_SOURCES = ['ecb', 'fallback'] as const;

export const profile = core.table(
  'profile',
  {
    userId: text('user_id').primaryKey(),
    /** ISO 3166-1 alpha-2 (plus XK); null until the person says where they live. */
    country: text('country'),
    /** IANA; the browser's at sign-up, `UTC` when it gives none. Decides "today" (J12). */
    timeZone: text('time_zone').notNull().default('UTC'),
    segment: text('segment', { enum: SEGMENTS }).notNull().default('unknown'),
    /** Where to resume onboarding (J1). */
    onboardingState: text('onboarding_state', { enum: ONBOARDING_STATES })
      .notNull()
      .default('country'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('profile_country_check', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('profile_time_zone_check', sql`${t.timeZone} <> ''`),
    checkOneOf('profile', t.segment, SEGMENTS),
    checkOneOf('profile', t.onboardingState, ONBOARDING_STATES),
  ],
);

export const agentConnection = core.table(
  'agent_connection',
  {
    /** `con_` */
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    clientId: text('client_id').notNull(),
    /** Untrusted third-party text: never in an event, escaped wherever it is shown. */
    clientName: text('client_name').notNull(),
    registration: text('registration', { enum: REGISTRATIONS }).notNull(),
    client: text('client', { enum: CLIENTS }).notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    firstCallAt: instant('first_call_at'),
    lastUsedAt: instant('last_used_at'),
    /** Set on revocation; `withUser` rejects the connection's next call (§7.6). */
    revokedAt: instant('revoked_at'),
    /** Null until Resend accepts the security email, so a failed send is retried (§7.10). */
    securityEmailSentAt: instant('security_email_sent_at'),
  },
  (t) => [
    index('agent_connection_user_id_idx').on(t.userId),
    checkId('agent_connection', t.id, 'con'),
    checkOneOf('agent_connection', t.registration, REGISTRATIONS),
    checkOneOf('agent_connection', t.client, CLIENTS),
  ],
);

export const connectionAttempt = core.table(
  'connection_attempt',
  {
    /** `att_` */
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    client: text('client', { enum: CLIENTS }).notNull(),
    entry: text('entry', { enum: ATTEMPT_ENTRIES }).notNull(),
    platform: text('platform', { enum: ATTEMPT_PLATFORMS }).notNull(),
    state: text('state', { enum: ATTEMPT_STATES }).notNull().default('started'),
    failedStep: text('failed_step', { enum: ATTEMPT_FAILED_STEPS }),
    startedAt: instant('started_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('connection_attempt_user_id_started_at_idx').on(t.userId, t.startedAt),
    checkId('connection_attempt', t.id, 'att'),
    checkOneOf('connection_attempt', t.client, CLIENTS),
    checkOneOf('connection_attempt', t.entry, ATTEMPT_ENTRIES),
    checkOneOf('connection_attempt', t.platform, ATTEMPT_PLATFORMS),
    checkOneOf('connection_attempt', t.state, ATTEMPT_STATES),
    checkOneOf('connection_attempt', t.failedStep, ATTEMPT_FAILED_STEPS),
    check(
      'connection_attempt_failed_step_state_check',
      sql`(${t.state} = 'failed') = (${t.failedStep} is not null)`,
    ),
  ],
);

/** Packs, the country list and agent guides, one row per version. Immutable once written. */
export const contentDoc = core.table(
  'content_doc',
  {
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    body: jsonb('body').notNull(),
    sha256: text('sha256').notNull(),
    author: text('author').notNull(),
    sourceCommit: text('source_commit'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.key, t.version] }),
    check('content_doc_version_check', sql`${t.version} >= 1`),
    check('content_doc_sha256_check', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** Which version of each document is live. Rolling back points at an older version. */
export const contentCurrent = core.table(
  'content_current',
  {
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    updatedBy: text('updated_by').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.key] }),
    foreignKey({
      name: 'content_current_doc_fk',
      columns: [t.kind, t.key, t.version],
      foreignColumns: [contentDoc.kind, contentDoc.key, contentDoc.version],
    }),
  ],
);

/** Who changed which content, when, old version → new (PRD §2.3). */
export const contentAudit = core.table(
  'content_audit',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    fromVersion: integer('from_version'),
    toVersion: integer('to_version').notNull(),
    actor: text('actor').notNull(),
    at: instant('at').notNull().defaultNow(),
  },
  (t) => [index('content_audit_kind_key_at_idx').on(t.kind, t.key, t.at)],
);

/** Daily rates against USD; cross rates go through USD (§6.6). Rates are decimal strings. */
export const fxRate = core.table(
  'fx_rate',
  {
    date: date('date', { mode: 'string' }).notNull(),
    currency: text('currency').notNull(),
    perUsd: numeric('per_usd').notNull(),
    source: text('source', { enum: FX_SOURCES }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.currency] }),
    index('fx_rate_currency_date_idx').on(t.currency, t.date),
    checkCurrency('fx_rate', t.currency),
    check('fx_rate_per_usd_check', sql`${t.perUsd} > 0`),
    checkOneOf('fx_rate', t.source, FX_SOURCES),
  ],
);

/** Fixed-window counters (§8). */
export const rateLimit = core.table(
  'rate_limit',
  {
    key: text('key').notNull(),
    windowStart: instant('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/**
 * First-party analytics events, written only through the typed `track()` (§7.7). The app may
 * insert and nothing else; `netnet_metrics` reads.
 */
export const event = analytics.table(
  'event',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    at: instant('at').notNull().defaultNow(),
    userId: text('user_id'),
    /** sha256(daily salt ‖ ip ‖ user agent), truncated; the salt is never stored (M10). */
    visitor: text('visitor'),
    segment: text('segment', { enum: SEGMENTS }).notNull(),
    props: jsonb('props').notNull().default({}),
    appVersion: text('app_version').notNull(),
  },
  (t) => [
    index('event_name_at_idx').on(t.name, t.at),
    index('event_user_id_at_idx').on(t.userId, t.at),
    checkOneOf('event', t.segment, SEGMENTS),
  ],
);
