/**
 * `pnpm demo:load --env <env> --email <address>` loads the fictional demo household
 * (content/demo/household.json, P4-T1) into the verified account with that email, if it has no
 * holding: the account's country becomes the household's, as onboarding sets it, and the
 * household is written through the Ledger as `system`, all or nothing (`loadDemoHousehold`).
 *
 * <env> is local, preview or production. Reads DATABASE_URL: the app's connection (netnet_app), as
 * `db:seed` does. It prints counts only: never the email, a name or an amount, and never an
 * error's own text, which can carry a query's parameters. Exits 1 with a plain message otherwise.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createDatabase, createPool } from '@netnet/api/db/client';
import { DemoRefused, loadDemoHousehold } from '@netnet/api/db/demo';
import { demoHouseholdSchema } from '@netnet/contracts';
import { CONTENT_DIR, DEMO_FILE } from './content-check';

const ENVS = ['local', 'preview', 'production'] as const;
const USAGE = 'Usage: pnpm demo:load --env local|preview|production --email <address>';

/** Where the script reads and writes; the real process unless a test passes its own. */
export interface DemoLoadIo {
  databaseUrl: string | undefined;
  log: (line: string) => void;
  error: (line: string) => void;
  /** The Ledger's clock; the real one unless given. */
  clock?: () => Date;
  /** Where content/ is; the repository's unless given. */
  contentDir?: string;
}

/** An error's kind and SQLSTATE, never its message. */
function kindOf(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return `${name}, SQLSTATE ${code}`;
  }
  return name;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The script: returns its exit code. */
export async function main(args: readonly string[], io: DemoLoadIo): Promise<number> {
  let values: { env?: string | undefined; email?: string | undefined };
  try {
    values = parseArgs({
      args: [...args],
      options: { env: { type: 'string' }, email: { type: 'string' } },
    }).values;
  } catch {
    io.error(`demo:load: ${USAGE}`);
    return 1;
  }
  const env = ENVS.find((e) => e === values.env);
  const email = values.email?.trim() ?? '';
  if (!env || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    io.error(`demo:load: name the environment and the account's email. ${USAGE}`);
    return 1;
  }
  if (!io.databaseUrl) {
    io.error('demo:load: DATABASE_URL is not set (see .env.example).');
    return 1;
  }

  let household;
  try {
    const path = join(io.contentDir ?? CONTENT_DIR, DEMO_FILE);
    household = demoHouseholdSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    io.error(`demo:load: content/${DEMO_FILE} is not valid: run pnpm content:check.`);
    return 1;
  }

  const pool = createPool(io.databaseUrl);
  try {
    const loaded = await loadDemoHousehold(
      createDatabase(pool),
      household,
      email,
      io.clock ? { clock: io.clock } : {},
    );
    io.log(
      `demo:load: ${env}: ${plural(loaded.holdings, 'holding')} (${loaded.archived} archived, ` +
        `${loaded.withoutValue} without a value), ${plural(loaded.values, 'value')} and ` +
        `${plural(loaded.tags, 'new tag')} loaded.`,
    );
    return 0;
  } catch (error) {
    if (error instanceof DemoRefused) {
      io.error(`demo:load: ${env}: refused. ${error.message}`);
    } else {
      io.error(
        `demo:load: ${env}: failed (${kindOf(error)}). The ledger is written all or nothing, so run it again once that is fixed.`,
      );
    }
    return 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), {
    databaseUrl: process.env.DATABASE_URL,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
}
