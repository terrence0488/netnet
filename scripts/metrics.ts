/**
 * `pnpm metrics --env <local|preview|production> --from <YYYY-MM-DD> [--to <YYYY-MM-DD>]` prints
 * every launch metric from `analytics.event`, per segment, as `netnet_metrics` (architecture §10,
 * P4-T3). It runs each `ops/metrics/*.sql` with the window and the excluded ids, prints one table
 * per metric with P-A, P-B, P-C, unknown and blended columns, the target, and for M1, M3, M6 and
 * M7 the PRD §3.3 kill reading on P-B and P-C. Aggregates only: no user id, email, name or amount.
 *
 * Reads `DATABASE_METRICS_URL` (the metrics login, read-only on `analytics`) and
 * `METRICS_EXCLUDE_USERS` (comma-separated `usr_` ids; the probe account,
 * `ops/probe.md`). `--to` is inclusive and defaults to today in UTC. The role is checked before
 * any query: `netnet_metrics` cannot read `ledger` or `core`, so no metric can read a balance.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { withClient } from '@netnet/api/db/client';

/** Where the SQL lives, beside this script's repository. */
export const METRICS_DIR = fileURLToPath(new URL('../ops/metrics', import.meta.url));

const ENVS = ['local', 'preview', 'production'] as const;
export type MetricsEnv = (typeof ENVS)[number];

const USAGE =
  'Usage: pnpm metrics --env local|preview|production --from <YYYY-MM-DD> [--to <YYYY-MM-DD>]';

/** The role `DATABASE_METRICS_URL` must connect as (architecture §6.1). */
const METRICS_ROLE = 'netnet_metrics';

/** A `usr_` ULID, the only id shape `METRICS_EXCLUDE_USERS` accepts. */
const USER_ID = /^usr_[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** A query window: `from` and `to` are instants, and `to` is exclusive. */
export interface MetricsWindow {
  /** Midnight UTC of the first day, inclusive. */
  from: Date;
  /** Midnight UTC after the last day, exclusive. */
  to: Date;
  /** `usr_` ids every metric omits. */
  excludeUsers: string[];
}

/** One row a metrics query returns. `channel` is present only in M13's result. */
export interface MetricRow {
  metric: string;
  segment: string;
  channel?: string | null;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
}

export interface MetricResult {
  file: string;
  rows: MetricRow[];
}

/** What `runMetricFile` needs from a connection: `pg`'s `Client` and `PoolClient` both fit. */
export interface MetricClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface ReportHeader {
  env: MetricsEnv;
  /** `YYYY-MM-DD`, inclusive. */
  firstDay: string;
  /** `YYYY-MM-DD`, inclusive. */
  lastDay: string;
  /** How many accounts the readings omit. */
  excluded: number;
}

export interface MetricsIo {
  databaseUrl: string | undefined;
  excludeUsers: string | undefined;
  log: (line: string) => void;
  error: (line: string) => void;
  /** The clock for `--to`'s default; the real one unless a test passes its own. */
  now?: () => Date;
  /** Where `ops/metrics` is; the repository's unless given. */
  dir?: string;
}

/** A refusal this script detected, with a message safe to print. */
export class MetricsRefused extends Error {
  override readonly name = 'MetricsRefused';
}

/* ---------------------------------------------------------------- the files */

/** Every SQL file, sorted (m01, …, m13, n1). */
export function metricFileNames(dir: string = METRICS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

export function readMetricSql(name: string, dir: string = METRICS_DIR): string {
  return readFileSync(join(dir, name), 'utf8');
}

/**
 * The SQL's `:from`, `:to` and `:exclude_users` as bound parameters, so no value is ever
 * interpolated into the text. Every file uses all three.
 */
export function bindMetricSql(
  sql: string,
  window: MetricsWindow,
): { text: string; values: unknown[] } {
  const text = sql.replace(/(?<!:):(from|to|exclude_users)\b/g, (_match, name: string) => {
    if (name === 'from') return '$1::timestamptz';
    if (name === 'to') return '$2::timestamptz';
    return '$3::text[]';
  });
  return {
    text,
    values: [window.from.toISOString(), window.to.toISOString(), window.excludeUsers],
  };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toMetricRow(row: Record<string, unknown>): MetricRow {
  const metric = typeof row.metric === 'string' ? row.metric : '';
  const segment = typeof row.segment === 'string' ? row.segment : '';
  if (metric === '' || segment === '') {
    throw new Error('A metrics query returned no metric or segment.');
  }
  const base = {
    metric,
    segment,
    numerator: numberOrNull(row.numerator),
    denominator: numberOrNull(row.denominator),
    value: numberOrNull(row.value),
  };
  if (!Object.hasOwn(row, 'channel')) return base;
  const channel = row.channel;
  if (channel !== null && typeof channel !== 'string') {
    throw new Error('A metrics query returned a channel that is not text.');
  }
  return { ...base, channel };
}

/** Runs one SQL file and returns its rows, with numeric strings turned into numbers. */
export async function runMetricFile(
  client: MetricClient,
  name: string,
  window: MetricsWindow,
  dir: string = METRICS_DIR,
): Promise<MetricRow[]> {
  const { text, values } = bindMetricSql(readMetricSql(name, dir), window);
  const result = await client.query(text, values);
  return result.rows.map(toMetricRow);
}

/** Runs every file, in file order. */
export async function runAllMetrics(
  client: MetricClient,
  window: MetricsWindow,
  dir: string = METRICS_DIR,
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];
  for (const file of metricFileNames(dir)) {
    results.push({ file, rows: await runMetricFile(client, file, window, dir) });
  }
  return results;
}

/* ---------------------------------------------------------------- the window */

/** A `YYYY-MM-DD` day at midnight UTC, refused if it is not a real calendar day. */
export function parseDay(value: string, flag: string): Date {
  if (!DAY.test(value)) throw new Error(`${flag} must be a date, YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${flag} is not a real calendar day.`);
  }
  return date;
}

/** The UTC day of an instant. */
function utcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/** `--from` and an optional inclusive `--to` (default: today) as a half-open window. */
export function parseWindow(
  from: string,
  to: string | undefined,
  today: Date,
): { from: Date; to: Date; lastDay: string } {
  const start = parseDay(from, '--from');
  const last = to === undefined || to.trim() === '' ? utcDay(today) : parseDay(to, '--to');
  if (last.getTime() < start.getTime()) throw new Error('--to must be on or after --from.');
  return { from: start, to: new Date(last.getTime() + DAY_MS), lastDay: dayOf(last) };
}

function dayOf(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** `METRICS_EXCLUDE_USERS` as ids; refused loudly rather than silently not excluding one. */
export function parseExcludeUsers(value: string | undefined): string[] {
  if (value === undefined) return [];
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
  for (const id of ids) {
    if (!USER_ID.test(id)) {
      throw new Error('METRICS_EXCLUDE_USERS must be comma-separated usr_ ids.');
    }
  }
  return [...new Set(ids)].sort();
}

/* ---------------------------------------------------------------- the tables */

type Unit = 'count' | 'percent' | 'days' | 'minutes' | 'ms' | 'number';

interface MetricSpec {
  title: string;
  target: string;
  unit: Unit;
  /** PRD §3.3's kill threshold, read on P-B and P-C only. */
  kill?: number;
  killNote?: string;
  note?: string;
}

/**
 * Every metric a SQL file may return, its target and its reading. A metric missing here fails the
 * report: a figure never goes out without the target it is read against.
 */
export const METRIC_SPECS: Record<string, MetricSpec> = {
  M1: {
    title: 'M1 Signups',
    target: '100 verified accounts in the window',
    unit: 'count',
    kill: 25,
    killNote: '< 25 signups',
    note: 'Denominator is a count: numerator and value say the same thing.',
  },
  M2: {
    title: 'M2 Picture assembled',
    target: '50% with ≥3 holdings within 7 days',
    unit: 'percent',
    note: 'Denominator: signups whose 7 days had ended by the last day.',
  },
  M3: {
    title: 'M3 Agent connection rate',
    target: '40% connected within 14 days',
    unit: 'percent',
    kill: 15,
    killNote: '< 15%',
    note: 'Denominator: signups whose 14 days had ended by the last day.',
  },
  M4: {
    title: 'M4 Agent write adoption',
    target: '70% with ≥1 successful write',
    unit: 'percent',
    note: 'Connected users: an agent_connection_completed before the last day.',
  },
  'M4 median': {
    title: 'M4 Writes per connected user per month',
    target: 'median ≥ 5 writes per connected user per month',
    unit: 'number',
    note: 'Writes × 30 / the window’s days, per connected user, then the median.',
  },
  M5: {
    title: 'M5 Correction rate',
    target: 'below 10% (above 25% failing)',
    unit: 'percent',
    note: 'age_at_correction is whole days, so “within 48 h” is ≤ 2; the value must have been recorded in the window.',
  },
  M6: {
    title: 'M6 Return rate',
    target: '30% active in week 4',
    unit: 'percent',
    kill: 10,
    killNote: '< 10%',
    note: 'Week 4 is [signup + 21 days, signup + 28 days); denominator: signups whose week 4 had ended.',
  },
  M7: {
    title: 'M7 Advice pull',
    target: '50% with a read query after week 1',
    unit: 'percent',
    kill: 20,
    killNote: '< 20%',
    note: 'After week 1 is at or after signup + 7 days; denominator: connected users whose week 1 had ended.',
  },
  'M7 median': {
    title: 'M7 Read queries per connected user per month',
    target: 'median ≥ 3 read queries per connected user per month',
    unit: 'number',
    note: 'Reads × 30 / each person’s observed days after week 1, then the median.',
  },
  M8: {
    title: 'M8 Freshness',
    target: 'median below 45 days',
    unit: 'days',
    note: 'Days since the last value_recorded; a person with none is measured from their first account event.',
  },
  M9: {
    title: 'M9 Time to value',
    target: 'p50 below 15 minutes',
    unit: 'minutes',
    note: 'The median covers signups with an agent_tool_called; the denominator is all signups.',
  },
  'M10 visitors': {
    title: 'M10 Landing visitors',
    target: '≥ 1,200 (sum of daily uniques)',
    unit: 'count',
    note: 'Each UTC day’s unique visitor hashes, summed: a repeat visitor on another day counts again.',
  },
  'M10 signup started': {
    title: 'M10 Sign-up started',
    target: '—',
    unit: 'count',
    note: 'An anonymous event (no user id), so it cannot be split by segment.',
  },
  'M10 account created': {
    title: 'M10 Accounts created',
    target: '—',
    unit: 'count',
  },
  'M10 verified': {
    title: 'M10 Verified signups',
    target: '—',
    unit: 'count',
  },
  'M10 conversion': {
    title: 'M10 Funnel conversion',
    target: '≥ 8% on ≥ 1,200 visits',
    unit: 'percent',
    note: 'Blended only: landing visitors are anonymous, so they cannot be split by segment.',
  },
  'M11 sessions': {
    title: 'M11 Standalone value (≥2 sessions before connecting)',
    target: '40%',
    unit: 'percent',
    note: 'Sessions before the first agent connection; a person who never connected counts every session.',
  },
  'M11 week 4': {
    title: 'M11 Still active in week 4, never connected',
    target: '15%',
    unit: 'percent',
    note: 'Denominator: signups whose week 4 had ended; “never connected” is by the last day.',
  },
  'M13 comeback': {
    title: 'M13 Comeback rate',
    target: 'push above email',
    unit: 'percent',
    note: 'Checked = session_started or agent_tool_called within 7 days of the reminder.',
  },
  'M13 push': {
    title: 'M13 Push on for ≥1 device (week-4 active)',
    target: '25%',
    unit: 'percent',
    note: 'push_enabled − push_disabled per person by the end of their week 4; the events carry no device id.',
  },
  'n1 calls': {
    title: 'N1 Calls (7 days)',
    target: '≥ 50 calls for a reading',
    unit: 'count',
  },
  'n1 success': {
    title: 'N1 Success rate (7 days)',
    target: '≥ 99.5%',
    unit: 'percent',
  },
  'n1 p95': {
    title: 'N1 p95 latency (7 days)',
    target: '≤ 1,500 ms',
    unit: 'ms',
  },
};

const COLUMNS = [
  { key: 'starting_out', label: 'P-A' },
  { key: 'accumulating', label: 'P-B' },
  { key: 'established', label: 'P-C' },
  { key: 'unknown', label: 'Unknown' },
  { key: 'blended', label: 'Blended' },
] as const;

const SEGMENTS_IN_ORDER = new Set<string>(COLUMNS.map((column) => column.key));
const COUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function formatCount(value: number | null): string {
  return value === null ? '—' : COUNT.format(value);
}

function formatValue(value: number | null, unit: Unit): string {
  if (value === null) return '—';
  switch (unit) {
    case 'count':
      return formatCount(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'days':
      return `${value.toFixed(1)} d`;
    case 'minutes':
      return `${value.toFixed(1)} min`;
    case 'ms':
      return `${formatCount(Math.round(value))} ms`;
    case 'number':
      return value.toFixed(1);
  }
}

interface Group {
  metric: string;
  channel: string | null;
  rows: MetricRow[];
}

/** One group per metric and channel, in the order the SQL returned them. */
function groupsOf(results: readonly MetricResult[]): Group[] {
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  for (const result of results) {
    for (const row of result.rows) {
      if (!SEGMENTS_IN_ORDER.has(row.segment)) {
        throw new Error(`Unknown segment "${row.segment}" in ${result.file}.`);
      }
      const channel = row.channel ?? null;
      const key = `${row.metric}\u0000${channel ?? ''}`;
      let group = index.get(key);
      if (group === undefined) {
        group = { metric: row.metric, channel, rows: [] };
        index.set(key, group);
        groups.push(group);
      }
      group.rows.push(row);
    }
  }
  return groups;
}

function cell(
  group: Group,
  spec: MetricSpec,
  segment: string,
  field: 'numerator' | 'denominator' | 'value',
): string {
  const row = group.rows.find((candidate) => candidate.segment === segment);
  if (row === undefined) return '—';
  if (field === 'value') return formatValue(row.value, spec.unit);
  return formatCount(row[field]);
}

function killCells(group: Group, kill: number): string[] {
  const valueOf = (segment: string): number | null =>
    group.rows.find((row) => row.segment === segment)?.value ?? null;
  return COLUMNS.map((column) => {
    if (column.key === 'blended') return 'never read';
    if (column.key === 'starting_out' || column.key === 'unknown') return '—';
    const value = valueOf(column.key);
    if (value === null) return '—';
    return value < kill ? 'KILL' : 'ok';
  });
}

/** The report: a heading per metric, its target, and one table per segment reading. */
export function renderReport(results: readonly MetricResult[], header: ReportHeader): string {
  const lines = [
    '# NetNet metrics',
    '',
    `Environment: ${header.env} · window ${header.firstDay} → ${header.lastDay} (UTC, inclusive) · excluded accounts: ${header.excluded}.`,
    '',
    'Segments: P-A starting out · P-B accumulating · P-C established · Unknown · Blended.',
    '',
  ];
  for (const group of groupsOf(results)) {
    const spec = METRIC_SPECS[group.metric];
    if (spec === undefined) {
      throw new Error(`No target for metric "${group.metric}" (scripts/metrics.ts).`);
    }
    const title = group.channel === null ? spec.title : `${spec.title} (${group.channel})`;
    lines.push(`### ${title}`, '', `Target: ${spec.target}.`);
    if (spec.kill !== undefined) {
      lines.push(
        `Kill threshold: ${spec.killNote ?? 'below the target'} — read on P-B and P-C only (PRD §3.3).`,
      );
    }
    if (spec.note !== undefined) lines.push(spec.note);
    lines.push(
      '',
      '| Reading | P-A | P-B | P-C | Unknown | Blended |',
      '| --- | --- | --- | --- | --- | --- |',
      `| numerator | ${COLUMNS.map((column) => cell(group, spec, column.key, 'numerator')).join(' | ')} |`,
      `| denominator | ${COLUMNS.map((column) => cell(group, spec, column.key, 'denominator')).join(' | ')} |`,
      `| value | ${COLUMNS.map((column) => cell(group, spec, column.key, 'value')).join(' | ')} |`,
    );
    if (spec.kill !== undefined) {
      const kill = spec.kill;
      lines.push(`| kill | ${killCells(group, kill).join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/* ---------------------------------------------------------------- the command */

function kindOf(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const code = (current as { code?: unknown }).code;
    // A Postgres SQLSTATE or a Node socket error; neither carries the connection string.
    if (typeof code === 'string' && /^[0-9A-Z_]{5,}$/.test(code)) return `${name}, ${code}`;
  }
  return name;
}

/** The script: returns its exit code. */
export async function main(args: readonly string[], io: MetricsIo): Promise<number> {
  let values: { env?: string | undefined; from?: string | undefined; to?: string | undefined };
  try {
    values = parseArgs({
      args: [...args],
      options: {
        env: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
    }).values;
  } catch {
    io.error(`metrics: ${USAGE}`);
    return 1;
  }
  const env = ENVS.find((candidate) => candidate === values.env);
  const from = values.from;
  if (env === undefined || from === undefined) {
    io.error(`metrics: ${USAGE}`);
    return 1;
  }
  if (!io.databaseUrl) {
    io.error('metrics: DATABASE_METRICS_URL is not set (see .env.example).');
    return 1;
  }

  let window: MetricsWindow;
  let lastDay: string;
  try {
    const today = io.now?.() ?? new Date();
    const parsed = parseWindow(from, values.to, today);
    lastDay = parsed.lastDay;
    window = {
      from: parsed.from,
      to: parsed.to,
      excludeUsers: parseExcludeUsers(io.excludeUsers),
    };
  } catch (error) {
    io.error(`metrics: ${error instanceof Error ? error.message : 'bad arguments'}`);
    return 1;
  }

  try {
    const results = await withClient(io.databaseUrl, async (client) => {
      const { rows } = await client.query<{ current_user: string }>('select current_user');
      const role = rows[0]?.current_user;
      if (role !== METRICS_ROLE) {
        throw new MetricsRefused(
          `DATABASE_METRICS_URL connects as ${role ?? 'no role'}, not ${METRICS_ROLE}; it must be the read-only metrics login.`,
        );
      }
      return runAllMetrics(client, window, io.dir);
    });
    io.log(
      renderReport(results, {
        env,
        firstDay: from,
        lastDay,
        excluded: window.excludeUsers.length,
      }),
    );
    return 0;
  } catch (error) {
    io.error(
      `metrics: ${error instanceof MetricsRefused ? error.message : `failed (${kindOf(error)})`}`,
    );
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), {
    databaseUrl: process.env.DATABASE_METRICS_URL,
    excludeUsers: process.env.METRICS_EXCLUDE_USERS,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
}
