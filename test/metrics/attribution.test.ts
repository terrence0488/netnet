import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_SQL,
  CALLS_SQL,
  endOf,
  renderTimeline,
  main,
  renderReport,
  successRate,
  tally,
  windowEndingAt,
  type AccountTimeline,
  type AgentCall,
  type Attribution,
  type AttributionIo,
} from '../../scripts/slo-attribution';

/**
 * The N1 attribution (ops/launch-readiness.md, N1): when the health check fires `slo_success`,
 * this is how the three non-ok `agent_tool_called` events get named — tool, kind, outcome, client,
 * account — instead of the reading being accepted or the target being lowered.
 */
const NOW = new Date('2026-10-26T00:25:00.000Z');
const PROBE = 'usr_0PRBEAAAAAAAAAAAAAAAAAAAAA';

function call(overrides: Partial<AgentCall> = {}): AgentCall {
  return {
    at: new Date('2026-10-25T12:00:00.000Z'),
    user_id: 'usr_0PSN0AAAAAAAAAAAAAAAAAAAAA',
    tool: 'create_holding',
    kind: 'write',
    outcome: 'ok',
    client: 'claude',
    latency_ms: 120,
    ...overrides,
  };
}

function io(overrides: Partial<AttributionIo> = {}): AttributionIo & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    databaseUrl: 'postgres://netnet_metrics@localhost:5432/netnet',
    excludeUsers: undefined,
    now: () => NOW,
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
    ...overrides,
  };
}

describe('the attribution window', () => {
  it('is a half-open 7 days ending at the reading, like n1-slo.sql', () => {
    const { from, to } = windowEndingAt(7, NOW);
    expect(to).toBe(NOW);
    expect(from.toISOString()).toBe('2026-10-19T00:25:00.000Z');
  });

  it('refuses a window that is not a whole number of days from 1 to 90', () => {
    expect(() => windowEndingAt(0, NOW)).toThrow(/--days/);
    expect(() => windowEndingAt(2.5, NOW)).toThrow(/--days/);
    expect(() => windowEndingAt(91, NOW)).toThrow(/--days/);
  });

  it('reads --to as an inclusive UTC day, and defaults to now', () => {
    expect(endOf(undefined, NOW)).toBe(NOW);
    expect(endOf('2026-10-25', NOW).toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(() => endOf('25-10-2026', NOW)).toThrow(/YYYY-MM-DD/);
  });
});

describe('the arithmetic the SLO reads', () => {
  it('counts only `ok` as a success, and rounds to one decimal like the SQL', () => {
    const calls = [
      ...Array.from({ length: 83 }, () => call()),
      call({ outcome: 'INTERNAL' }),
      call({ outcome: 'NOT_FOUND' }),
      call({ outcome: 'VALIDATION_FAILED' }),
    ];
    const reading = tally(calls);
    expect(reading).toEqual({ calls: 86, ok: 83, nonOk: 3 });
    expect(successRate(reading)).toBe(96.5);
  });

  it('has no rate on a quiet window, rather than a division by zero', () => {
    expect(successRate(tally([]))).toBeNull();
  });
});

describe('the report', () => {
  const calls = [
    call({ at: new Date('2026-10-25T01:56:31.000Z'), tool: 'record_values', outcome: 'INTERNAL' }),
    call({
      at: new Date('2026-10-25T03:10:02.000Z'),
      user_id: PROBE,
      tool: 'create_holding',
      outcome: 'NOT_FOUND',
    }),
  ];
  const attribution: Attribution = {
    window: { from: new Date('2026-10-19T00:25:00.000Z'), to: NOW },
    excludeUsers: [PROBE],
    all: { calls: 86, ok: 83, nonOk: 3 },
    counted: { calls: 85, ok: 83, nonOk: 2 },
    calls,
  };

  it('states the counted reading and the reading before exclusions', () => {
    const report = renderReport(attribution);
    expect(report).toContain('85 counted, 83 ok, 2 not ok, success 97.6%');
    expect(report).toContain('all calls before exclusions: 86, 3 not ok');
  });

  it('names one line per non-ok call, with the account and whether it is excluded', () => {
    const lines = renderReport(attribution).split('\n');
    const first = lines.find((line) => line.includes('record_values'));
    const second = lines.find((line) => line.includes('create_holding'));
    expect(first).toContain('INTERNAL');
    expect(first).toMatch(/ no$/);
    expect(second).toContain('NOT_FOUND');
    expect(second).toContain(PROBE);
    expect(second).toMatch(/ yes$/);
  });

  it('says so plainly when nothing failed', () => {
    const report = renderReport({ ...attribution, calls: [] });
    expect(report).toContain('No non-ok agent_tool_called events in the window.');
  });
});

describe('the query', () => {
  it('reads named props only, so no free text, amount or name can reach the report', () => {
    expect(CALLS_SQL).toContain("e.props->>'tool'");
    expect(CALLS_SQL).toContain("e.props->>'outcome'");
    expect(CALLS_SQL).toContain("where e.name = 'agent_tool_called'");
    expect(CALLS_SQL).not.toMatch(/props\s*(;|$)/m);
    expect(CALLS_SQL).not.toContain('*');
  });
});

describe('the command', () => {
  it('refuses to run without DATABASE_METRICS_URL', async () => {
    const target = io({ databaseUrl: undefined });
    expect(await main([], target)).toBe(1);
    expect(target.lines.join('\n')).toContain('DATABASE_METRICS_URL is not set');
  });

  it('refuses an excluded-id list that is not usr_ ids, rather than silently not excluding', async () => {
    const target = io({ excludeUsers: 'probe,someone@example.com' });
    expect(await main([], target)).toBe(2);
    expect(target.lines.join('\n')).toContain('METRICS_EXCLUDE_USERS');
  });

  it('prints the report for the window it was given', async () => {
    const target = io({ excludeUsers: PROBE });
    const seen: { from: string; to: string; exclude: string[] }[] = [];
    const run = (_url: string, window: { from: Date; to: Date }, exclude: string[]) => {
      seen.push({ from: window.from.toISOString(), to: window.to.toISOString(), exclude });
      return Promise.resolve({
        window,
        excludeUsers: exclude,
        all: { calls: 0, ok: 0, nonOk: 0 },
        counted: { calls: 0, ok: 0, nonOk: 0 },
        calls: [],
      } satisfies Attribution);
    };
    expect(await main(['--days', '3', '--to', '2026-10-25'], target, run)).toBe(0);
    expect(seen[0]).toEqual({
      from: '2026-10-23T00:00:00.000Z',
      to: '2026-10-26T00:00:00.000Z',
      exclude: [PROBE],
    });
    expect(target.lines.join('\n')).toContain('No non-ok agent_tool_called events');
  });
});

describe('the account behind a failed call', () => {
  const timeline: AccountTimeline = {
    user: PROBE,
    excluded: false,
    window: { from: new Date('2026-07-28T00:00:00.000Z'), to: NOW },
    events: [
      {
        at: new Date('2026-10-24T19:10:00.000Z'),
        name: 'signup',
        segment: 'unknown',
        app_version: 'p4.3',
        has_visitor: true,
      },
      {
        at: new Date('2026-10-24T19:11:00.000Z'),
        name: 'agent_connection',
        segment: 'unknown',
        app_version: 'p4.3',
        has_visitor: false,
      },
      {
        at: new Date('2026-10-24T19:11:30.000Z'),
        name: 'agent_tool_called',
        segment: 'unknown',
        app_version: 'p4.3',
        has_visitor: false,
      },
    ],
  };

  it('reads the account’s own events by id, and nothing else', () => {
    expect(ACCOUNT_SQL).toContain('where e.user_id = $1');
    expect(ACCOUNT_SQL).toContain('e.name');
    expect(ACCOUNT_SQL).toContain('e.app_version');
    expect(ACCOUNT_SQL).not.toMatch(/props/);
  });

  it('states the names, the releases and the excluded flag, then one line per event', () => {
    const report = renderTimeline(timeline);
    expect(report).toContain(`Account ${PROBE} · 3 events`);
    expect(report).toContain('excluded: no');
    expect(report).toContain('Names: agent_connection×1, agent_tool_called×1, signup×1');
    expect(report).toContain('Releases: p4.3');
    expect(report.split('\n').filter((line) => line.includes('2026-10-24'))).toHaveLength(3);
  });

  it('says so plainly when the account has no events in the window', () => {
    expect(renderTimeline({ ...timeline, events: [] })).toContain(
      'No events for that account in the window.',
    );
  });

  it('`--user` prints the account, and reads 90 days by default', async () => {
    const target = io();
    const seen: { user: string; from: string; days: number }[] = [];
    const fake = (
      _url: string,
      user: string,
      window: { from: Date; to: Date },
    ): Promise<AccountTimeline> => {
      seen.push({
        user,
        from: window.from.toISOString(),
        days: Math.round((window.to.getTime() - window.from.getTime()) / 86_400_000),
      });
      return Promise.resolve(timeline);
    };
    expect(await main(['--user', PROBE], target, undefined, fake)).toBe(0);
    expect(seen[0]).toEqual({ user: PROBE, from: '2026-07-28T00:25:00.000Z', days: 90 });
    expect(target.lines.join('\n')).toContain('Names:');
  });

  it('refuses a --user that is not a usr_ id', async () => {
    const target = io();
    expect(await main(['--user', 'someone@example.com'], target)).toBe(2);
    expect(target.lines.join('\n')).toContain('--user must be a usr_ id');
  });
});
