import { randomBytes } from 'node:crypto';
import { Client, Pool, type PoolClient } from 'pg';
import { APP_ROLE, bootstrapRoles } from '../../src/db/bootstrap';
import { createDatabase, createPool, type Database } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { agentConnection } from '../../src/db/schema';
import { seedLedger, type SeededLedger } from '../../src/ledger/seed';
import { createWithUser, type WithUser } from '../../src/ledger/with-user';

/**
 * The isolation harness (architecture §8): a fresh database per test file, built the way CI and
 * every environment build theirs (bootstrap, then the migrations, as the owner), and a connection
 * as `netnet_app`, which is what every suite attacks.
 *
 * DATABASE_URL is a superuser connection (CI's `postgres` service); it plays the owner. The
 * `netnet_app` password is random for each run and never leaves the process.
 */
export interface TestDatabase {
  /** Superuser: the owner's view, which sees every row. For setting up and checking only. */
  owner: Pool;
  /** `netnet_app`, the running app's role. */
  app: Pool;
  appDb: Database;
  /** `withUser` as `netnet_app` with `clock` (default: FIXED_NOW). */
  withUser: WithUser;
  /** A further `netnet_app` pool, such as a single-connection one; closed with the rest. */
  appPool(options?: { max?: number }): Pool;
  withUserOn(pool: Pool, clock?: () => Date): WithUser;
  close(): Promise<void>;
}

/** The fixed clock the suites run on: 2026-08-01T10:00:00Z. */
export const FIXED_NOW = new Date(Date.UTC(2026, 7, 1, 10));

function baseUrl(): URL {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set: point it at a Postgres superuser, as CI does ' +
        '(postgres://postgres:…@localhost:5432/netnet_test).',
    );
  }
  return new URL(url);
}

export async function createTestDatabase(
  clock: () => Date = () => FIXED_NOW,
): Promise<TestDatabase> {
  const base = baseUrl();
  const name = `netnet_it_${randomBytes(6).toString('hex')}`;
  const admin = new Client({ connectionString: base.href });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }

  const ownerUrl = new URL(base.href);
  ownerUrl.pathname = `/${name}`;
  const password = randomBytes(24).toString('hex');
  const setup = new Client({ connectionString: ownerUrl.href });
  await setup.connect();
  try {
    await bootstrapRoles(setup, { appPassword: password });
    await runMigrations(setup);
  } finally {
    await setup.end();
  }

  const appUrl = new URL(ownerUrl.href);
  appUrl.username = APP_ROLE;
  appUrl.password = password;

  const pools: Pool[] = [];
  const track = (pool: Pool) => {
    pools.push(pool);
    return pool;
  };
  const owner = track(createPool(ownerUrl.href));
  const app = track(createPool(appUrl.href));
  const appDb = createDatabase(app);
  const withUserOn = (pool: Pool, onClock: () => Date = clock) => {
    const db = createDatabase(pool);
    return createWithUser(() => ({ db, clock: onClock }));
  };

  return {
    owner,
    app,
    appDb,
    withUser: withUserOn(app),
    appPool: (options = {}) =>
      track(new Pool({ connectionString: appUrl.href, max: options.max ?? 5 })),
    withUserOn,
    async close() {
      await Promise.all(pools.map((pool) => pool.end()));
      const drop = new Client({ connectionString: base.href });
      await drop.connect();
      try {
        await drop.query(`drop database if exists ${name} with (force)`);
      } finally {
        await drop.end();
      }
    },
  };
}

/** Two fictional people. Every name in a user's ledger carries their marker. */
export const USER_A = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
export const USER_B = 'usr_01K1G4KX00BBBBBBBBBBBBBBBB';
export const MARKER_A = 'MARKER-A-7F3C';
export const MARKER_B = 'MARKER-B-91D2';
export const CONNECTION_A = 'con_01K1G4KX00AAAAAAAAAAAAAAAA';
export const CONNECTION_A_REVOKED = 'con_01K1G4KX00AAAAAAAAAAAAARVK';
export const CONNECTION_B = 'con_01K1G4KX00BBBBBBBBBBBBBBBB';

export interface Fixtures {
  a: SeededLedger;
  b: SeededLedger;
}

/**
 * The account `userId` names, as sign-up makes it, unless it exists: every `core` row keyed by a
 * user id (profile, reminder state, connections…) references it. A fictional address.
 */
export async function ensureAccount(db: TestDatabase, userId: string): Promise<void> {
  await db.owner.query(
    `insert into core."user" (id, name, email) values ($1, '', $2) on conflict (id) do nothing`,
    [userId, `${userId.toLowerCase()}@example.com`],
  );
}

/**
 * Users A and B, each with an account and a ledger that has rows in every `ledger` table, written
 * as `netnet_app` through `withUser`; A has an active and a revoked agent connection, B an active
 * one.
 */
export async function seedUsers(db: TestDatabase): Promise<Fixtures> {
  await ensureAccount(db, USER_A);
  await ensureAccount(db, USER_B);
  const connection = (id: string, userId: string, revokedAt: Date | null = null) => ({
    id,
    userId,
    clientId: `https://agent.example/${id}.json`,
    clientName: 'Fictional agent',
    registration: 'cimd' as const,
    client: 'other' as const,
    createdAt: FIXED_NOW,
    revokedAt,
  });
  await db.appDb
    .insert(agentConnection)
    .values([
      connection(CONNECTION_A, USER_A),
      connection(CONNECTION_A_REVOKED, USER_A, FIXED_NOW),
      connection(CONNECTION_B, USER_B),
    ]);
  const a = await seedLedger(db.withUser, {
    userId: USER_A,
    baseCurrency: 'USD',
    connectionId: CONNECTION_A,
    marker: MARKER_A,
  });
  const b = await seedLedger(db.withUser, {
    userId: USER_B,
    baseCurrency: 'EUR',
    connectionId: CONNECTION_B,
    marker: MARKER_B,
  });
  return { a, b };
}

/** Every table in the `ledger` schema, read from the catalog, so new tables are included. */
export async function ledgerTables(db: TestDatabase): Promise<string[]> {
  const { rows } = await db.owner.query<{ name: string }>(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'ledger' and c.relkind in ('r', 'p') order by 1`,
  );
  return rows.map((r) => r.name);
}

/**
 * Runs `fn` on one `netnet_app` connection inside a transaction with `app.user_id` set (or not,
 * for `null`), and rolls it back. The raw counterpart of `withUser`, for attacking the policies.
 */
export async function asApp<T>(
  db: TestDatabase,
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.app.connect();
  try {
    await client.query('begin');
    if (userId !== null) {
      await client.query(`select set_config('app.user_id', $1, true)`, [userId]);
    }
    return await fn(client);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

/**
 * The SQLSTATE of the error `promise` rejects with (Drizzle wraps it in `cause`), or `null` if it
 * resolves.
 */
export async function sqlState(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
      const code = (e as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return 'not-a-database-error';
  }
}
