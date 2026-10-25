import { Hono } from 'hono';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { countUnsentSecurityEmails } from '../../src/db/agent-connections';
import { emailCountKey, emailCounts, recordEmailSent, utcDayStart } from '../../src/db/emails';
import { agentConnection, fxRate, rateLimit } from '../../src/db/schema';
import { cronAuth } from '../../src/jobs/cron';
import { healthJob, readLocalFigures } from '../../src/jobs/health';
import { handleError } from '../../src/lib/error-handler';
import type { AppEnv } from '../../src/lib/context';
import type { NotifyOperator } from '../../src/notify/message';
import {
  FIXED_NOW,
  USER_A,
  createTestDatabase,
  ensureAccount,
  type TestDatabase,
} from '../isolation/harness';

/**
 * The health check's `core` readings, against Postgres (P4-T4): the day's email counter (every
 * email Resend accepted, and only those), unsent security emails older than 24 hours, the FX
 * dates, and the route that combines them with the workflow's two figures. The figures are
 * counts, sizes, percentages and dates only.
 */
let db: TestDatabase;

const DAY_MS = 24 * 60 * 60_000;
const TODAY = FIXED_NOW;
const YESTERDAY = new Date(TODAY.getTime() - DAY_MS);
const SECRET = 'test-cron-secret';

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.owner.query(
    'truncate core.rate_limit, core.fx_rate, core.reminder_state, core.agent_connection',
  );
  await ensureAccount(db, USER_A);
});

describe('the email counter', () => {
  it('counts every email Resend accepted, per UTC day, without touching other rate limits', async () => {
    await recordEmailSent(db.appDb, new Date('2026-07-31T23:00:00.000Z'));
    await recordEmailSent(db.appDb, new Date('2026-08-01T00:00:00.000Z'));
    await recordEmailSent(db.appDb, new Date('2026-08-01T09:00:00.000Z'));
    await recordEmailSent(db.appDb, new Date('2026-08-02T00:00:00.000Z'));
    await db.appDb
      .insert(rateLimit)
      .values({ key: 'signin:ip:127.0.0.1', windowStart: utcDayStart(TODAY), count: 5 });

    expect(await emailCounts(db.appDb, TODAY)).toEqual({ today: 2, yesterday: 1, month: 2 });
  });

  it('counts a day at the month boundary as yesterday, not as this month', async () => {
    await recordEmailSent(db.appDb, new Date('2026-07-31T12:00:00.000Z'));
    expect(await emailCounts(db.appDb, new Date('2026-08-01T01:00:00.000Z'))).toEqual({
      today: 0,
      yesterday: 1,
      month: 0,
    });
  });
});

describe('countUnsentSecurityEmails()', () => {
  const connection = (id: string, createdAt: Date, securityEmailSentAt: Date | null = null) => ({
    id,
    userId: USER_A,
    clientId: `https://agent.example/${id}.json`,
    clientName: 'Fictional agent',
    registration: 'cimd' as const,
    client: 'other' as const,
    createdAt,
    securityEmailSentAt,
  });

  it('counts only the emails older than 24 hours, younger than 7 days, and unsent', async () => {
    await db.appDb
      .insert(agentConnection)
      .values([
        connection('con_01K1G4KX00AAAAAAAAAAAAAAAA', new Date(TODAY.getTime() - 25 * 60 * 60_000)),
        connection(
          'con_01K1G4KX00BBBBBBBBBBBBBBBB',
          new Date(TODAY.getTime() - 8 * 24 * 60 * 60_000),
        ),
        connection('con_01K1G4KX00CCCCCCCCCCCCCCCC', new Date(TODAY.getTime() - 2 * 60 * 60_000)),
        connection(
          'con_01K1G4KX00DDDDDDDDDDDDDDDD',
          new Date(TODAY.getTime() - 25 * 60 * 60_000),
          new Date(TODAY.getTime() - 20 * 60 * 60_000),
        ),
      ]);
    expect(
      await countUnsentSecurityEmails(
        db.appDb,
        new Date(TODAY.getTime() - 7 * DAY_MS),
        new Date(TODAY.getTime() - DAY_MS),
      ),
    ).toBe(1);
  });
});

describe('readLocalFigures()', () => {
  it('reads every figure, with zeroes and no rates on a quiet, empty day', async () => {
    expect(await readLocalFigures(db.appDb, TODAY)).toEqual({
      emails: { today: 0, yesterday: 0, month: 0 },
      reminderCapReachedYesterday: false,
      securityEmailsUnsent24h: 0,
      fxLatest: { ecb: null, fallback: null },
    });
  });

  it('reads the latest rate of each source', async () => {
    await db.appDb.insert(fxRate).values([
      { date: '2026-07-30', currency: 'EUR', perUsd: '1.1', source: 'ecb' },
      { date: '2026-07-31', currency: 'EUR', perUsd: '1.2', source: 'ecb' },
      { date: '2026-07-31', currency: 'GBP', perUsd: '1.3', source: 'fallback' },
    ]);
    expect((await readLocalFigures(db.appDb, TODAY)).fxLatest).toEqual({
      ecb: '2026-07-31',
      fallback: '2026-07-31',
    });
  });
});

describe('POST /api/cron/health with the core figures', () => {
  function app() {
    const sent: Parameters<NotifyOperator>[0][] = [];
    const notifyOperator: NotifyOperator = (msg) => {
      sent.push(msg);
      return Promise.resolve({ channel: 'email' });
    };
    const server = new Hono<AppEnv>();
    server.use(
      '/api/cron/*',
      cronAuth(() => SECRET),
    );
    server.post(
      '/api/cron/health',
      healthJob(() => ({
        clock: () => TODAY,
        readFigures: (today) => readLocalFigures(db.appDb, today),
        opsEmailConfigured: () => true,
        notifyOperator,
      })),
    );
    server.onError(handleError);
    return { server, sent };
  }

  it('turns 70 accepted emails yesterday into one alert', async () => {
    await db.appDb.insert(rateLimit).values({
      key: emailCountKey(YESTERDAY),
      windowStart: utcDayStart(YESTERDAY),
      count: 70,
    });
    await db.appDb.insert(fxRate).values([
      { date: '2026-07-31', currency: 'EUR', perUsd: '1.1', source: 'ecb' },
      { date: '2026-07-31', currency: 'GBP', perUsd: '1.3', source: 'fallback' },
    ]);
    const { server, sent } = app();
    const res = await server.request('/api/cron/health', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        neon: { computeCuHours: 10, storageGb: 0.1 },
        slo: { calls: 100, successRate: 99.9, p95Ms: 800 },
        testAlert: false,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ triggers: ['emails_day'] });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.figures.emails).toEqual({ today: 0, yesterday: 70, month: 0 });
  });
});
