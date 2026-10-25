import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { handleError } from '../lib/error-handler';
import type { AppEnv } from '../lib/context';
import type { HealthFigures } from '../notify/health-alert';
import type { NotifyOperator } from '../notify/message';
import { cronAuth } from './cron';
import {
  evaluateHealth,
  healthJob,
  parseHealthReport,
  type HealthJobDeps,
  type LocalFigures,
} from './health';

/** The check's fixed clock: 10 Aug 2026, 01:00 UTC. */
const TODAY = new Date('2026-08-10T01:00:00.000Z');

/** Every reading below its threshold, with both FX sources fresh. */
const BASE: HealthFigures = {
  neon: { computeCuHours: 10, storageGb: 0.1 },
  slo: { calls: 100, successRate: 99.9, p95Ms: 800 },
  emails: { today: 1, yesterday: 1, month: 10 },
  reminderCapReachedYesterday: false,
  securityEmailsUnsent24h: 0,
  fxLatest: { ecb: '2026-08-08', fallback: '2026-08-09' },
  opsEmailConfigured: true,
};

const figures = (overrides: Partial<HealthFigures> = {}): HealthFigures => ({
  ...BASE,
  ...overrides,
});

const at = (overrides: Partial<HealthFigures> = {}) => evaluateHealth(figures(overrides), TODAY);

describe('evaluateHealth()', () => {
  it('is silent when every figure is below its trigger', () => {
    expect(at()).toEqual([]);
  });

  it('fires neon_compute at 60 of the month’s 100 CU-hours, and not below', () => {
    expect(at({ neon: { computeCuHours: 60, storageGb: 0.1 } })).toEqual(['neon_compute']);
    expect(at({ neon: { computeCuHours: 59.9, storageGb: 0.1 } })).toEqual([]);
  });

  it('fires neon_storage at 0.35 GB, and not below', () => {
    expect(at({ neon: { computeCuHours: 10, storageGb: 0.35 } })).toEqual(['neon_storage']);
    expect(at({ neon: { computeCuHours: 10, storageGb: 0.34 } })).toEqual([]);
  });

  it('fires slo_latency above a 1,500 ms p95, and not at it', () => {
    expect(at({ slo: { calls: 100, successRate: 99.9, p95Ms: 1_501 } })).toEqual(['slo_latency']);
    expect(at({ slo: { calls: 100, successRate: 99.9, p95Ms: 1_500 } })).toEqual([]);
  });

  it('fires slo_success under 99.5% over at least 50 calls, and not below 50 calls', () => {
    expect(at({ slo: { calls: 50, successRate: 99.4, p95Ms: 800 } })).toEqual(['slo_success']);
    expect(at({ slo: { calls: 50, successRate: 99.5, p95Ms: 800 } })).toEqual([]);
    expect(at({ slo: { calls: 49, successRate: 99.4, p95Ms: 800 } })).toEqual([]);
    expect(at({ slo: { calls: 49, successRate: 90, p95Ms: 800 } })).toEqual([]);
  });

  it('fires emails_day at 70 yesterday, and not at 69', () => {
    expect(at({ emails: { today: 0, yesterday: 70, month: 10 } })).toEqual(['emails_day']);
    expect(at({ emails: { today: 0, yesterday: 69, month: 10 } })).toEqual([]);
  });

  it('fires emails_month at 2,100 this month, and not at 2,099', () => {
    expect(at({ emails: { today: 0, yesterday: 1, month: 2_100 } })).toEqual(['emails_month']);
    expect(at({ emails: { today: 0, yesterday: 1, month: 2_099 } })).toEqual([]);
  });

  it('fires reminder_cap when yesterday reached the 60-a-day reminder cap', () => {
    expect(at({ reminderCapReachedYesterday: true })).toEqual(['reminder_cap']);
    expect(at({ reminderCapReachedYesterday: false })).toEqual([]);
  });

  it('fires security_email_unsent for any email unsent over 24 hours', () => {
    expect(at({ securityEmailsUnsent24h: 1 })).toEqual(['security_email_unsent']);
    expect(at({ securityEmailsUnsent24h: 0 })).toEqual([]);
  });

  it('fires fx_stale after 4 days for the ECB and after 2 for the fallback', () => {
    expect(at({ fxLatest: { ecb: '2026-08-05', fallback: '2026-08-09' } })).toEqual(['fx_stale']);
    expect(at({ fxLatest: { ecb: '2026-08-06', fallback: '2026-08-09' } })).toEqual([]);
    expect(at({ fxLatest: { ecb: '2026-08-09', fallback: '2026-08-07' } })).toEqual(['fx_stale']);
    expect(at({ fxLatest: { ecb: '2026-08-09', fallback: '2026-08-08' } })).toEqual([]);
  });

  it('fires vercel_limit at 70%, only when Vercel is readable', () => {
    expect(at({ vercel: { limits: [{ name: 'Edge Requests', percent: 70 }] } })).toEqual([
      'vercel_limit',
    ]);
    expect(at({ vercel: { limits: [{ name: 'Edge Requests', percent: 69 }] } })).toEqual([]);
    expect(at({ vercel: { limits: [] } })).toEqual([]);
  });

  it.each([
    ['neon', { neon: { unavailable: true } }, 'unreadable_neon'],
    ['slo', { slo: { unavailable: true } }, 'unreadable_slo'],
    ['vercel', { vercel: { unavailable: true } }, 'unreadable_vercel'],
    ['emails', { emails: { unavailable: true } }, 'unreadable_emails'],
    ['reminders', { reminderCapReachedYesterday: { unavailable: true } }, 'unreadable_reminders'],
    ['security', { securityEmailsUnsent24h: { unavailable: true } }, 'unreadable_security'],
    ['fx', { fxLatest: { unavailable: true } }, 'unreadable_fx'],
    ['ops email', { opsEmailConfigured: false }, 'unreadable_ops_email'],
  ] as const)('fires %s’s unreadable trigger and none of its thresholds', (_name, override, id) => {
    expect(at(override)).toEqual([id]);
  });

  it('reports a source with no rate at all as unreadable, not merely stale', () => {
    expect(at({ fxLatest: { ecb: null, fallback: '2026-08-09' } })).toEqual(['unreadable_fx']);
    expect(at({ fxLatest: { ecb: '2026-08-09', fallback: null } })).toEqual(['unreadable_fx']);
  });

  it('lists several triggers in the fixed order, unreadable ones last', () => {
    expect(
      at({
        neon: { computeCuHours: 60, storageGb: 0.35 },
        emails: { today: 0, yesterday: 70, month: 2_100 },
        opsEmailConfigured: false,
      }),
    ).toEqual([
      'neon_compute',
      'neon_storage',
      'emails_day',
      'emails_month',
      'unreadable_ops_email',
    ]);
  });
});

/* ------------------------------------------------------------- the route */

const SECRET = 'test-cron-secret';

const LOCAL: LocalFigures = {
  emails: { today: 1, yesterday: 1, month: 10 },
  reminderCapReachedYesterday: false,
  securityEmailsUnsent24h: 0,
  fxLatest: { ecb: '2026-08-09', fallback: '2026-08-09' },
};

const REPORT = {
  neon: { computeCuHours: 10, storageGb: 0.1 },
  slo: { calls: 100, successRate: 99.9, p95Ms: 800 },
  testAlert: false,
};

function fakeOperator(): { sent: Parameters<NotifyOperator>[0][]; notify: NotifyOperator } {
  const sent: Parameters<NotifyOperator>[0][] = [];
  return {
    sent,
    notify: (msg) => {
      sent.push(msg);
      return Promise.resolve({ channel: 'email' });
    },
  };
}

function route(overrides: Partial<HealthJobDeps> = {}) {
  const operator = fakeOperator();
  const app = new Hono<AppEnv>();
  app.use(
    '/api/cron/*',
    cronAuth(() => SECRET),
  );
  app.post(
    '/api/cron/health',
    healthJob(() => ({
      clock: () => TODAY,
      readFigures: () => Promise.resolve(LOCAL),
      opsEmailConfigured: () => true,
      notifyOperator: operator.notify,
      ...overrides,
    })),
  );
  app.onError(handleError);
  return { app, ...operator };
}

function post(app: Hono<AppEnv>, body: unknown, authorization = `Bearer ${SECRET}`) {
  return app.request('/api/cron/health', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/cron/health', () => {
  it('refuses a wrong bearer secret, before reading anything', async () => {
    const { app, sent } = route();
    const res = await post(app, REPORT, 'Bearer wrong');
    expect(res.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('answers the figures and the triggers, and sends nothing when none fired', async () => {
    const { app, sent } = route();
    const res = await post(app, REPORT);
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({
      triggers: [],
      figures: {
        neon: REPORT.neon,
        slo: REPORT.slo,
        ...LOCAL,
        opsEmailConfigured: true,
      },
    });
    expect(sent).toEqual([]);
  });

  it('sends one alert with the day’s figures when a trigger fired', async () => {
    const { app, sent } = route({
      readFigures: () =>
        Promise.resolve({ ...LOCAL, emails: { today: 1, yesterday: 70, month: 10 } }),
    });
    const res = await post(app, REPORT);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ triggers: ['emails_day'] });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: 'ops.health_alert',
      triggers: ['emails_day'],
      test: false,
    });
    expect(sent[0]?.figures.emails).toEqual({ today: 1, yesterday: 70, month: 10 });
  });

  it('sends the test alert with no trigger when the dispatch asks', async () => {
    const { app, sent } = route();
    const res = await post(app, { ...REPORT, testAlert: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ triggers: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'ops.health_alert', triggers: [], test: true });
  });

  it('reports a missing OPS_EMAIL as a trigger, without the route crashing', async () => {
    const { app, sent } = route({ opsEmailConfigured: () => false });
    const res = await post(app, REPORT);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ triggers: ['unreadable_ops_email'] });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.figures.opsEmailConfigured).toBe(false);
  });

  it('accepts an unreadable source from the workflow and still answers', async () => {
    const { app } = route();
    const res = await post(app, { ...REPORT, neon: { unavailable: true } });
    expect(await res.json()).toMatchObject({ triggers: ['unreadable_neon'] });
  });

  it('refuses a malformed report with VALIDATION_FAILED', async () => {
    const { app } = route();
    const res = await post(app, { ...REPORT, testAlert: 'yes' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});

describe('parseHealthReport()', () => {
  it('accepts the workflow’s report, with and without Vercel', () => {
    expect(parseHealthReport(REPORT)).toStrictEqual(REPORT);
    expect(
      parseHealthReport({
        ...REPORT,
        vercel: { limits: [{ name: 'Edge Requests', percent: 71 }] },
      }),
    ).toMatchObject({ vercel: { limits: [{ name: 'Edge Requests', percent: 71 }] } });
  });

  it('refuses a report whose figures are not there', () => {
    expect(parseHealthReport(undefined)).toBeNull();
    expect(parseHealthReport({ ...REPORT, neon: {} })).toBeNull();
    expect(
      parseHealthReport({ ...REPORT, slo: { calls: 1.5, successRate: 1, p95Ms: 1 } }),
    ).toBeNull();
    expect(parseHealthReport({ neon: REPORT.neon, slo: REPORT.slo })).toBeNull();
  });
});
