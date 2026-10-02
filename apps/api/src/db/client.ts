import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { log } from '../lib/log';

/** The app's database handle: Drizzle over a `pg` pool. */
export type Database = NodePgDatabase;

/** One transaction of `Database.transaction()`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** A handle queries can run on: the database, or a transaction inside it. */
export type Executor = Database | Transaction;

/**
 * A pool for one function instance. Neon's pooler multiplexes the instances' connections, so each
 * keeps only a few. An idle connection the server closes emits `error` on the pool, which would
 * crash the process if nothing listened.
 */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', () => log('database_pool_error'));
  return pool;
}

export function createDatabase(pool: Pool): Database {
  return drizzle({ client: pool });
}

let shared: Database | undefined;

/**
 * The running app's database, connected as `netnet_app` through `DATABASE_URL` (the pooled
 * connection string). Created on first use, so nothing connects until a request needs it.
 */
export function database(): Database {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    shared = createDatabase(createPool(url));
  }
  return shared;
}

/** Runs `fn` on one direct connection, then closes it: for the owner's scripts (`db:*`). */
export async function withClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
