import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOptions, UsageError, USAGE } from './args';
import { WIN_BAR } from './config';
import { runM12 } from './run';
import { SpendRefused, usd } from './spend';

/**
 * `pnpm m12 --approve-spend <usd> [--model <id>] [--runs <n>] [--seed <n>] [--dry-run]` (P4-T9).
 * Reads `DATABASE_URL` (a local Postgres superuser: the harness makes and drops its own database)
 * and, for a paid run, `ANTHROPIC_API_KEY`. A dry run needs neither a key nor network access to
 * the API; it still needs Postgres and the built app, because its NetNet arm is real.
 */

/** Where the command's output goes; the real process unless a test passes its own. */
export interface CliIo {
  readonly env: NodeJS.ProcessEnv;
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

/** The command: returns its exit code. */
export async function main(args: readonly string[], io: CliIo): Promise<number> {
  let options;
  try {
    options = parseOptions(args);
  } catch (error) {
    if (error instanceof UsageError) {
      io.error(`m12: ${error.message}`);
      return 2;
    }
    throw error;
  }
  if (options === null) {
    io.log(USAGE);
    return 0;
  }

  const databaseUrl = io.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    io.error(
      'm12: DATABASE_URL is not set. Point it at a local Postgres superuser (the harness makes ' +
        'and drops its own scratch database), as `pnpm test:int` does.',
    );
    return 1;
  }

  try {
    const result = await runM12(options, {
      databaseUrl,
      ...(io.env['ANTHROPIC_API_KEY'] === undefined ? {} : { apiKey: io.env['ANTHROPIC_API_KEY'] }),
      log: io.log,
    });
    const { summary } = result;
    io.log(
      `m12: ${options.dryRun ? 'dry run' : 'run'} ${result.dir}: ${summary.wins} of ` +
        `${summary.pairs} pairs to NetNet (${percent(summary.winRate)}; the bar is ` +
        `${percent(WIN_BAR)}: ${summary.meetsBar ? 'met' : 'not met'}), ${summary.ties} tied`,
    );
    io.log(
      `m12: fabricated: NetNet ${summary.fabricated.netnet}, spreadsheet ` +
        `${summary.fabricated.spreadsheet} (never worse: ${summary.fabricationBarMet ? 'met' : 'not met'})`,
    );
    io.log(
      `m12: spent ${usd(result.spendUsd)} of ${usd(options.approveSpend)} approved ` +
        `(estimate ${usd(result.estimate.usd)})`,
    );
    io.log(`m12: report: ${result.dir}/report.md`);
    return 0;
  } catch (error) {
    if (error instanceof SpendRefused) {
      io.error(`m12: ${error.message}`);
      return 1;
    }
    io.error(`m12: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), {
    env: process.env,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
}
