/**
 * `pnpm health --env <local|preview|production> [--test-alert]`: the first half of the daily health
 * check (architecture §9.3, §9.4, §10; P4-T4, `ops/health.md`).
 *
 * Reads the two figures only this process can: Neon's billing-period compute and the project's
 * storage (with `NEON_API_KEY` and `NEON_PROD_PROJECT_ID`), and the N1 SLO over 7 days by running
 * `ops/metrics/n1-slo.sql` as `netnet_metrics` (`DATABASE_METRICS_URL`). It posts them, with
 * `testAlert`, to `POST /api/cron/health` with `CRON_SECRET`; the function adds the figures only it
 * can read from `core`, evaluates every trigger and emails the Founder when one fired. The reader
 * prints the response — triggers and figures, counts, sizes and percentages only — and exits 1 when
 * any trigger fired. A source it cannot read is posted as `{unavailable: true}`, so the function
 * still alerts: silence must never hide a gap.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { METRICS_ROLE } from '@netnet/api/db/bootstrap';
import { withClient } from '@netnet/api/db/client';
import type {
  HealthReport,
  HealthResponse,
  NeonFigures,
  Reading,
  SloFigures,
} from '@netnet/api/notify/health-alert';
import {
  METRICS_DIR,
  parseExcludeUsers,
  runMetricFile,
  type MetricRow,
  type MetricsWindow,
} from './metrics';

const NEON_API = 'https://console.neon.tech/api/v2';
const TIMEOUT_MS = 20_000;
const DAY_MS = 24 * 60 * 60_000;
const ENVS = ['local', 'preview', 'production'] as const;
const USAGE = 'Usage: pnpm health --env local|preview|production [--test-alert]';
const UNAVAILABLE = { unavailable: true } as const;

export type HealthEnv = (typeof ENVS)[number];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite number at or above `minimum`, or null. */
function finiteNumber(value: unknown, minimum = 0): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : null;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** The Neon settings this script reads. */
export interface NeonEnv {
  NEON_API_KEY?: string | undefined;
  NEON_PROD_PROJECT_ID?: string | undefined;
}

/**
 * Neon's consumption for the billing period (`GET /projects/{id}`): `compute_time_seconds` is
 * CU-seconds, so /3600 is CU-hours. Neon's `synthetic_storage_size` is deprecated and reports 0,
 * so when it is 0 the default branch's `logical_size` is the storage figure: a lower bound on
 * synthetic storage, which fires no later than the real limit. Storage is decimal GB (1e9 bytes),
 * the unit Neon Free's 0.5 GB limit is stated in. Any failure is `{unavailable: true}`, never a
 * throw.
 */
export async function readNeon(
  env: NeonEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Reading<NeonFigures>> {
  const key = env.NEON_API_KEY?.trim() ?? '';
  const projectId = env.NEON_PROD_PROJECT_ID?.trim() ?? '';
  if (key === '' || projectId === '') return UNAVAILABLE;
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  const projectPath = `${NEON_API}/projects/${encodeURIComponent(projectId)}`;
  try {
    const projectRes = await fetchImpl(projectPath, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!projectRes.ok) return UNAVAILABLE;
    const body = (await projectRes.json()) as { project?: unknown };
    if (!isObject(body.project)) return UNAVAILABLE;
    const computeSeconds = finiteNumber(body.project.compute_time_seconds);
    if (computeSeconds === null) return UNAVAILABLE;
    let storageBytes = finiteNumber(body.project.synthetic_storage_size) ?? 0;
    if (storageBytes <= 0) {
      const branchesRes = await fetchImpl(`${projectPath}/branches?limit=100`, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!branchesRes.ok) return UNAVAILABLE;
      const branches = (await branchesRes.json()) as { branches?: unknown };
      if (!Array.isArray(branches.branches)) return UNAVAILABLE;
      const main = branches.branches.find(
        (branch): branch is Record<string, unknown> => isObject(branch) && branch.default === true,
      );
      const logical = main === undefined ? null : finiteNumber(main.logical_size);
      if (logical === null) return UNAVAILABLE;
      storageBytes = logical;
    }
    return {
      computeCuHours: round(computeSeconds / 3600, 4),
      storageGb: round(storageBytes / 1e9, 6),
    };
  } catch {
    return UNAVAILABLE;
  }
}

/** The settings the N1 reading needs. */
export interface SloEnv {
  DATABASE_METRICS_URL?: string | undefined;
  METRICS_EXCLUDE_USERS?: string | undefined;
}

/** Runs `n1-slo.sql` for one window; the real one connects as `netnet_metrics`. */
export type RunSlo = (url: string, window: MetricsWindow) => Promise<MetricRow[]>;

async function runN1Slo(url: string, window: MetricsWindow): Promise<MetricRow[]> {
  return withClient(url, async (client) => {
    const { rows } = await client.query<{ current_user: string }>('select current_user');
    if (rows[0]?.current_user !== METRICS_ROLE) {
      throw new Error('DATABASE_METRICS_URL is not netnet_metrics');
    }
    return runMetricFile(client, 'n1-slo.sql', window, METRICS_DIR);
  });
}

/** The SLO's three rows as the report posts them: calls, success rate and p95. */
export function sloFromRows(rows: readonly MetricRow[]): Reading<SloFigures> {
  const valueOf = (metric: string): number | null =>
    rows.find((row) => row.metric === metric)?.value ?? null;
  const calls = valueOf('n1 calls');
  if (calls === null) return UNAVAILABLE;
  return { calls, successRate: valueOf('n1 success'), p95Ms: valueOf('n1 p95') };
}

/**
 * The N1 SLO over the 7 days ending at `today`, as `netnet_metrics` (architecture §6.1, §10):
 * `netnet_app` cannot read `analytics.event`. The probe account and every other excluded id are
 * removed by `METRICS_EXCLUDE_USERS`, as `pnpm metrics` does. Any failure is
 * `{unavailable: true}`.
 */
export async function readSlo(
  env: SloEnv,
  today: Date,
  run: RunSlo = runN1Slo,
): Promise<Reading<SloFigures>> {
  const url = env.DATABASE_METRICS_URL?.trim() ?? '';
  if (url === '') return UNAVAILABLE;
  let excludeUsers: string[];
  try {
    excludeUsers = parseExcludeUsers(env.METRICS_EXCLUDE_USERS);
  } catch {
    return UNAVAILABLE;
  }
  const window: MetricsWindow = {
    from: new Date(today.getTime() - 7 * DAY_MS),
    to: today,
    excludeUsers,
  };
  try {
    return sloFromRows(await run(url, window));
  } catch {
    return UNAVAILABLE;
  }
}

/** What `main` needs: the environment, the clock, the network and where to print. */
export interface HealthIo {
  env: NodeJS.ProcessEnv;
  now: () => Date;
  fetch: typeof fetch;
  log: (line: string) => void;
  error: (line: string) => void;
  /** Test seams: the real readers unless given. */
  readNeon?: ((env: NeonEnv, fetchImpl: typeof fetch) => Promise<Reading<NeonFigures>>) | undefined;
  readSlo?: ((env: SloEnv, today: Date) => Promise<Reading<SloFigures>>) | undefined;
}

/**
 * The command: returns its exit code. It posts the report and prints the handler's response; a
 * trigger fired (or the report could not be sent) is exit 1, silence is exit 0.
 */
export async function main(args: readonly string[], io: HealthIo): Promise<number> {
  let values: { env?: string | undefined; 'test-alert'?: boolean | undefined };
  try {
    values = parseArgs({
      args: [...args],
      options: {
        env: { type: 'string' },
        'test-alert': { type: 'boolean' },
      },
    }).values;
  } catch {
    io.error(`health: ${USAGE}`);
    return 1;
  }
  if (values.env === undefined || !ENVS.some((env) => env === values.env)) {
    io.error(`health: ${USAGE}`);
    return 1;
  }
  const origin = (io.env.PUBLIC_ORIGIN ?? '').replace(/\/+$/, '');
  const secret = io.env.CRON_SECRET ?? '';
  if (origin === '' || secret === '') {
    io.error('health: PUBLIC_ORIGIN and CRON_SECRET must both be set (see .env.example).');
    return 1;
  }

  const today = io.now();
  const readNeonFigure = io.readNeon ?? readNeon;
  const readSloFigure = io.readSlo ?? ((env, at) => readSlo(env, at));
  const [neon, slo] = await Promise.all([
    readNeonFigure(io.env, io.fetch),
    readSloFigure(io.env, today),
  ]);
  const report: HealthReport = { neon, slo, testAlert: values['test-alert'] === true };

  let response: HealthResponse;
  try {
    const res = await io.fetch(`${origin}/api/cron/health`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      io.error(
        `health: /api/cron/health answered HTTP ${res.status}${
          text === '' ? '' : `: ${text.slice(0, 500)}`
        }`,
      );
      return 1;
    }
    const parsed: unknown = text === '' ? undefined : JSON.parse(text);
    if (!isObject(parsed) || !Array.isArray(parsed.triggers)) {
      io.error('health: /api/cron/health answered without a trigger list.');
      return 1;
    }
    response = parsed as unknown as HealthResponse;
  } catch (error) {
    io.error(`health: the request failed (${error instanceof Error ? error.name : typeof error}).`);
    return 1;
  }

  io.log(JSON.stringify(response, null, 2));
  return response.triggers.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), {
    env: process.env,
    now: () => new Date(),
    fetch,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
}
