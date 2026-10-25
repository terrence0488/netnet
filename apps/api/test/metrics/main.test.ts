import { describe, expect, it } from 'vitest';
import { main } from '../../../../scripts/metrics';

/**
 * The command's refusals: it never runs a metric through a connection that is not the read-only
 * `netnet_metrics` login, and it refuses a window or an exclude list before connecting. The
 * reports themselves are `test/metrics/report.test.ts` and the SQL is in `metrics.test.ts`.
 */
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      log: (line: string) => void out.push(line),
      error: (line: string) => void err.push(line),
      now: () => new Date('2026-03-01T10:00:00Z'),
    },
  };
}

describe('metrics main()', () => {
  it('names the usage when --env or --from is missing', async () => {
    const first = capture();
    expect(
      await main(['--env', 'local'], {
        ...first.io,
        databaseUrl: 'postgres://x',
        excludeUsers: undefined,
      }),
    ).toBe(1);
    expect(first.err.join('\n')).toContain('Usage: pnpm metrics');

    const second = capture();
    expect(
      await main(['--from', '2026-01-01'], {
        ...second.io,
        databaseUrl: 'postgres://x',
        excludeUsers: undefined,
      }),
    ).toBe(1);
    expect(second.err.join('\n')).toContain('Usage: pnpm metrics');
  });

  it('refuses a missing DATABASE_METRICS_URL', async () => {
    const captureIo = capture();
    expect(
      await main(['--env', 'production', '--from', '2026-01-01'], {
        ...captureIo.io,
        databaseUrl: undefined,
        excludeUsers: undefined,
      }),
    ).toBe(1);
    expect(captureIo.err.join('\n')).toContain('DATABASE_METRICS_URL is not set');
    expect(captureIo.out).toStrictEqual([]);
  });

  it('refuses a bad exclude id and a backwards window before connecting', async () => {
    const exclude = capture();
    expect(
      await main(['--env', 'local', '--from', '2026-01-01'], {
        ...exclude.io,
        databaseUrl: 'postgres://x',
        excludeUsers: 'not-an-id',
      }),
    ).toBe(1);
    expect(exclude.err.join('\n')).toContain('METRICS_EXCLUDE_USERS');

    const backwards = capture();
    expect(
      await main(['--env', 'local', '--from', '2026-02-02', '--to', '2026-02-01'], {
        ...backwards.io,
        databaseUrl: 'postgres://x',
        excludeUsers: undefined,
      }),
    ).toBe(1);
    expect(backwards.err.join('\n')).toContain('on or after');
  });

  it.skipIf(!process.env.DATABASE_URL)(
    'refuses a connection whose role is not netnet_metrics',
    async () => {
      const captureIo = capture();
      expect(
        await main(['--env', 'local', '--from', '2026-01-01'], {
          ...captureIo.io,
          databaseUrl: process.env.DATABASE_URL,
          excludeUsers: undefined,
        }),
      ).toBe(1);
      expect(captureIo.err.join('\n')).toContain('not netnet_metrics');
      expect(captureIo.out).toStrictEqual([]);
    },
    30_000,
  );
});
