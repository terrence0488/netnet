import { describe, expect, it } from 'vitest';
import {
  CALLS_SQL,
  endOf,
  main,
  renderReport,
  successRate,
  tally,
  windowEndingAt,
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
