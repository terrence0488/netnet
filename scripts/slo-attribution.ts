/**
 * `pnpm slo:attribute [--days <n>] [--to <YYYY-MM-DD>] [--user <usr_…>]` lists the
 * `agent_tool_called` events that were **not** `ok` in the window, so a fired `slo_success` trigger
 * can be attributed to a tool, an outcome and an account instead of being accepted or explained
 * away (ops/launch-readiness.md, N1). With `--user` it answers the next question — who that account
 * is — from its own event names, versions and dates, and nothing else.
 *
 * This is a diagnosis, never a metric: it is the only reader of `analytics.event` that prints a
 * user id, and it prints one only for the handful of non-ok calls. It reads `DATABASE_METRICS_URL`
 * (the read-only `netnet_metrics` login) and `METRICS_EXCLUDE_USERS`, refuses any other role, and
 * prints the same arithmetic `ops/metrics/n1-slo.sql` uses — calls, ok, success rate — so the
 * reading in the alert can be reproduced line by line. No amount, name, email or free text exists
 * in `agent_tool_called`'s props to print (CONVENTIONS §6; packages/contracts/src/events.ts).
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { withClient } from '@netnet/api/db/client';
import { parseExcludeUsers } from './metrics';

/** The role `DATABASE_METRICS_URL` must connect as (architecture §6.1). */
const METRICS_ROLE = 'netnet_metrics';

/** A `usr_` ULID, the only id shape `--user` accepts (`METRICS_EXCLUDE_USERS` uses the same). */
const USER_ID = /^usr_[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const DAY_MS = 86_400_000;

const USAGE = 'Usage: pnpm slo:attribute [--days <n>] [--to <YYYY-MM-DD>] [--user <usr_\u2026>]';

/** One `agent_tool_called` row, exactly as `analytics.event` holds it. */
export interface AgentCall {
  at: Date;
  user_id: string | null;
  tool: string | null;
  kind: string | null;
  outcome: string | null;
  client: string | null;
  latency_ms: number | null;
}

/** The window's arithmetic: the same three figures as `ops/metrics/n1-slo.sql`. */
export interface Tally {
  calls: number;
  ok: number;
  nonOk: number;
}

export interface Attribution {
  window: { from: Date; to: Date };
  excludeUsers: string[];
  /** Every call in the window, before exclusions. */
  all: Tally;
  /** The same window with `METRICS_EXCLUDE_USERS` removed — what the SLO actually reads. */
  counted: Tally;
  /** The non-ok calls, oldest first, with the excluded ones still marked. */
  calls: AgentCall[];
}

/** A half-open window of `days` days ending at `to` (exclusive), like the SLO's 7-day reading. */
export function windowEndingAt(days: number, to: Date): { from: Date; to: Date } {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('--days must be a whole number from 1 to 90.');
  }
  return { from: new Date(to.getTime() - days * DAY_MS), to };
}

/** `--to` is a UTC day (inclusive) or absent for now. */
export function endOf(to: string | undefined, now: Date): Date {
  if (to === undefined || to.trim() === '') return now;
  const day = to.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('--to must be YYYY-MM-DD.');
  const start = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error('--to must be a real date.');
  return new Date(start.getTime() + DAY_MS);
}

/** The one query: every `agent_tool_called` in the window, ok and not, so the rate is provable. */
export const CALLS_SQL = `select e.at,
       e.user_id,
       e.props->>'tool' as tool,
       e.props->>'kind' as kind,
       e.props->>'outcome' as outcome,
       e.props->>'client' as client,
       (e.props->>'latency_ms')::int as latency_ms
  from analytics.event e
 where e.name = 'agent_tool_called'
   and e.at >= $1
   and e.at < $2
 order by e.at`;

/** Tally rows the way `n1-slo.sql` counts them: `ok` is the only success. */ export function tally(
  calls: AgentCall[],
): Tally {
  const ok = calls.filter((call) => call.outcome === 'ok').length;
  return { calls: calls.length, ok, nonOk: calls.length - ok };
}

/** The percentage `n1-slo.sql` rounds to one decimal, or null on a quiet window. */
export function successRate(reading: Tally): number | null {
  if (reading.calls === 0) return null;
  return Math.round((1000 * reading.ok) / reading.calls) / 10;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/** The report: one header, the arithmetic, then one line per non-ok call. */
export function renderReport(attribution: Attribution): string {
  const { window, excludeUsers } = attribution;
  const lines: string[] = [
    `SLO attribution · window ${window.from.toISOString()} → ${window.to.toISOString()} · excluded accounts: ${excludeUsers.length}`,
    '',
    `agent_tool_called: ${attribution.counted.calls} counted, ${attribution.counted.ok} ok, ` +
      `${attribution.counted.nonOk} not ok, success ${successRate(attribution.counted) ?? 'n/a'}% ` +
      `(all calls before exclusions: ${attribution.all.calls}, ${attribution.all.nonOk} not ok)`,
    '',
  ];
  if (attribution.calls.length === 0) {
    lines.push('No non-ok agent_tool_called events in the window.');
    return lines.join('\n');
  }
  lines.push(
    [
      pad('at (UTC)', 20),
      pad('user', 30),
      pad('tool', 24),
      pad('kind', 5),
      pad('outcome', 14),
      pad('client', 10),
      pad('latency_ms', 10),
      'excluded',
    ].join(' '),
  );
  for (const call of attribution.calls) {
    lines.push(
      [
        pad(call.at.toISOString().replace('.000Z', 'Z'), 20),
        pad(call.user_id ?? '(none)', 30),
        pad(call.tool ?? '(none)', 24),
        pad(call.kind ?? '(none)', 5),
        pad(call.outcome ?? '(none)', 14),
        pad(call.client ?? '(none)', 10),
        pad(call.latency_ms === null ? '(none)' : String(call.latency_ms), 10),
        excludeUsers.includes(call.user_id ?? '') ? 'yes' : 'no',
      ].join(' '),
    );
  }
  return lines.join('\n');
}

export interface AttributionIo {
  databaseUrl: string | undefined;
  excludeUsers: string | undefined;
  now: () => Date;
  log: (line: string) => void;
  error: (line: string) => void;
}

/** One event of one account: its name, when, from which release, and the bucket it landed in. */
export interface AccountEvent {
  at: Date;
  name: string;
  segment: string;
  app_version: string;
  has_visitor: boolean;
}

/** The shape of an account, from its own event names: no props, no address, no amount. */
export interface AccountTimeline {
  user: string;
  excluded: boolean;
  window: { from: Date; to: Date };
  events: AccountEvent[];
}

/** One account's events in a window. Names, versions and dates only. */
export const ACCOUNT_SQL = `select e.at,
       e.name,
       e.segment,
       e.app_version,
       e.visitor is not null as has_visitor
  from analytics.event e
 where e.user_id = $1
   and e.at >= $2
   and e.at < $3
 order by e.at`;

/** The account's own record: what it did, on which release, first and last. */
export function renderTimeline(timeline: AccountTimeline): string {
  const { user, events } = timeline;
  const lines = [
    `Account ${user} · ${events.length} events · window ${timeline.window.from.toISOString()} → ${timeline.window.to.toISOString()} · excluded: ${timeline.excluded ? 'yes' : 'no'}`,
  ];
  if (events.length === 0) {
    lines.push('No events for that account in the window.');
    return lines.join('\n');
  }
  const names = new Map<string, number>();
  for (const event of events) names.set(event.name, (names.get(event.name) ?? 0) + 1);
  lines.push(
    `Names: ${[...names.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name}×${count}`)
      .join(', ')}`,
    `Releases: ${[...new Set(events.map((event) => event.app_version))].join(', ')}`,
    '',
    [pad('at (UTC)', 20), pad('name', 26), pad('segment', 12), 'app_version'].join(' '),
  );
  for (const event of events) {
    lines.push(
      [
        pad(event.at.toISOString().replace('.000Z', 'Z'), 20),
        pad(event.name, 26),
        pad(event.segment, 12),
        event.app_version,
      ].join(' '),
    );
  }
  return lines.join('\n');
}

/** Read the window and hand the caller everything `renderReport` needs. */
export async function attribute(
  connectionString: string,
  window: { from: Date; to: Date },
  excludeUsers: string[],
): Promise<Attribution> {
  const rows = await withClient(connectionString, async (client) => {
    const { rows: who } = await client.query<{ current_user: string }>('select current_user');
    const role = who[0]?.current_user;
    if (role !== METRICS_ROLE) {
      throw new Error(
        `DATABASE_METRICS_URL connects as ${role ?? 'no role'}, not ${METRICS_ROLE}; it must be the read-only metrics login.`,
      );
    }
    const { rows: found } = await client.query<AgentCall>(CALLS_SQL, [
      window.from.toISOString(),
      window.to.toISOString(),
    ]);
    return found;
  });

  const counted = rows.filter((call) => !excludeUsers.includes(call.user_id ?? ''));
  return {
    window,
    excludeUsers,
    all: tally(rows),
    counted: tally(counted),
    calls: rows.filter((call) => call.outcome !== 'ok'),
  };
}

/** One account's own events: the answer to "who is this account?" without reading a single prop. */
export async function accountTimeline(
  connectionString: string,
  user: string,
  window: { from: Date; to: Date },
  excludeUsers: string[],
): Promise<AccountTimeline> {
  const events = await withClient(connectionString, async (client) => {
    const { rows: who } = await client.query<{ current_user: string }>('select current_user');
    const role = who[0]?.current_user;
    if (role !== METRICS_ROLE) {
      throw new Error(
        `DATABASE_METRICS_URL connects as ${role ?? 'no role'}, not ${METRICS_ROLE}; it must be the read-only metrics login.`,
      );
    }
    const { rows } = await client.query<AccountEvent>(ACCOUNT_SQL, [
      user,
      window.from.toISOString(),
      window.to.toISOString(),
    ]);
    return rows;
  });
  return { user, excluded: excludeUsers.includes(user), window, events };
}

export async function main(
  argv: string[],
  io: AttributionIo,
  run: typeof attribute = attribute,
  timeline: typeof accountTimeline = accountTimeline,
): Promise<number> {
  let values: { days?: string; to?: string; user?: string };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { days: { type: 'string' }, to: { type: 'string' }, user: { type: 'string' } },
    }));
  } catch {
    io.error(`slo:attribute: ${USAGE}`);
    return 2;
  }
  if (!io.databaseUrl) {
    io.error('slo:attribute: DATABASE_METRICS_URL is not set (see .env.example).');
    return 1;
  }
  let window: { from: Date; to: Date };
  let excludeUsers: string[];
  try {
    const days =
      values.days === undefined ? (values.user === undefined ? 7 : 90) : Number(values.days);
    window = windowEndingAt(days, endOf(values.to, io.now()));
    excludeUsers = parseExcludeUsers(io.excludeUsers);
    if (values.user !== undefined && !USER_ID.test(values.user)) {
      throw new Error('--user must be a usr_ id.');
    }
  } catch (error) {
    io.error(`slo:attribute: ${error instanceof Error ? error.message : 'bad arguments'}`);
    return 2;
  }
  try {
    if (values.user !== undefined) {
      io.log(renderTimeline(await timeline(io.databaseUrl, values.user, window, excludeUsers)));
      return 0;
    }
    io.log(renderReport(await run(io.databaseUrl, window, excludeUsers)));
    return 0;
  } catch (error) {
    io.error(`slo:attribute: ${error instanceof Error ? error.message : 'failed'}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), {
    databaseUrl: process.env.DATABASE_METRICS_URL,
    excludeUsers: process.env.METRICS_EXCLUDE_USERS,
    now: () => new Date(),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
}
