import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { METRICS_ROLE, bootstrapRoles } from '../../src/db/bootstrap';
import { createTestDatabase, sqlState, type TestDatabase } from '../isolation/harness';

/**
 * `netnet_metrics`'s login (P4-T3, architecture §6.1): `db:bootstrap` gives it login and its
 * password only when `NETNET_METRICS_DB_PASSWORD` is set; unset it is nologin. With login it can
 * read `analytics` and is still refused `core` and `ledger`. The role is cluster-wide, so every
 * test leaves it nologin again for the suites that read the role catalog.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await db.owner.query(`alter role ${METRICS_ROLE} nologin`);
});

afterAll(async () => {
  await db?.close();
});

async function bootstrap(options: { metricsPassword?: string } = {}): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await bootstrapRoles(client, {
      appPassword: randomBytes(24).toString('hex'),
      ...options,
    });
  } finally {
    await client.end();
  }
}

async function canLogin(): Promise<boolean> {
  const { rows } = await db.owner.query<{ rolcanlogin: boolean }>(
    'select rolcanlogin from pg_roles where rolname = $1',
    [METRICS_ROLE],
  );
  return rows[0]?.rolcanlogin === true;
}

/** The test database's URL as `netnet_metrics` with `password`. */
async function metricsUrl(password: string): Promise<string> {
  const connection = process.env.DATABASE_URL;
  if (connection === undefined) throw new Error('DATABASE_URL is not set');
  const base = new URL(connection);
  const { rows } = await db.owner.query<{ name: string }>('select current_database() as name');
  const url = new URL(base.href);
  url.pathname = `/${rows[0]?.name ?? ''}`;
  url.username = METRICS_ROLE;
  url.password = password;
  return url.href;
}

describe('the metrics role’s login', () => {
  it('stays nologin without NETNET_METRICS_DB_PASSWORD, and cannot connect', async () => {
    await bootstrap();
    expect(await canLogin()).toBe(false);

    const client = new Client({ connectionString: await metricsUrl('any-password') });
    try {
      // nologin and a wrong password are both refused; the catalog check above says which.
      await expect(client.connect()).rejects.toThrow();
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  it('gets login and the password when NETNET_METRICS_DB_PASSWORD is set, and loses login without it', async () => {
    const password = randomBytes(24).toString('hex');
    await bootstrap({ metricsPassword: password });
    expect(await canLogin()).toBe(true);

    const client = new Client({ connectionString: await metricsUrl(password) });
    await client.connect();
    try {
      const { rows } = await client.query<{ current_user: string }>('select current_user');
      expect(rows[0]?.current_user).toBe(METRICS_ROLE);
      expect((await client.query('select count(*) from analytics.event')).rowCount).toBe(1);
      expect(await sqlState(client.query('select * from core.profile'))).toBe('42501');
      expect(await sqlState(client.query('select * from ledger.holding'))).toBe('42501');
    } finally {
      await client.end();
    }

    await bootstrap();
    expect(await canLogin()).toBe(false);
  });

  it('refuses a metrics password that is short or would break a connection string', async () => {
    for (const metricsPassword of ['short', `${'a'.repeat(40)}@host`, `${'a'.repeat(40)}'`]) {
      await expect(bootstrap({ metricsPassword })).rejects.toThrow(/NETNET_METRICS_DB_PASSWORD/);
    }
    expect(await canLogin()).toBe(false);
  });
});
