import { describe, expect, it } from 'vitest';
import type { MetricRow } from '../../scripts/metrics';
import { main, readNeon, readSlo, sloFromRows, type HealthIo } from '../../scripts/health';

const TODAY = new Date('2026-08-10T01:00:00.000Z');
const SECRET = 'test-cron-secret';
const ORIGIN = 'https://netnet.example';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

/** A fetch that answers each URL from `routes`, and records every call. */
function fakeFetch(routes: (url: string) => Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return routes(url);
  };
  return { calls, fetchImpl };
}

const PROJECT = {
  project: { compute_time_seconds: 216_000, synthetic_storage_size: 0 },
};
const BRANCHES = { branches: [{ default: true, logical_size: 350_000_000 }] };

describe('readNeon()', () => {
  it('reads the billing period’s compute and the default branch’s storage', async () => {
    const { calls, fetchImpl } = fakeFetch((url) =>
      url.endsWith('/branches?limit=100') ? jsonResponse(BRANCHES) : jsonResponse(PROJECT),
    );
    expect(
      await readNeon({ NEON_API_KEY: 'neon_key', NEON_PROD_PROJECT_ID: 'proj-1' }, fetchImpl),
    ).toEqual({ computeCuHours: 60, storageGb: 0.35 });
    expect(calls.map((call) => call.url)).toEqual([
      'https://console.neon.tech/api/v2/projects/proj-1',
      'https://console.neon.tech/api/v2/projects/proj-1/branches?limit=100',
    ]);
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: 'Bearer neon_key' });
  });

  it('prefers a nonzero synthetic storage size, and never asks for branches then', async () => {
    const { calls, fetchImpl } = fakeFetch(() =>
      jsonResponse({
        project: { compute_time_seconds: 3_600, synthetic_storage_size: 400_000_000 },
      }),
    );
    expect(
      await readNeon({ NEON_API_KEY: 'neon_key', NEON_PROD_PROJECT_ID: 'proj-1' }, fetchImpl),
    ).toEqual({ computeCuHours: 1, storageGb: 0.4 });
    expect(calls).toHaveLength(1);
  });

  it('is unreadable without the key or project, or when Neon answers badly', async () => {
    const unused = fakeFetch(() => jsonResponse({}));
    expect(await readNeon({}, unused.fetchImpl)).toEqual({ unavailable: true });
    expect(unused.calls).toEqual([]);

    const refused = fakeFetch(() => jsonResponse({ message: 'nope' }, 403));
    expect(
      await readNeon({ NEON_API_KEY: 'k', NEON_PROD_PROJECT_ID: 'p' }, refused.fetchImpl),
    ).toEqual({ unavailable: true });

    const noCompute = fakeFetch(() => jsonResponse({ project: { synthetic_storage_size: 1 } }));
    expect(
      await readNeon({ NEON_API_KEY: 'k', NEON_PROD_PROJECT_ID: 'p' }, noCompute.fetchImpl),
    ).toEqual({ unavailable: true });

    const noDefault = fakeFetch((url) =>
      url.endsWith('/branches?limit=100')
        ? jsonResponse({ branches: [{ default: false, logical_size: 1 }] })
        : jsonResponse(PROJECT),
    );
    expect(
      await readNeon({ NEON_API_KEY: 'k', NEON_PROD_PROJECT_ID: 'p' }, noDefault.fetchImpl),
    ).toEqual({ unavailable: true });
  });
});

function metric(metricName: string, value: number | null): MetricRow {
  return { metric: metricName, segment: 'blended', numerator: null, denominator: null, value };
}

describe('sloFromRows()', () => {
  it('reads the three n1 rows as calls, success rate and p95', () => {
    expect(
      sloFromRows([metric('n1 calls', 120), metric('n1 success', 99.4), metric('n1 p95', 1_600)]),
    ).toEqual({ calls: 120, successRate: 99.4, p95Ms: 1_600 });
  });

  it('is unreadable when the calls row is absent', () => {
    expect(sloFromRows([metric('n1 success', 99.4)])).toEqual({ unavailable: true });
  });

  it('keeps a quiet week’s null rate and p95', () => {
    expect(
      sloFromRows([metric('n1 calls', 0), metric('n1 success', null), metric('n1 p95', null)]),
    ).toEqual({ calls: 0, successRate: null, p95Ms: null });
  });
});

describe('readSlo()', () => {
  it('is unreadable without DATABASE_METRICS_URL, and never connects', async () => {
    let ran = false;
    expect(
      await readSlo({}, TODAY, () => {
        ran = true;
        return Promise.resolve([]);
      }),
    ).toEqual({ unavailable: true });
    expect(ran).toBe(false);
  });

  it('runs the query over the 7 days ending today, excluding the probe', async () => {
    let seen: { from: Date; to: Date; excludeUsers: string[] } | undefined;
    const reading = await readSlo(
      {
        DATABASE_METRICS_URL: 'postgres://metrics',
        METRICS_EXCLUDE_USERS: 'usr_01K1G4KX00AAAAAAAAAAAAAAAA,usr_01K1G4KX00BBBBBBBBBBBBBBBB',
      },
      TODAY,
      (_url, next) => {
        seen = next;
        return Promise.resolve([
          metric('n1 calls', 1),
          metric('n1 success', 100),
          metric('n1 p95', 100),
        ]);
      },
    );
    expect(reading).toEqual({ calls: 1, successRate: 100, p95Ms: 100 });
    expect(seen?.to).toBe(TODAY);
    expect(seen?.from.toISOString()).toBe('2026-08-03T01:00:00.000Z');
    expect(seen?.excludeUsers).toEqual([
      'usr_01K1G4KX00AAAAAAAAAAAAAAAA',
      'usr_01K1G4KX00BBBBBBBBBBBBBBBB',
    ]);
  });

  it('is unreadable when the query fails or the exclude list is malformed', async () => {
    expect(
      await readSlo({ DATABASE_METRICS_URL: 'postgres://metrics' }, TODAY, () =>
        Promise.reject(new Error('not netnet_metrics')),
      ),
    ).toEqual({ unavailable: true });
    expect(
      await readSlo(
        { DATABASE_METRICS_URL: 'postgres://metrics', METRICS_EXCLUDE_USERS: 'not-an-id' },
        TODAY,
        () => Promise.resolve([]),
      ),
    ).toEqual({ unavailable: true });
  });
});

/** The command's IO: a fixed clock, a fake POST, and the readers fixed to one report. */
function io(
  answer: Promise<Response>,
  overrides: Partial<HealthIo> = {},
): {
  io: HealthIo;
  posts: { url: string; init: RequestInit | undefined }[];
  logged: string[];
  errors: string[];
} {
  const posts: { url: string; init: RequestInit | undefined }[] = [];
  const logged: string[] = [];
  const errors: string[] = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    posts.push({ url, init });
    return answer;
  };
  return {
    posts,
    logged,
    errors,
    io: {
      env: { PUBLIC_ORIGIN: ORIGIN, CRON_SECRET: SECRET },
      now: () => TODAY,
      fetch: fetchImpl,
      log: (line) => void logged.push(line),
      error: (line) => void errors.push(line),
      readNeon: () => Promise.resolve({ computeCuHours: 10, storageGb: 0.1 }),
      readSlo: () => Promise.resolve({ calls: 100, successRate: 99.9, p95Ms: 800 }),
      ...overrides,
    },
  };
}

describe('health main()', () => {
  it('posts the two figures and exits 1 when a trigger fired', async () => {
    const route = io(jsonResponse({ triggers: ['emails_day'], figures: {} }));
    expect(await main(['--env', 'production'], route.io)).toBe(1);
    expect(route.posts).toHaveLength(1);
    const [post] = route.posts;
    expect(post?.url).toBe(`${ORIGIN}/api/cron/health`);
    expect(post?.init?.method).toBe('POST');
    expect(post?.init?.headers).toMatchObject({ Authorization: `Bearer ${SECRET}` });
    expect(JSON.parse(post?.init?.body as string)).toStrictEqual({
      neon: { computeCuHours: 10, storageGb: 0.1 },
      slo: { calls: 100, successRate: 99.9, p95Ms: 800 },
      testAlert: false,
    });
    expect(route.logged.join('\n')).toContain('"emails_day"');
  });

  it('exits 0 on silence, and adds --test-alert to the report when asked', async () => {
    const quiet = io(jsonResponse({ triggers: [], figures: {} }));
    expect(await main(['--env', 'production'], quiet.io)).toBe(0);
    const test = io(jsonResponse({ triggers: [], figures: {} }));
    expect(await main(['--env', 'production', '--test-alert'], test.io)).toBe(0);
    expect(JSON.parse(test.posts[0]?.init?.body as string)).toMatchObject({ testAlert: true });
  });

  it('posts an unreadable source rather than hiding it', async () => {
    const route = io(jsonResponse({ triggers: ['unreadable_neon'], figures: {} }), {
      readNeon: () => Promise.resolve({ unavailable: true }),
    });
    expect(await main(['--env', 'production'], route.io)).toBe(1);
    expect(JSON.parse(route.posts[0]?.init?.body as string)).toMatchObject({
      neon: { unavailable: true },
    });
  });

  it('refuses to run without its origin and secret, or a bad env', async () => {
    const missing = io(jsonResponse({ triggers: [], figures: {} }), {
      env: { PUBLIC_ORIGIN: '', CRON_SECRET: '' },
    });
    expect(await main(['--env', 'production'], missing.io)).toBe(1);
    expect(missing.errors.join('\n')).toContain('PUBLIC_ORIGIN and CRON_SECRET');
    expect(missing.posts).toEqual([]);

    const bad = io(jsonResponse({ triggers: [], figures: {} }));
    expect(await main([], bad.io)).toBe(1);
    expect(bad.errors.join('\n')).toContain('Usage: pnpm health');
  });

  it('exits 1 when the handler refuses or answers without a trigger list', async () => {
    const refused = io(jsonResponse({ error: 'nope' }, 401));
    expect(await main(['--env', 'production'], refused.io)).toBe(1);
    expect(refused.errors.join('\n')).toContain('HTTP 401');

    const shapeless = io(jsonResponse({ figures: {} }));
    expect(await main(['--env', 'production'], shapeless.io)).toBe(1);
    expect(shapeless.errors.join('\n')).toContain('without a trigger list');
  });
});
