import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { checkCurrency, checkId, checkOneOf, instant } from './columns';

/**
 * The `core` and `analytics` schemas (architecture §6.2, §6.4). `core` holds no money. Better
 * Auth's tables, its OAuth provider's among them, are in `core`. Only `apps/api/src/db/**` touches
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

/*
 * The agents' OAuth server (architecture §6.2, §7.6): the JWT plugin's signing keys and the OAuth
 * provider plugin's tables, as Better Auth 1.7.7's `@better-auth/oauth-provider` defines them.
 * Tokens and codes are stored hashed; a CIMD client is cached here by its URL. `reference_id` on
 * a token or consent is the agent connection (`con_`) it was granted for.
 */

/** The keys agents' access tokens are signed with; private keys encrypted with the auth secret. */
export const jwks = core.table('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  expiresAt: instant('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
});

/** A client: registered by DCR, or discovered from its CIMD URL (`client_discovery_id` = `cimd`). */
export const oauthClient = core.table(
  'oauth_client',
  {
    id: text('id').primaryKey(),
    /** The DCR id, or the CIMD document's URL. */
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes').array(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: instant('created_at'),
    updatedAt: instant('updated_at'),
    /** The name the client registered with: untrusted third-party text (architecture §8). */
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (t) => [index('oauth_client_user_id_idx').on(t.userId)],
);

/** A protected resource tokens are issued for: `‹origin›/mcp`, seeded when the server starts. */
export const oauthResource = core.table('oauth_resource', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: instant('created_at'),
  updatedAt: instant('updated_at'),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
});

/** Which client may ask for which resource. */
export const oauthClientResource = core.table(
  'oauth_client_resource',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: instant('created_at'),
  },
  (t) => [
    index('oauth_client_resource_client_id_idx').on(t.clientId),
    index('oauth_client_resource_resource_id_idx').on(t.resourceId),
    uniqueIndex('oauth_client_resource_client_id_resource_id_key').on(t.clientId, t.resourceId),
  ],
);

/** A rotating refresh token (stored hashed), one family per connection (`reference_id`). */
export const oauthRefreshToken = core.table(
  'oauth_refresh_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The agent connection (`con_`). */
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull(),
    /** When it was revoked: by rotation, by replay, or by revoking the connection. */
    revoked: instant('revoked'),
    rotatedAt: instant('rotated_at'),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: instant('rotation_replay_expires_at'),
    authTime: instant('auth_time'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (t) => [
    index('oauth_refresh_token_client_id_idx').on(t.clientId),
    index('oauth_refresh_token_session_id_idx').on(t.sessionId),
    index('oauth_refresh_token_user_id_idx').on(t.userId),
    index('oauth_refresh_token_reference_id_idx').on(t.referenceId),
    index('oauth_refresh_token_authorization_code_id_idx').on(t.authorizationCodeId),
  ],
);

/**
 * An opaque access token, made only for a request without `resource`, which `/mcp` refuses. Agents'
 * access tokens are JWTs and are not stored.
 */
export const oauthAccessToken = core.table(
  'oauth_access_token',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId),
    sessionId: text('session_id').references(() => session.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull(),
    revoked: instant('revoked'),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (t) => [
    index('oauth_access_token_client_id_idx').on(t.clientId),
    index('oauth_access_token_session_id_idx').on(t.sessionId),
    index('oauth_access_token_user_id_idx').on(t.userId),
    index('oauth_access_token_authorization_code_id_idx').on(t.authorizationCodeId),
    index('oauth_access_token_refresh_id_idx').on(t.refreshId),
  ],
);

/**
 * A consent, written by an Allow and deleted straight after it: a remembered approval is never used
 * (architecture §7.6).
 */
export const oauthConsent = core.table(
  'oauth_consent',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: instant('created_at').notNull(),
    updatedAt: instant('updated_at').notNull(),
  },
  (t) => [
    index('oauth_consent_client_id_idx').on(t.clientId),
    index('oauth_consent_user_id_idx').on(t.userId),
  ],
);

/** Single-use `jti`s of `private_key_jwt` client assertions. */
export const oauthClientAssertion = core.table('oauth_client_assertion', {
  id: text('id').primaryKey(),
  expiresAt: instant('expires_at').notNull(),
});

export const SEGMENTS = ['starting_out', 'accumulating', 'established', 'unknown'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Where onboarding resumes (J1): the steps in order, then Home. */
export const ONBOARDING_STATES = ['country', 'segment', 'start', 'basics', 'done'] as const;

/** The guide chosen, or a connection's classification (§3); never a registered name. */
export const CLIENTS = ['claude', 'chatgpt', 'other'] as const;
export const REGISTRATIONS = ['cimd', 'dcr'] as const;
export const ATTEMPT_ENTRIES = ['onboarding', 'home', 'holding', 'agent'] as const;
export const ATTEMPT_PLATFORMS = ['phone', 'computer', 'any'] as const;
export const ATTEMPT_STATES = ['started', 'approved', 'live', 'failed'] as const;
export const ATTEMPT_FAILED_STEPS = ['authorise', 'callback', 'discovery', 'first_call'] as const;
/** Why an attempt failed, for the web app's plain-language cause (PRD J5). */
export const ATTEMPT_CAUSES = [
  'cancelled',
  'invalid_request',
  'token_rejected',
  'timed_out',
] as const;
export const FX_SOURCES = ['ecb', 'fallback'] as const;

/*
 * Every `core` table keyed by a person's id references their `user` row with `on delete cascade`:
 * deleting the account deletes them with it, and the database refuses a row for an id no account
 * holds, even from a request that races the deletion (PRD J10).
 */

export const profile = core.table(
  'profile',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
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
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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

/**
 * The comeback reminder's clock per person (architecture §7.10, PRD J12): when they last checked
 * NetNet, when the next reminder is due, and how many went since the check. Dates are calendar
 * dates in the person's `time_zone`. `enabled` is Settings → Notifications' Reminders (off: nothing
 * by any channel); `emailEnabled` is Email reminders (off: no reminder email). `lastOpenedAt` is a
 * watermark: the `last_sent_at` of the latest reminder opened, so each reminder's first open fires
 * `reminder_opened` exactly once. Only `apps/api/src/db/**` touches this (CONVENTIONS §3).
 */
export const reminderState = core.table(
  'reminder_state',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    lastCheckedOn: date('last_checked_on', { mode: 'string' }),
    nextDueOn: date('next_due_on', { mode: 'string' }),
    sentSinceCheck: integer('sent_since_check').notNull().default(0),
    lastSentAt: instant('last_sent_at'),
    /** The channel the latest reminder went by: `push` or `email`. */
    lastChannel: text('last_channel'),
    lastOpenedAt: instant('last_opened_at'),
  },
  (t) => [
    check('reminder_state_sent_since_check', sql`${t.sentSinceCheck} >= 0`),
    checkOneOf('reminder_state', t.lastChannel, ['push', 'email'] as const),
  ],
);

/**
 * One row per device where push is on (architecture §6.2, PRD J12): the subscription the browser
 * gave (a push-service URL plus its two keys), the device as the person recognises it, and the
 * send outcomes behind revocation. **Active** = not revoked. Revoked when the person turns the
 * device off or removes it, on sign-out on that device, and when the push service answers
 * `404`/`410` or fails five times in a row. Deleted with the account. Only
 * `apps/api/src/db/**` touches this (CONVENTIONS §3).
 */
export const notificationEndpoint = core.table(
  'notification_endpoint',
  {
    /** `nep_` */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** `webpush`; `expo` joins with the native apps. */
    channel: text('channel', { enum: ['webpush'] })
      .notNull()
      .default('webpush'),
    /** The push-service URL the browser subscribed with. */
    endpoint: text('endpoint').notNull(),
    /** `{p256dh, auth}`: the subscription's keys, base64url from the browser. */
    keys: jsonb('keys').notNull(),
    /** `ios`, `android` or `desktop`: what `push_enabled` names. */
    platform: text('platform', { enum: ['ios', 'android', 'desktop'] }).notNull(),
    /** "Android · Chrome": the device as the person recognises it in the device list. */
    deviceLabel: text('device_label').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    /** "Last used" in the device list: made, checked in, or re-activated. */
    lastSeenAt: instant('last_seen_at').notNull().defaultNow(),
    lastSuccessAt: instant('last_success_at'),
    /** Failures in a row; five revokes. A success resets it. */
    failureCount: integer('failure_count').notNull().default(0),
    revokedAt: instant('revoked_at'),
  },
  (t) => [
    index('notification_endpoint_user_id_idx').on(t.userId),
    // One live row per URL: revoked rows keep their URL, so a re-subscribe re-activates.
    uniqueIndex('notification_endpoint_user_endpoint_key')
      .on(t.userId, t.endpoint)
      .where(sql`${t.revokedAt} is null`),
    checkId('notification_endpoint', t.id, 'nep'),
    checkOneOf('notification_endpoint', t.channel, ['webpush']),
    checkOneOf('notification_endpoint', t.platform, ['ios', 'android', 'desktop']),
    check('notification_endpoint_failure_count', sql`${t.failureCount} >= 0`),
  ],
);

export const connectionAttempt = core.table(
  'connection_attempt',
  {
    /** `att_` */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    client: text('client', { enum: CLIENTS }).notNull(),
    entry: text('entry', { enum: ATTEMPT_ENTRIES }).notNull(),
    platform: text('platform', { enum: ATTEMPT_PLATFORMS }).notNull(),
    state: text('state', { enum: ATTEMPT_STATES }).notNull().default('started'),
    failedStep: text('failed_step', { enum: ATTEMPT_FAILED_STEPS }),
    startedAt: instant('started_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
    /** The connection its Allow made (`con_`), once approved. */
    connectionId: text('connection_id'),
    /** When the agent's authorize request reached NetNet for this person: no `discovery` timeout after. */
    authorizeSeenAt: instant('authorize_seen_at'),
    /** When the agent exchanged the code for its tokens: the `first_call` timeout counts from it. */
    tokenIssuedAt: instant('token_issued_at'),
    cause: text('cause', { enum: ATTEMPT_CAUSES }),
  },
  (t) => [
    index('connection_attempt_user_id_started_at_idx').on(t.userId, t.startedAt),
    index('connection_attempt_connection_id_idx').on(t.connectionId),
    checkId('connection_attempt', t.connectionId, 'con'),
    checkId('connection_attempt', t.id, 'att'),
    checkOneOf('connection_attempt', t.client, CLIENTS),
    checkOneOf('connection_attempt', t.entry, ATTEMPT_ENTRIES),
    checkOneOf('connection_attempt', t.platform, ATTEMPT_PLATFORMS),
    checkOneOf('connection_attempt', t.state, ATTEMPT_STATES),
    checkOneOf('connection_attempt', t.failedStep, ATTEMPT_FAILED_STEPS),
    checkOneOf('connection_attempt', t.cause, ATTEMPT_CAUSES),
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

/** Raw bytes; `pg` reads `bytea` as a Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * The landing page's daily salt (§6.4): one random value per UTC day, made on that day's first
 * `landing_view` and deleted once the day has passed, so a past day's `visitor` hashes can never
 * be recomputed. In the database rather than in memory so every function instance hashes one
 * visitor alike.
 */
export const visitorSalt = core.table(
  'visitor_salt',
  {
    day: date('day', { mode: 'string' }).primaryKey(),
    salt: bytea('salt').notNull(),
  },
  (t) => [check('visitor_salt_salt_check', sql`octet_length(${t.salt}) = 32`)],
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
    /**
     * `landing_view`'s only: sha256(daily salt ‖ ip ‖ user agent), 16 hex characters, with the
     * salt kept only for its day (`visitor_salt`), so M10 counts visitors without a cookie.
     */
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
