/**
 * `pnpm fx:backfill --from 2000-01-01 --env <env> [--to YYYY-MM-DD]` fills `core.fx_rate` with
 * history from both sources (architecture §6.6), a year per request, oldest first. Run it once per
 * environment; the daily cron keeps it current. It can run again: rates already stored are kept.
 * Then it lists, for every currency in content/countries.json, the dates its rates span, so a
 * currency with none shows.
 *
 * <env> is local, preview or production. Reads DATABASE_URL: the app's connection (netnet_app).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createDatabase, createPool } from '@netnet/api/db/client';
import { databaseRateStore, syncRange } from '@netnet/api/content/fx-sync';
import { rateSpans } from '@netnet/api/db/fx-rates';
import { CONTENT_DIR } from './content-check';
import { requireEnv, run } from './db-env';

const ENVS = ['local', 'preview', 'production'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const USAGE =
  'Usage: pnpm fx:backfill --from YYYY-MM-DD --env local|preview|production [--to YYYY-MM-DD]';

await run('fx:backfill', async () => {
  const { values } = parseArgs({
    options: { from: { type: 'string' }, to: { type: 'string' }, env: { type: 'string' } },
  });
  const env = ENVS.find((e) => e === values.env);
  if (!env) throw new Error(`Name the environment with --env. ${USAGE}`);
  const today = new Date().toISOString().slice(0, 10);
  const from = values.from ?? '';
  const to = values.to ?? today;
  if (!DATE.test(from) || !DATE.test(to) || from > to || to > today) {
    throw new Error(
      `Give --from (and --to, at most today) as YYYY-MM-DD, from before to. ${USAGE}`,
    );
  }

  const pool = createPool(requireEnv('DATABASE_URL'));
  const db = createDatabase(pool);
  try {
    const result = await syncRange(
      { from, to },
      {
        store: databaseRateStore(db),
        fetch,
        timeoutMs: 60_000,
        attempts: 4,
        onWindow: (source, window, inserted) => {
          console.log(`  ${source} ${window.from}..${window.to}: ${inserted} new rates`);
        },
      },
    );

    const countries = JSON.parse(
      readFileSync(join(CONTENT_DIR, 'countries.json'), 'utf8'),
    ) as Record<string, { currency: string }>;
    const currencies = [...new Set(Object.values(countries).map((c) => c.currency))].sort();
    const rows = await rateSpans(db, currencies);
    const spans = new Map(rows.map((r) => [r.currency, r]));
    const without: string[] = [];
    for (const currency of currencies) {
      if (currency === 'USD') continue;
      const span = spans.get(currency);
      if (!span) without.push(currency);
      else console.log(`  ${currency}: ${span.first} to ${span.last}`);
    }
    console.log(`  No rates (CURRENCY_UNSUPPORTED): ${without.join(' ') || 'none'}`);

    const failed = (['ecb', 'fallback'] as const).filter((s) => !result[s].ok);
    for (const source of failed) {
      const outcome = result[source];
      if (!outcome.ok) {
        console.error(
          `  ${source} stopped at ${outcome.failedFrom}: ${outcome.message} Run again with --from ${outcome.failedFrom}.`,
        );
      }
    }
    if (failed.length > 0) throw new Error(`${failed.join(' and ')} did not finish.`);
    const inserted =
      result.ecb.ok && result.fallback.ok ? result.ecb.inserted + result.fallback.inserted : 0;
    return `${env}: ${inserted} new rates from ${from} to ${to}.`;
  } finally {
    await pool.end();
  }
});
