import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  METRIC_SPECS,
  METRICS_DIR,
  metricFileNames,
  runAllMetrics,
  runMetricFile,
  type MetricRow,
  type MetricsWindow,
} from '../../../../scripts/metrics';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';

/**
 * Every metric from `ops/metrics/*.sql`, against Postgres as `netnet_metrics`: the role can read
 * `analytics.event` and nothing else, which is what makes a balance unreadable here. Each reading
 * is checked against a hand count on a fictional fixture covering every segment, both M13
 * channels and the edge cases the files document. Dates are UTC; the window is January and
 * February 2026, with March 2 exclusive.
 */
let db: TestDatabase;
let metrics: PoolClient;
let window: MetricsWindow;

const WINDOW: MetricsWindow = {
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2026-03-02T00:00:00Z'),
  excludeUsers: [],
};

type Segment = 'starting_out' | 'accumulating' | 'established' | 'unknown';

interface FixtureEvent {
  name: string;
  at: string;
  userId?: string;
  segment?: Segment;
  props?: Record<string, unknown>;
  visitor?: string;
}

const A = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const B = 'usr_01K1G4KX00BBBBBBBBBBBBBBBB';
const C = 'usr_01K1G4KX00CCCCCCCCCCCCCCCC';
const D = 'usr_01K1G4KX00DDDDDDDDDDDDDDDD';
const E = 'usr_01K1G4KX00EEEEEEEEEEEEEEEE';
const F = 'usr_01K1G4KX00FFFFFFFFFFFFFFFF';
const G = 'usr_01K1G4KX00GGGGGGGGGGGGGGGG';

function accountCreated(
  userId: string,
  at: string,
  method: 'email' | 'google' | 'apple',
): FixtureEvent {
  return { name: 'account_created', at, userId, segment: 'unknown', props: { method } };
}

function emailVerified(userId: string, at: string): FixtureEvent {
  return { name: 'email_verified', at, userId, segment: 'unknown' };
}

function session(userId: string, at: string, segment: Segment): FixtureEvent {
  return { name: 'session_started', at, userId, segment };
}

function connection(userId: string, at: string, segment: Segment): FixtureEvent {
  return {
    name: 'agent_connection_completed',
    at,
    userId,
    segment,
    props: { client: 'claude', entry: 'agent' },
  };
}

function agentCall(
  userId: string,
  at: string,
  segment: Segment,
  kind: 'read' | 'write',
  outcome = 'ok',
  latencyMs = 100,
): FixtureEvent {
  return {
    name: 'agent_tool_called',
    at,
    userId,
    segment,
    props: {
      tool: kind === 'read' ? 'get_financial_context' : 'record_values',
      kind,
      outcome,
      latency_ms: latencyMs,
      client: 'claude',
    },
  };
}

function holding(userId: string, at: string, segment: Segment): FixtureEvent {
  return {
    name: 'holding_created',
    at,
    userId,
    segment,
    props: { source: 'web', via: 'guided' },
  };
}

function valueRecorded(
  userId: string,
  at: string,
  segment: Segment,
  source: 'web' | 'agent',
): FixtureEvent {
  return { name: 'value_recorded', at, userId, segment, props: { source } };
}

function valueCorrected(
  userId: string,
  at: string,
  segment: Segment,
  originalSource: 'web' | 'agent' | 'system',
  ageAtCorrection: number,
): FixtureEvent {
  return {
    name: 'value_corrected',
    at,
    userId,
    segment,
    props: { original_source: originalSource, age_at_correction: ageAtCorrection },
  };
}

function reminderSent(
  userId: string,
  at: string,
  segment: Segment,
  channel: 'email' | 'push',
): FixtureEvent {
  return { name: 'reminder_sent', at, userId, segment, props: { channel } };
}

function pushEnabled(userId: string, at: string, segment: Segment): FixtureEvent {
  return { name: 'push_enabled', at, userId, segment, props: { platform: 'desktop' } };
}

function pushDisabled(
  userId: string,
  at: string,
  segment: Segment,
  by: 'user' | 'browser' | 'signout',
): FixtureEvent {
  return { name: 'push_disabled', at, userId, segment, props: { platform: 'desktop', by } };
}

/** A social sign-up and a first session, which carries the person's segment. */
function googleSignup(userId: string, at: string, segment: Segment): FixtureEvent[] {
  return [accountCreated(userId, at, 'google'), session(userId, at, segment)];
}

async function seed(events: readonly FixtureEvent[]): Promise<void> {
  await db.owner.query('truncate analytics.event');
  for (const event of events) {
    await db.owner.query(
      `insert into analytics.event (name, at, user_id, visitor, segment, props, app_version)
       values ($1, $2, $3, $4, $5, $6::jsonb, 'test')`,
      [
        event.name,
        event.at,
        event.userId ?? null,
        event.visitor ?? null,
        event.segment ?? 'unknown',
        JSON.stringify(event.props ?? {}),
      ],
    );
  }
}

const SEGMENT_ORDER = ['starting_out', 'accumulating', 'established', 'unknown', 'blended'];

/** Rows in the reading order the PRD uses: segment, then channel, then metric. */
function sorted(rows: readonly MetricRow[]): MetricRow[] {
  const segmentOrder = (segment: string): number => SEGMENT_ORDER.indexOf(segment);
  return [...rows].sort(
    (left, right) =>
      left.metric.localeCompare(right.metric) ||
      (left.channel ?? '').localeCompare(right.channel ?? '') ||
      segmentOrder(left.segment) - segmentOrder(right.segment),
  );
}

async function run(file: string, excludeUsers: string[] = []): Promise<MetricRow[]> {
  return runMetricFile(metrics, file, { ...window, excludeUsers });
}

function r(
  metric: string,
  segment: string,
  numerator: number | null,
  denominator: number | null,
  value: number | null,
): MetricRow {
  return { metric, segment, numerator, denominator, value };
}

function rc(
  metric: string,
  segment: string,
  channel: string | null,
  numerator: number | null,
  denominator: number | null,
  value: number | null,
): MetricRow {
  return { metric, segment, channel, numerator, denominator, value };
}

beforeAll(async () => {
  db = await createTestDatabase();
  metrics = await db.owner.connect();
  await metrics.query('set role netnet_metrics');
  window = WINDOW;
}, 60_000);

afterAll(async () => {
  await metrics?.query('reset role');
  metrics?.release();
  await db?.close();
});

describe('the metrics SQL', () => {
  it('runs every file under the metrics role, and every label has a target', async () => {
    const results = await runAllMetrics(metrics, window);
    expect(results.map((result) => result.file)).toStrictEqual(metricFileNames(METRICS_DIR));
    for (const result of results) {
      for (const row of result.rows) {
        expect(METRIC_SPECS[row.metric], `${result.file}: ${row.metric}`).toBeDefined();
      }
    }
  }, 30_000);

  it('gives every file the three parameters and a header with the PRD reading', () => {
    for (const file of metricFileNames(METRICS_DIR)) {
      const sql = readFileSync(join(METRICS_DIR, file), 'utf8');
      expect(sql, file).toContain(':from');
      expect(sql, file).toContain(':to');
      expect(sql, file).toContain(':exclude_users');
      if (file !== 'n1-slo.sql') expect(sql, file).toContain('PRD');
      expect(sql, file).toContain('Reads');
    }
  });

  it('M1 counts verified accounts, joins their unknown events to the account, and excludes ids', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      accountCreated(B, '2026-01-03T10:00:00Z', 'email'),
      accountCreated(C, '2026-01-04T10:00:00Z', 'email'),
      emailVerified(C, '2026-01-05T10:00:00Z'),
      session(C, '2026-01-04T11:00:00Z', 'established'),
      ...googleSignup(D, '2026-01-06T10:00:00Z', 'starting_out'),
      // Created before the window: not a signup in it, even though it verified inside.
      accountCreated(E, '2025-12-31T10:00:00Z', 'email'),
      emailVerified(E, '2026-01-02T10:00:00Z'),
      session(E, '2026-01-02T11:00:00Z', 'accumulating'),
      // Onboarding skipped: the person's segment stays unknown.
      accountCreated(F, '2026-01-07T10:00:00Z', 'google'),
      // The probe account: excluded by id.
      ...googleSignup(G, '2026-01-08T10:00:00Z', 'accumulating'),
    ]);
    expect(sorted(await run('m01-signups.sql', [G]))).toStrictEqual([
      r('M1', 'starting_out', 1, null, 1),
      r('M1', 'accumulating', 1, null, 1),
      r('M1', 'established', 1, null, 1),
      r('M1', 'unknown', 1, null, 1),
      r('M1', 'blended', 4, null, 4),
    ]);
  });

  it('M2 counts holdings per value within 7 × 24 h, and only mature signups', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      holding(A, '2026-01-03T10:00:00Z', 'accumulating'),
      holding(A, '2026-01-04T10:00:00Z', 'accumulating'),
      holding(A, '2026-01-05T10:00:00Z', 'accumulating'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'established'),
      holding(B, '2026-01-04T10:00:00Z', 'established'),
      holding(B, '2026-01-05T10:00:00Z', 'established'),
      ...googleSignup(C, '2026-01-04T10:00:00Z', 'starting_out'),
      holding(C, '2026-01-05T10:00:00Z', 'starting_out'),
      holding(C, '2026-01-06T10:00:00Z', 'starting_out'),
      // Exactly 7 days after C's signup: outside the 7 × 24 h window.
      holding(C, '2026-01-11T10:00:00Z', 'starting_out'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      holding(D, '2026-01-06T10:00:00Z', 'unknown'),
      holding(D, '2026-01-07T10:00:00Z', 'unknown'),
      holding(D, '2026-01-08T10:00:00Z', 'unknown'),
      // Immature at the last day (7 days end March 4), so not in the denominator.
      ...googleSignup(E, '2026-02-25T10:00:00Z', 'accumulating'),
      holding(E, '2026-03-01T10:00:00Z', 'accumulating'),
      holding(E, '2026-03-01T11:00:00Z', 'accumulating'),
      holding(E, '2026-03-01T12:00:00Z', 'accumulating'),
      ...googleSignup(G, '2026-01-06T10:00:00Z', 'established'),
      holding(G, '2026-01-07T10:00:00Z', 'established'),
      holding(G, '2026-01-08T10:00:00Z', 'established'),
      holding(G, '2026-01-09T10:00:00Z', 'established'),
    ]);
    expect(sorted(await run('m02-picture-assembled.sql', [G]))).toStrictEqual([
      r('M2', 'starting_out', 0, 1, 0),
      r('M2', 'accumulating', 1, 1, 100),
      r('M2', 'established', 0, 1, 0),
      r('M2', 'unknown', 1, 1, 100),
      r('M2', 'blended', 2, 4, 50),
    ]);
  });

  it('M3 counts a completed connection within 14 × 24 h of the signup', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      connection(A, '2026-01-10T10:00:00Z', 'accumulating'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'established'),
      connection(B, '2026-01-20T10:00:00Z', 'established'),
      ...googleSignup(C, '2026-01-04T10:00:00Z', 'starting_out'),
      connection(C, '2026-01-05T10:00:00Z', 'starting_out'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      // Immature at the last day (14 days end March 6).
      ...googleSignup(E, '2026-02-20T10:00:00Z', 'accumulating'),
      connection(E, '2026-02-21T10:00:00Z', 'accumulating'),
      ...googleSignup(G, '2026-01-06T10:00:00Z', 'established'),
      connection(G, '2026-01-07T10:00:00Z', 'established'),
    ]);
    expect(sorted(await run('m03-agent-connection.sql', [G]))).toStrictEqual([
      r('M3', 'starting_out', 1, 1, 100),
      r('M3', 'accumulating', 1, 1, 100),
      r('M3', 'established', 0, 1, 0),
      r('M3', 'unknown', 0, 1, 0),
      r('M3', 'blended', 2, 4, 50),
    ]);
  });

  it('M4 counts successful writes per connected user, and scales the median to 30 days', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      connection(A, '2026-01-02T11:00:00Z', 'accumulating'),
      agentCall(A, '2026-01-03T10:00:00Z', 'accumulating', 'write'),
      agentCall(A, '2026-01-04T10:00:00Z', 'accumulating', 'write'),
      agentCall(A, '2026-01-05T10:00:00Z', 'accumulating', 'write'),
      agentCall(A, '2026-01-05T11:00:00Z', 'accumulating', 'write', 'INTERNAL'),
      agentCall(A, '2026-01-06T10:00:00Z', 'accumulating', 'read'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'established'),
      connection(B, '2026-01-03T11:00:00Z', 'established'),
      ...googleSignup(C, '2026-01-04T10:00:00Z', 'starting_out'),
      connection(C, '2026-01-04T11:00:00Z', 'starting_out'),
      ...googleSignup(E, '2026-01-05T10:00:00Z', 'accumulating'),
      connection(E, '2026-01-05T11:00:00Z', 'accumulating'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      // C and E have five successful writes each; A has three; B none. The window is 60 days.
      agentCall(C, '2026-01-05T10:30:00Z', 'starting_out', 'write'),
      agentCall(C, '2026-01-06T10:00:00Z', 'starting_out', 'write'),
      agentCall(C, '2026-01-07T10:00:00Z', 'starting_out', 'write'),
      agentCall(C, '2026-01-08T10:00:00Z', 'starting_out', 'write'),
      agentCall(C, '2026-01-09T10:00:00Z', 'starting_out', 'write'),
      agentCall(E, '2026-01-06T10:00:00Z', 'accumulating', 'write'),
      agentCall(E, '2026-01-07T10:00:00Z', 'accumulating', 'write'),
      agentCall(E, '2026-01-08T10:00:00Z', 'accumulating', 'write'),
      agentCall(E, '2026-01-09T10:00:00Z', 'accumulating', 'write'),
      agentCall(E, '2026-01-10T10:00:00Z', 'accumulating', 'write'),
      // The probe account is connected with four writes, and excluded.
      ...googleSignup(G, '2026-01-06T10:00:00Z', 'established'),
      connection(G, '2026-01-06T11:00:00Z', 'established'),
      agentCall(G, '2026-01-07T10:00:00Z', 'established', 'write'),
      agentCall(G, '2026-01-08T10:00:00Z', 'established', 'write'),
      agentCall(G, '2026-01-09T10:00:00Z', 'established', 'write'),
      agentCall(G, '2026-01-10T10:00:00Z', 'established', 'write'),
    ]);
    const rows = await run('m04-agent-writes.sql', [G]);
    expect(sorted(rows.filter((row) => row.metric === 'M4'))).toStrictEqual([
      r('M4', 'starting_out', 1, 1, 100),
      r('M4', 'accumulating', 2, 2, 100),
      r('M4', 'established', 0, 1, 0),
      r('M4', 'unknown', 0, 0, null),
      r('M4', 'blended', 3, 4, 75),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M4 median'))).toStrictEqual([
      r('M4 median', 'starting_out', 1, 1, 2.5),
      r('M4 median', 'accumulating', 2, 2, 2),
      r('M4 median', 'established', 1, 1, 0),
      r('M4 median', 'unknown', 0, 0, null),
      r('M4 median', 'blended', 4, 4, 2),
    ]);
  });

  it('M5 counts agent values corrected within 48 h (whole days ≤ 2)', async () => {
    await seed([
      valueRecorded(A, '2026-01-10T10:00:00Z', 'accumulating', 'agent'),
      valueCorrected(A, '2026-01-11T10:00:00Z', 'accumulating', 'agent', 1),
      valueRecorded(A, '2026-01-12T10:00:00Z', 'accumulating', 'agent'),
      valueCorrected(A, '2026-01-16T10:00:00Z', 'accumulating', 'agent', 4),
      valueRecorded(A, '2026-01-20T10:00:00Z', 'accumulating', 'agent'),
      valueRecorded(A, '2026-01-21T10:00:00Z', 'accumulating', 'web'),
      valueCorrected(A, '2026-01-21T10:00:00Z', 'accumulating', 'web', 0),
      valueRecorded(B, '2026-01-10T10:00:00Z', 'established', 'agent'),
      valueCorrected(B, '2026-01-10T10:00:00Z', 'established', 'agent', 0),
      // Recorded before the window: the correction's implied record is outside it too.
      valueRecorded(C, '2025-12-30T10:00:00Z', 'starting_out', 'agent'),
      valueCorrected(C, '2026-01-01T10:00:00Z', 'starting_out', 'agent', 2),
      valueRecorded(C, '2026-01-05T10:00:00Z', 'starting_out', 'agent'),
      valueRecorded(D, '2026-01-10T10:00:00Z', 'unknown', 'agent'),
      valueCorrected(D, '2026-01-12T10:00:00Z', 'unknown', 'agent', 2),
      valueRecorded(G, '2026-01-10T10:00:00Z', 'accumulating', 'agent'),
      valueCorrected(G, '2026-01-11T10:00:00Z', 'accumulating', 'agent', 1),
    ]);
    expect(sorted(await run('m05-corrections.sql', [G]))).toStrictEqual([
      r('M5', 'starting_out', 0, 1, 0),
      r('M5', 'accumulating', 1, 3, 33.3),
      r('M5', 'established', 1, 1, 100),
      r('M5', 'unknown', 1, 1, 100),
      r('M5', 'blended', 3, 6, 50),
    ]);
  });

  it('M6 counts any web or agent activity in week 4, both boundaries exact', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      session(A, '2026-01-23T10:00:00Z', 'accumulating'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'established'),
      session(B, '2026-01-31T10:00:00Z', 'established'),
      ...googleSignup(C, '2026-01-04T10:00:00Z', 'starting_out'),
      agentCall(C, '2026-01-25T10:00:00Z', 'starting_out', 'read'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      session(D, '2026-02-20T10:00:00Z', 'unknown'),
      // Week 4 has not ended by the last day.
      ...googleSignup(E, '2026-02-10T10:00:00Z', 'accumulating'),
      ...googleSignup(G, '2026-01-06T10:00:00Z', 'established'),
      session(G, '2026-01-27T10:00:00Z', 'established'),
    ]);
    expect(sorted(await run('m06-return.sql', [G]))).toStrictEqual([
      r('M6', 'starting_out', 1, 1, 100),
      r('M6', 'accumulating', 1, 1, 100),
      r('M6', 'established', 0, 1, 0),
      r('M6', 'unknown', 0, 1, 0),
      r('M6', 'blended', 2, 4, 50),
    ]);
  });

  it('M7 counts read queries after week 1, and scales the median per observed days', async () => {
    await seed([
      ...googleSignup(A, '2026-01-24T00:00:00Z', 'accumulating'),
      connection(A, '2026-01-25T00:00:00Z', 'accumulating'),
      agentCall(A, '2026-01-31T00:00:00Z', 'accumulating', 'read'),
      agentCall(A, '2026-02-10T00:00:00Z', 'accumulating', 'read'),
      agentCall(A, '2026-02-20T00:00:00Z', 'accumulating', 'read'),
      ...googleSignup(B, '2026-01-24T00:00:00Z', 'established'),
      connection(B, '2026-01-25T00:00:00Z', 'established'),
      ...googleSignup(C, '2026-01-24T00:00:00Z', 'starting_out'),
      connection(C, '2026-01-25T00:00:00Z', 'starting_out'),
      agentCall(C, '2026-02-01T00:00:00Z', 'starting_out', 'read'),
      ...googleSignup(E, '2026-01-24T00:00:00Z', 'accumulating'),
      connection(E, '2026-01-25T00:00:00Z', 'accumulating'),
      ...googleSignup(G, '2026-01-24T00:00:00Z', 'established'),
      connection(G, '2026-01-25T00:00:00Z', 'established'),
      agentCall(G, '2026-02-02T00:00:00Z', 'established', 'read'),
      agentCall(G, '2026-02-03T00:00:00Z', 'established', 'read'),
      agentCall(G, '2026-02-04T00:00:00Z', 'established', 'read'),
      agentCall(G, '2026-02-05T00:00:00Z', 'established', 'read'),
      // A read before week 1 does not count.
      agentCall(B, '2026-01-26T00:00:00Z', 'established', 'read'),
    ]);
    const rows = await run('m07-advice-pull.sql', [G]);
    expect(sorted(rows.filter((row) => row.metric === 'M7'))).toStrictEqual([
      r('M7', 'starting_out', 1, 1, 100),
      r('M7', 'accumulating', 1, 2, 50),
      r('M7', 'established', 0, 1, 0),
      r('M7', 'unknown', 0, 0, null),
      r('M7', 'blended', 2, 4, 50),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M7 median'))).toStrictEqual([
      r('M7 median', 'starting_out', 1, 1, 1),
      r('M7 median', 'accumulating', 2, 2, 1.5),
      r('M7 median', 'established', 1, 1, 0),
      r('M7 median', 'unknown', 0, 0, null),
      r('M7 median', 'blended', 4, 4, 0.5),
    ]);
  });

  it('M8 reads median days since the last value among users active in the last 30 days', async () => {
    await seed([
      ...googleSignup(A, '2026-01-01T00:00:00Z', 'accumulating'),
      valueRecorded(A, '2026-01-20T00:00:00Z', 'accumulating', 'agent'),
      session(A, '2026-02-10T00:00:00Z', 'accumulating'),
      // No value ever: measured from the signup.
      ...googleSignup(B, '2026-01-03T00:00:00Z', 'established'),
      session(B, '2026-02-12T00:00:00Z', 'established'),
      ...googleSignup(C, '2026-01-04T00:00:00Z', 'starting_out'),
      valueRecorded(C, '2026-02-20T00:00:00Z', 'starting_out', 'web'),
      session(C, '2026-02-20T00:00:00Z', 'starting_out'),
      ...googleSignup(D, '2026-01-05T00:00:00Z', 'unknown'),
      valueRecorded(D, '2026-02-25T00:00:00Z', 'unknown', 'agent'),
      session(D, '2026-02-25T00:00:00Z', 'unknown'),
      // Active outside the last 30 days: not in the reading.
      ...googleSignup(E, '2026-01-01T00:00:00Z', 'accumulating'),
      valueRecorded(E, '2026-01-02T00:00:00Z', 'accumulating', 'agent'),
      session(E, '2026-01-01T00:00:00Z', 'accumulating'),
      ...googleSignup(G, '2026-01-02T00:00:00Z', 'established'),
      valueRecorded(G, '2026-01-20T00:00:00Z', 'established', 'agent'),
      session(G, '2026-02-15T00:00:00Z', 'established'),
    ]);
    expect(sorted(await run('m08-freshness.sql', [G]))).toStrictEqual([
      r('M8', 'starting_out', 1, 1, 10),
      r('M8', 'accumulating', 1, 1, 41),
      r('M8', 'established', 1, 1, 58),
      r('M8', 'unknown', 1, 1, 5),
      r('M8', 'blended', 4, 4, 25.5),
    ]);
  });

  it('M9 reads p50 minutes from the signup to the first agent call', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      agentCall(A, '2026-01-02T10:10:00Z', 'accumulating', 'read'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'established'),
      agentCall(B, '2026-01-03T11:00:00Z', 'established', 'write'),
      ...googleSignup(C, '2026-01-04T10:00:00Z', 'starting_out'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      agentCall(D, '2026-01-05T10:15:00Z', 'unknown', 'read'),
      ...googleSignup(E, '2026-01-06T10:00:00Z', 'accumulating'),
      agentCall(E, '2026-01-06T10:05:00Z', 'accumulating', 'read'),
      ...googleSignup(G, '2026-01-07T10:00:00Z', 'established'),
      agentCall(G, '2026-01-07T10:30:00Z', 'established', 'read'),
    ]);
    expect(sorted(await run('m09-time-to-value.sql', [G]))).toStrictEqual([
      r('M9', 'starting_out', 0, 1, null),
      r('M9', 'accumulating', 2, 2, 7.5),
      r('M9', 'established', 1, 1, 60),
      r('M9', 'unknown', 1, 1, 15),
      r('M9', 'blended', 4, 5, 12.5),
    ]);
  });

  it('M10 reads the daily funnel: visitors, starts, accounts, verifications and conversion', async () => {
    await seed([
      // Two visitors on each day; one hash repeats on the next day and counts again.
      {
        name: 'landing_view',
        at: '2026-01-02T01:00:00Z',
        segment: 'unknown',
        visitor: 'aaaaaaaaaaaaaaaa',
      },
      {
        name: 'landing_view',
        at: '2026-01-02T02:00:00Z',
        segment: 'unknown',
        visitor: 'aaaaaaaaaaaaaaaa',
      },
      {
        name: 'landing_view',
        at: '2026-01-02T03:00:00Z',
        segment: 'unknown',
        visitor: 'bbbbbbbbbbbbbbbb',
      },
      {
        name: 'landing_view',
        at: '2026-01-03T01:00:00Z',
        segment: 'unknown',
        visitor: 'aaaaaaaaaaaaaaaa',
      },
      {
        name: 'landing_view',
        at: '2026-01-03T02:00:00Z',
        segment: 'unknown',
        visitor: 'cccccccccccccccc',
      },
      {
        name: 'landing_view',
        at: '2026-01-03T03:00:00Z',
        segment: 'unknown',
        visitor: 'cccccccccccccccc',
      },
      {
        name: 'signup_started',
        at: '2026-01-02T04:00:00Z',
        segment: 'unknown',
        props: { method: 'email' },
      },
      {
        name: 'signup_started',
        at: '2026-01-03T04:00:00Z',
        segment: 'unknown',
        props: { method: 'google' },
      },
      {
        name: 'signup_started',
        at: '2026-01-03T05:00:00Z',
        segment: 'unknown',
        props: { method: 'email' },
      },
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'established'),
      accountCreated(C, '2026-01-04T10:00:00Z', 'email'),
      session(C, '2026-01-04T11:00:00Z', 'starting_out'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      ...googleSignup(G, '2026-01-06T10:00:00Z', 'accumulating'),
    ]);
    const rows = await run('m10-funnel.sql', [G]);
    expect(sorted(rows.filter((row) => row.metric === 'M10 visitors'))).toStrictEqual([
      r('M10 visitors', 'starting_out', null, null, null),
      r('M10 visitors', 'accumulating', null, null, null),
      r('M10 visitors', 'established', null, null, null),
      r('M10 visitors', 'unknown', 4, null, 4),
      r('M10 visitors', 'blended', 4, null, 4),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M10 signup started'))).toStrictEqual([
      r('M10 signup started', 'starting_out', null, null, null),
      r('M10 signup started', 'accumulating', null, null, null),
      r('M10 signup started', 'established', null, null, null),
      r('M10 signup started', 'unknown', 3, null, 3),
      r('M10 signup started', 'blended', 3, null, 3),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M10 account created'))).toStrictEqual([
      r('M10 account created', 'starting_out', 1, 1, 1),
      r('M10 account created', 'accumulating', 1, 1, 1),
      r('M10 account created', 'established', 1, 1, 1),
      r('M10 account created', 'unknown', 1, 1, 1),
      r('M10 account created', 'blended', 4, 4, 4),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M10 verified'))).toStrictEqual([
      r('M10 verified', 'starting_out', 0, 0, 0),
      r('M10 verified', 'accumulating', 1, 1, 1),
      r('M10 verified', 'established', 1, 1, 1),
      r('M10 verified', 'unknown', 1, 1, 1),
      r('M10 verified', 'blended', 3, 3, 3),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M10 conversion'))).toStrictEqual([
      r('M10 conversion', 'blended', 3, 4, 75),
    ]);
  });

  it('M11 reads sessions before a connection, and week-4 activity for the never connected', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      session(A, '2026-01-03T10:00:00Z', 'accumulating'),
      connection(A, '2026-01-10T10:00:00Z', 'accumulating'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'established'),
      connection(B, '2026-01-03T12:00:00Z', 'established'),
      session(B, '2026-01-04T10:00:00Z', 'established'),
      ...googleSignup(C, '2026-01-04T10:00:00Z', 'starting_out'),
      session(C, '2026-01-05T10:00:00Z', 'starting_out'),
      session(C, '2026-01-06T10:00:00Z', 'starting_out'),
      session(C, '2026-01-26T10:00:00Z', 'starting_out'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      ...googleSignup(E, '2026-02-10T10:00:00Z', 'accumulating'),
      session(E, '2026-02-11T10:00:00Z', 'accumulating'),
      // One session only: a holding carries the segment, so F is not an M11 “≥2 sessions” user.
      accountCreated(F, '2026-01-06T10:00:00Z', 'google'),
      holding(F, '2026-01-06T11:00:00Z', 'starting_out'),
      session(F, '2026-02-01T10:00:00Z', 'starting_out'),
      ...googleSignup(G, '2026-01-07T10:00:00Z', 'established'),
      session(G, '2026-01-08T10:00:00Z', 'established'),
      connection(G, '2026-01-09T10:00:00Z', 'established'),
      session(G, '2026-01-29T10:00:00Z', 'established'),
    ]);
    const rows = await run('m11-standalone.sql', [G]);
    expect(sorted(rows.filter((row) => row.metric === 'M11 sessions'))).toStrictEqual([
      r('M11 sessions', 'starting_out', 1, 2, 50),
      r('M11 sessions', 'accumulating', 2, 2, 100),
      r('M11 sessions', 'established', 0, 1, 0),
      r('M11 sessions', 'unknown', 0, 1, 0),
      r('M11 sessions', 'blended', 3, 6, 50),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M11 week 4'))).toStrictEqual([
      r('M11 week 4', 'starting_out', 2, 2, 100),
      r('M11 week 4', 'accumulating', 0, 1, 0),
      r('M11 week 4', 'established', 0, 1, 0),
      r('M11 week 4', 'unknown', 0, 1, 0),
      r('M11 week 4', 'blended', 2, 5, 40),
    ]);
  });

  it('M13 reads the comeback rate per channel and the push share of week-4 users', async () => {
    await seed([
      ...googleSignup(A, '2026-01-02T10:00:00Z', 'accumulating'),
      session(A, '2026-01-12T10:00:00Z', 'accumulating'),
      session(A, '2026-01-25T10:00:00Z', 'accumulating'),
      ...googleSignup(B, '2026-01-03T10:00:00Z', 'accumulating'),
      session(B, '2026-01-19T10:00:00Z', 'accumulating'),
      session(B, '2026-01-25T10:00:00Z', 'accumulating'),
      pushEnabled(B, '2026-01-04T10:00:00Z', 'accumulating'),
      ...googleSignup(C, '2026-01-04T10:00:00Z', 'established'),
      session(C, '2026-01-13T10:00:00Z', 'established'),
      session(C, '2026-01-26T10:00:00Z', 'established'),
      pushEnabled(C, '2026-01-05T10:00:00Z', 'established'),
      pushEnabled(C, '2026-01-06T10:00:00Z', 'established'),
      pushDisabled(C, '2026-01-07T10:00:00Z', 'established', 'user'),
      accountCreated(D, '2026-01-05T10:00:00Z', 'google'),
      ...googleSignup(E, '2026-01-06T10:00:00Z', 'starting_out'),
      session(E, '2026-01-20T10:00:00Z', 'starting_out'),
      session(E, '2026-02-02T10:00:00Z', 'starting_out'),
      pushEnabled(E, '2026-01-07T10:00:00Z', 'starting_out'),
      pushDisabled(E, '2026-01-08T10:00:00Z', 'starting_out', 'browser'),
      ...googleSignup(F, '2026-01-07T10:00:00Z', 'starting_out'),
      session(F, '2026-02-21T10:00:00Z', 'starting_out'),
      ...googleSignup(G, '2026-01-08T10:00:00Z', 'established'),
      session(G, '2026-01-16T10:00:00Z', 'established'),
      session(G, '2026-01-29T10:00:00Z', 'established'),
      pushEnabled(G, '2026-01-09T10:00:00Z', 'established'),
      reminderSent(A, '2026-01-10T10:00:00Z', 'accumulating', 'email'),
      reminderSent(B, '2026-01-11T10:00:00Z', 'accumulating', 'push'),
      reminderSent(C, '2026-01-12T10:00:00Z', 'established', 'push'),
      reminderSent(D, '2026-01-13T10:00:00Z', 'unknown', 'email'),
      reminderSent(E, '2026-01-14T10:00:00Z', 'starting_out', 'email'),
      reminderSent(F, '2026-02-20T10:00:00Z', 'starting_out', 'email'),
      reminderSent(G, '2026-01-15T10:00:00Z', 'established', 'email'),
    ]);
    const rows = await run('m13-comeback.sql', [G]);
    expect(sorted(rows.filter((row) => row.metric === 'M13 comeback'))).toStrictEqual([
      rc('M13 comeback', 'starting_out', 'email', 2, 2, 100),
      rc('M13 comeback', 'accumulating', 'email', 1, 1, 100),
      rc('M13 comeback', 'established', 'email', 0, 0, null),
      rc('M13 comeback', 'unknown', 'email', 0, 1, 0),
      rc('M13 comeback', 'blended', 'email', 3, 4, 75),
      rc('M13 comeback', 'starting_out', 'push', 0, 0, null),
      rc('M13 comeback', 'accumulating', 'push', 0, 1, 0),
      rc('M13 comeback', 'established', 'push', 1, 1, 100),
      rc('M13 comeback', 'unknown', 'push', 0, 0, null),
      rc('M13 comeback', 'blended', 'push', 1, 2, 50),
    ]);
    expect(sorted(rows.filter((row) => row.metric === 'M13 push'))).toStrictEqual([
      rc('M13 push', 'starting_out', null, 0, 1, 0),
      rc('M13 push', 'accumulating', null, 1, 2, 50),
      rc('M13 push', 'established', null, 1, 1, 100),
      rc('M13 push', 'unknown', null, 0, 0, null),
      rc('M13 push', 'blended', null, 2, 4, 50),
    ]);
  });

  it('N1 reads success and p95 over the 7 days ending at :to', async () => {
    await seed([
      agentCall(A, '2026-02-24T10:00:00Z', 'accumulating', 'read', 'ok', 100),
      agentCall(A, '2026-02-25T10:00:00Z', 'accumulating', 'read', 'ok', 200),
      agentCall(A, '2026-02-26T10:00:00Z', 'accumulating', 'write', 'INTERNAL', 1000),
      agentCall(A, '2026-02-22T23:59:00Z', 'accumulating', 'read', 'ok', 50),
      agentCall(A, '2026-02-23T00:00:00Z', 'accumulating', 'read', 'ok', 300),
      agentCall(B, '2026-02-27T10:00:00Z', 'established', 'read', 'ok', 2000),
      agentCall(C, '2026-01-01T10:00:00Z', 'starting_out', 'read', 'ok', 400),
      agentCall(D, '2026-02-25T10:00:00Z', 'unknown', 'read', 'ok', 500),
    ]);
    expect(sorted(await run('n1-slo.sql', [D]))).toStrictEqual([
      r('n1 calls', 'blended', 5, null, 5),
      r('n1 p95', 'blended', null, 5, 1800),
      r('n1 success', 'blended', 4, 5, 80),
    ]);
  });
});
