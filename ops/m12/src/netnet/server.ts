import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { publishContent } from '@netnet/api/content/publish';
import { APP_ROLE, bootstrapRoles } from '@netnet/api/db/bootstrap';
import { createDatabase, createPool, withClient } from '@netnet/api/db/client';
import { loadDemoHousehold, type LoadedHousehold } from '@netnet/api/db/demo';
import { runMigrations } from '@netnet/api/db/migrate';
import type { DemoHousehold } from '@netnet/contracts';
import { readContent } from '../../../../scripts/content-check';
import { APP_PASSWORD_LENGTH } from '../config';
import { REPO_ROOT } from '../household';

/**
 * The NetNet arm's machine (P4-T9): one scratch Postgres built the way every environment is
 * (bootstrap, migrations, published content), the built app served locally as `e2e/server.ts`
 * serves it, and P4-T1's household loaded into one verified account through the Ledger. Nothing
 * here reaches a deployed environment or uses a real account: the database is created for the run
 * and dropped after it.
 *
 * The app's `DATABASE_URL` is the scratch database's `netnet_app` connection, never the owner's,
 * so the run exercises the same grants and row-level security the product runs under.
 */

/** A database made for one run: created, migrated and published, then dropped. */
export interface ScratchDatabase {
  readonly name: string;
  /** `netnet_app`'s connection: what the app gets. */
  readonly appUrl: string;
  /** The superuser's connection to the scratch database: setup only. */
  readonly ownerUrl: string;
  close(): Promise<void>;
}

const databaseName = () => `netnet_m12_${randomBytes(6).toString('hex')}`;

/** A password from the alphabet the bootstrap accepts: letters and digits, 32 long. */
const appPassword = () => randomBytes(APP_PASSWORD_LENGTH / 2).toString('hex');

/** Creates the scratch database, its roles and schema as the owner. */
export async function createScratchDatabase(superuserUrl: string): Promise<ScratchDatabase> {
  const name = databaseName();
  await withClient(superuserUrl, async (client) => {
    await client.query(`create database ${name}`);
  });
  const ownerUrl = new URL(superuserUrl);
  ownerUrl.pathname = `/${name}`;
  const password = appPassword();
  await withClient(ownerUrl.href, async (client) => {
    await bootstrapRoles(client, { appPassword: password });
    await runMigrations(client);
  });
  const appUrl = new URL(ownerUrl.href);
  appUrl.username = APP_ROLE;
  appUrl.password = password;
  return {
    name,
    ownerUrl: ownerUrl.href,
    appUrl: appUrl.href,
    close: async () => {
      await withClient(superuserUrl, async (client) => {
        await client.query(`drop database if exists ${name} with (force)`);
      });
    },
  };
}

/**
 * Publishes `content/` into the scratch database as `content:publish` does, so the app serves the
 * same packs, guides and country list the repository has. The demo household is data, not
 * content, and is loaded separately.
 */
export async function publishRepositoryContent(
  ownerUrl: string,
  root: string = REPO_ROOT,
): Promise<number> {
  const { docs } = readContent(resolve(root, 'content'));
  const pool = createPool(ownerUrl);
  try {
    const outcomes = await publishContent(createDatabase(pool), docs, {
      author: 'M12 harness',
      sourceCommit: null,
    });
    return outcomes.length;
  } finally {
    await pool.end();
  }
}

/** The app's build, which `e2e/server.ts` serves: a run says how to make it rather than guess. */
export function requireBuiltApp(root: string = REPO_ROOT): void {
  const built = resolve(root, 'apps', 'api', 'dist', 'vercel.js');
  if (!existsSync(built)) {
    throw new Error(
      'The app is not built: run `pnpm --filter @netnet/api build` first (e2e/server.ts serves dist/).',
    );
  }
}

/** A port nothing is listening on, found by opening one and closing it at once. */
function freePort(): Promise<number> {
  return new Promise((found, failed) => {
    const server = createServer();
    server.once('error', failed);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => found(port));
    });
  });
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The local app, running: its origin, its health wait, and a stop that takes it down. */
export interface RunningApp {
  readonly origin: string;
  stop(): Promise<void>;
  /** The tail of the app's own output, for an error a run reports. */
  output(): string;
}

/**
 * Starts the built app with `tsx e2e/server.ts`, as the E2E suite does, on a free port and with
 * its own scratch database. Waits for `/api/health` before returning; if the app exits first, the
 * error carries its output, which never holds an amount or a name (CONVENTIONS §6).
 */
export async function startApp(options: {
  databaseUrl: string;
  root?: string;
  port?: number;
}): Promise<RunningApp> {
  const root = options.root ?? REPO_ROOT;
  requireBuiltApp(root);
  const port = options.port ?? (await freePort());
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'e2e/server.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      DATABASE_URL: options.databaseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const remember = (chunk: Buffer) => {
    output = `${output}${chunk.toString('utf8')}`.slice(-4000);
  };
  child.stdout.on('data', remember);
  child.stderr.on('data', remember);

  const stop = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((done) => child.once('exit', () => done()));
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(5_000).then(() => child.kill('SIGKILL'))]);
  };

  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`The app exited with ${child.exitCode} before it was ready:\n${output}`);
    }
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return { origin, stop, output: () => output };
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  await stop();
  throw new Error(`The app did not answer /api/health within a minute:\n${output}`);
}

/** Marks the account's address verified, as opening the emailed link would. */
export async function verifyAccount(ownerUrl: string, email: string): Promise<void> {
  await withClient(ownerUrl, async (client) => {
    await client.query('update core.user set email_verified = true where email = $1', [email]);
  });
}

/** Loads the household into the account, through the Ledger, as `pnpm demo:load` does. */
export async function loadHousehold(options: {
  appUrl: string;
  household: DemoHousehold;
  email: string;
}): Promise<LoadedHousehold> {
  const pool = createPool(options.appUrl);
  try {
    return await loadDemoHousehold(createDatabase(pool), options.household, options.email);
  } finally {
    await pool.end();
  }
}
