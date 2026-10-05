import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_ADMIN_ROLE, bootstrapRoles } from '../../src/db/bootstrap';
import { runMigrations } from '../../src/db/migrate';
import { DEMO_USER_ID, seed } from '../../src/db/seed';
import { isId } from '../../src/lib/ids';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';

/**
 * The migrations build every table in architecture §6.2–6.4 on an empty database (the harness
 * starts from one), and the bootstrap, migrate and seed steps CI runs can each run again.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Every table in scope and its columns, as `format_type` names them. */
const TABLES: Record<string, string> = {
  'core.profile':
    'user_id text, country text, time_zone text, segment text, onboarding_state text, created_at timestamptz',
  'core.user':
    'id text, name text, email text, email_verified boolean, image text, created_at timestamptz, ' +
    'updated_at timestamptz',
  'core.session':
    'id text, expires_at timestamptz, token text, created_at timestamptz, updated_at timestamptz, ' +
    'ip_address text, user_agent text, user_id text',
  'core.account':
    'id text, account_id text, provider_id text, user_id text, access_token text, ' +
    'refresh_token text, id_token text, access_token_expires_at timestamptz, ' +
    'refresh_token_expires_at timestamptz, scope text, password text, created_at timestamptz, ' +
    'updated_at timestamptz',
  'core.verification':
    'id text, identifier text, value text, expires_at timestamptz, created_at timestamptz, ' +
    'updated_at timestamptz',
  'core.agent_connection':
    'id text, user_id text, client_id text, client_name text, registration text, client text, ' +
    'created_at timestamptz, first_call_at timestamptz, last_used_at timestamptz, ' +
    'revoked_at timestamptz, security_email_sent_at timestamptz',
  'core.connection_attempt':
    'id text, user_id text, client text, entry text, platform text, state text, failed_step text, ' +
    'started_at timestamptz, updated_at timestamptz, connection_id text, ' +
    'authorize_seen_at timestamptz, token_issued_at timestamptz, cause text',
  'core.jwks':
    'id text, public_key text, private_key text, created_at timestamptz, expires_at timestamptz, ' +
    'alg text, crv text',
  'core.oauth_client':
    'id text, client_id text, client_secret text, client_discovery_id text, disabled boolean, ' +
    'skip_consent boolean, enable_end_session boolean, subject_type text, scopes text[], ' +
    'client_credentials_scopes text[], user_id text, created_at timestamptz, ' +
    'updated_at timestamptz, name text, uri text, icon text, contacts text[], tos text, ' +
    'policy text, software_id text, software_version text, software_statement text, ' +
    'redirect_uris text[], post_logout_redirect_uris text[], backchannel_logout_uri text, ' +
    'backchannel_logout_session_required boolean, token_endpoint_auth_method text, ' +
    'application_type text, jwks text, jwks_uri text, grant_types text[], response_types text[], ' +
    'require_pkce boolean, dpop_bound_access_tokens boolean, reference_id text, metadata jsonb',
  'core.oauth_resource':
    'id text, identifier text, name text, access_token_ttl integer, refresh_token_ttl integer, ' +
    'signing_algorithm text, signing_key_id text, allowed_scopes text[], custom_claims jsonb, ' +
    'dpop_bound_access_tokens_required boolean, disabled boolean, created_at timestamptz, ' +
    'updated_at timestamptz, policy_version integer, metadata jsonb',
  'core.oauth_client_resource':
    'id text, client_id text, resource_id text, metadata jsonb, created_at timestamptz',
  'core.oauth_refresh_token':
    'id text, token text, client_id text, session_id text, user_id text, reference_id text, ' +
    'authorization_code_id text, resources text[], requested_user_info_claims text[], ' +
    'expires_at timestamptz, created_at timestamptz, revoked timestamptz, rotated_at timestamptz, ' +
    'rotation_replay_response text, rotation_replay_expires_at timestamptz, ' +
    'auth_time timestamptz, confirmation jsonb, scopes text[]',
  'core.oauth_access_token':
    'id text, token text, client_id text, session_id text, user_id text, reference_id text, ' +
    'authorization_code_id text, resources text[], requested_user_info_claims text[], ' +
    'refresh_id text, expires_at timestamptz, created_at timestamptz, revoked timestamptz, ' +
    'confirmation jsonb, scopes text[]',
  'core.oauth_consent':
    'id text, client_id text, user_id text, reference_id text, resources text[], ' +
    'requested_user_info_claims text[], scopes text[], created_at timestamptz, ' +
    'updated_at timestamptz',
  'core.oauth_client_assertion': 'id text, expires_at timestamptz',
  'core.content_doc':
    'kind text, key text, version integer, body jsonb, sha256 text, author text, source_commit text, ' +
    'created_at timestamptz',
  'core.content_current':
    'kind text, key text, version integer, updated_at timestamptz, updated_by text',
  'core.content_audit':
    'id bigint, kind text, key text, from_version integer, to_version integer, actor text, at timestamptz',
  'core.fx_rate': 'date date, currency text, per_usd numeric, source text',
  'core.rate_limit': 'key text, window_start timestamptz, count integer',
  'analytics.event':
    'id bigint, name text, at timestamptz, user_id text, visitor text, segment text, props jsonb, ' +
    'app_version text',
  'ledger.ledger_state':
    'user_id text, base_currency text, data_version integer, created_at timestamptz',
  'ledger.user_type':
    'user_id text, id text, universal text, pack_type_key text, custom_name text, sort integer, ' +
    'archived boolean',
  'ledger.tag': 'user_id text, id text, name text, sort integer',
  'ledger.holding':
    'user_id text, id text, name text, kind text, type_id text, currency text, cadence_days integer, ' +
    'archived_at timestamptz, created_at timestamptz, row_version integer, access text, ' +
    'access_basis jsonb, access_reason text, access_until text',
  'ledger.holding_tag': 'user_id text, holding_id text, tag_id text',
  'ledger.value':
    'user_id text, id text, holding_id text, date date, amount_minor bigint, currency text, ' +
    'base_minor bigint, base_currency text, fx_rate numeric, fx_rate_date date, fx_source text, ' +
    'source text, client_name text, connection_id text, batch_id text, entered_at timestamptz, ' +
    'updated_at timestamptz, row_version integer',
  'ledger.prefs': 'user_id text, key text, value jsonb',
  'ledger.audit':
    'user_id text, id text, at timestamptz, actor text, client_name text, connection_id text, ' +
    'batch_id text, action text, entity text, entity_id text, before jsonb, after jsonb, undoes text, ' +
    'undone_by text',
  'ledger.batch':
    'user_id text, id text, connection_id text, opened_at timestamptz, last_write_at timestamptz',
};

/** Tables whose ids are prefixed ULIDs, with the prefix. */
const PREFIXED: Record<string, string> = {
  'core.user': 'usr',
  'core.agent_connection': 'con',
  'core.connection_attempt': 'att',
  'ledger.user_type': 'typ',
  'ledger.tag': 'tag',
  'ledger.holding': 'hld',
  'ledger.value': 'val',
  'ledger.audit': 'aud',
  'ledger.batch': 'bat',
};

describe('the migrations', () => {
  it.each(Object.entries(TABLES))('create %s with its columns', async (table, columns) => {
    const { rows } = await db.owner.query<{ name: string; type: string }>(
      `select attname as name,
              replace(format_type(atttypid, atttypmod), 'timestamp with time zone', 'timestamptz') as type
         from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped
        order by attnum`,
      [table],
    );
    expect(rows.map((r) => `${r.name} ${r.type}`).join(', ')).toBe(columns);
  });

  it('keep money in bigint, value dates in date and instants in timestamptz, in every schema', async () => {
    const { rows } = await db.owner.query<{ column: string; type: string }>(
      `select n.nspname || '.' || c.relname || '.' || a.attname as column,
              format_type(a.atttypid, a.atttypmod) as type
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('core', 'ledger', 'analytics') and c.relkind = 'r'
          and a.attnum > 0 and not a.attisdropped`,
    );
    const wrong = rows.filter(({ column, type }) => {
      const name = column.split('.').pop() ?? '';
      if (name.endsWith('_minor')) return type !== 'bigint';
      if (name === 'at' || name.endsWith('_at')) return type !== 'timestamp with time zone';
      if (name === 'date' || name.endsWith('_date')) return type !== 'date';
      return false;
    });
    expect(wrong).toEqual([]);
  });

  it.each(Object.entries(PREFIXED))('give %s ids that must be %s_ ULIDs', async (table, prefix) => {
    const [schema, name] = table.split('.') as [string, string];
    const { rows } = await db.owner.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition from pg_constraint
        where conrelid = $1::regclass and conname = $2`,
      [table, `${name}_id_check`],
    );
    expect(rows).toEqual([
      { definition: `CHECK ((id ~ '^${prefix}_[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text))` },
    ]);
    expect(schema).toMatch(/^(core|ledger)$/);
  });

  it('give ledger_state user ids that must be usr_ ULIDs, so every ledger row has one', async () => {
    const { rows } = await db.owner.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition from pg_constraint
        where conrelid = 'ledger.ledger_state'::regclass and conname = 'ledger_state_user_id_check'`,
    );
    expect(rows).toEqual([
      { definition: `CHECK ((user_id ~ '^usr_[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text))` },
    ]);
  });

  it('apply nothing a second time', async () => {
    const before = await db.owner.query(
      'select hash from drizzle.__drizzle_migrations order by id',
    );
    expect(before.rowCount).toBeGreaterThan(0);
    const client = await db.owner.connect();
    try {
      await runMigrations(client);
    } finally {
      client.release();
    }
    const after = await db.owner.query('select hash from drizzle.__drizzle_migrations order by id');
    expect(after.rows).toEqual(before.rows);
  });
});

describe('the bootstrap', () => {
  async function withOwner<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  it('refuses a password that is short or would break a connection string', async () => {
    for (const appPassword of ['short', `${'a'.repeat(40)}@host`, `${'a'.repeat(40)}'`]) {
      await expect(withOwner((c) => bootstrapRoles(c, { appPassword }))).rejects.toThrow(
        /NETNET_APP_DB_PASSWORD/,
      );
    }
  });

  it('refuses, rather than repairs, a role that has gained BYPASSRLS', async () => {
    await withOwner(async (client) => {
      await client.query(`alter role ${CONTENT_ADMIN_ROLE} bypassrls`);
      try {
        await expect(
          bootstrapRoles(client, { appPassword: randomBytes(24).toString('hex') }),
        ).rejects.toThrow(`Role ${CONTENT_ADMIN_ROLE} has rolbypassrls`);
      } finally {
        await client.query(`alter role ${CONTENT_ADMIN_ROLE} nobypassrls`);
      }
    });
  });
});

describe('the seed', () => {
  it('writes fictional data as netnet_app, and can run again, even two at once', async () => {
    await Promise.all([seed(db.appDb), seed(db.appDb)]);
    await seed(db.appDb);
    const { rows } = await db.owner.query<{ table: string; n: number }>(
      `select 'holding' as table, count(*)::int as n from ledger.holding where user_id = $1
       union all select 'value', count(*)::int from ledger.value where user_id = $1
       union all select 'profile', count(*)::int from core.profile where user_id = $1`,
      [DEMO_USER_ID],
    );
    expect(rows).toEqual([
      { table: 'holding', n: 3 },
      { table: 'value', n: 4 },
      { table: 'profile', n: 1 },
    ]);
    expect(isId(DEMO_USER_ID, 'usr')).toBe(true);
  });
});
