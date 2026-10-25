import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Agent } from '../../src/auth/agent';
import { eventStore } from '../../src/db/analytics';
import { createDatabase } from '../../src/db/client';
import { countHit } from '../../src/db/rate-limits';
import { visitorSalt } from '../../src/db/schema';
import {
  SALT_BYTES,
  createVisitor,
  deleteSaltsBefore,
  saltFor,
  utcDay,
  visitorHash,
} from '../../src/db/visitor';
import { EVENTS_PER_MINUTE_PER_IP } from '../../src/http/events';
import { createTrack } from '../../src/events/track';
import { dailyJob } from '../../src/jobs/daily';
import type { AppEnv, SessionUser } from '../../src/lib/context';
import { createRateLimit } from '../../src/lib/rate-limit';
import { eventsApp } from '../support/events-app';
import { captureWaitUntil, type CapturedWaitUntil } from '../support/wait-until';
import {
  FIXED_NOW,
  USER_A,
  createTestDatabase,
  ensureAccount,
  type TestDatabase,
} from '../isolation/harness';

/**
 * `landing_view`'s cookie-less `visitor` against Postgres, as `netnet_app` (architecture §6.4):
 * one salt per UTC day in `core.visitor_salt`, shared by every connection, made on the day's first
 * event and deleted once the day has passed, on the next day's first event and by the daily sweep.
 * Clocks are fixed: FIXED_NOW is 2026-08-01T10:00:00Z.
 */
let db: TestDatabase;
let now: Date;

const at = (iso: string) => new Date(iso);
const UA = 'Mozilla/5.0 (fictional phone) AppleWebKit/605.1.15 Mobile/15E148';

beforeAll(async () => {
  db = await createTestDatabase();
  await ensureAccount(db, USER_A);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  now = FIXED_NOW;
  await db.owner.query('truncate core.visitor_salt, analytics.event, core.rate_limit');
});

/** The salts stored, read as the owner. */
async function salts(): Promise<{ day: string; bytes: number }[]> {
  const { rows } = await db.owner.query<{ day: string; bytes: number }>(
    `select to_char(day, 'YYYY-MM-DD') as day, octet_length(salt) as bytes
       from core.visitor_salt order by day`,
  );
  return rows;
}

interface StoredView {
  name: string;
  user_id: string | null;
  visitor: string | null;
  segment: string;
  props: unknown;
}

/** Every event, read as the owner: the app itself cannot. */
async function storedEvents(): Promise<StoredView[]> {
  const { rows } = await db.owner.query<StoredView>(
    'select name, user_id, visitor, segment, props from analytics.event order by id',
  );
  return rows;
}

describe('the daily salt', () => {
  it('is made on the day’s first read, 32 random bytes, and read back after', async () => {
    const first = await saltFor(db.appDb, '2026-08-01');
    expect(first).toHaveLength(SALT_BYTES);
    expect(await salts()).toStrictEqual([{ day: '2026-08-01', bytes: SALT_BYTES }]);
    const again = await saltFor(db.appDb, '2026-08-01', () => Buffer.alloc(SALT_BYTES, 1));
    expect(again.equals(first)).toBe(true);
    expect(await salts()).toHaveLength(1);
  });

  it('is one value for every connection, even when the day’s first reads race', async () => {
    const pools = [db.appPool({ max: 1 }), db.appPool({ max: 1 }), db.appPool({ max: 1 })];
    const read = await Promise.all(
      pools.map((pool, i) =>
        saltFor(createDatabase(pool), '2026-08-01', () => Buffer.alloc(SALT_BYTES, i + 1)),
      ),
    );
    expect(new Set(read.map((salt) => salt.toString('hex'))).size).toBe(1);
    expect(await salts()).toHaveLength(1);
  });

  it('turns with the UTC day: the next day’s first read makes a new one and deletes the past', async () => {
    const today = await saltFor(db.appDb, utcDay(at('2026-08-01T23:59:59.999Z')));
    const tomorrow = await saltFor(db.appDb, utcDay(at('2026-08-02T00:00:00.000Z')));
    expect(tomorrow.equals(today)).toBe(false);
    expect(await salts()).toStrictEqual([{ day: '2026-08-02', bytes: SALT_BYTES }]);
  });

  it('deletes every day before the given one, whatever the gap, and keeps that day', async () => {
    for (const day of ['2026-07-20', '2026-07-31', '2026-08-01']) {
      await db.appDb.insert(visitorSalt).values({ day, salt: Buffer.alloc(SALT_BYTES, 9) });
    }
    expect(await deleteSaltsBefore(db.appDb, '2026-08-01')).toBe(2);
    expect(await deleteSaltsBefore(db.appDb, '2026-08-01')).toBe(0);
    expect(await salts()).toStrictEqual([{ day: '2026-08-01', bytes: SALT_BYTES }]);
  });

  it('holds only 32 bytes and one row a day', async () => {
    await expect(
      db.owner.query(`insert into core.visitor_salt (day, salt) values ('2026-08-01', '\\x00')`),
    ).rejects.toMatchObject({ code: '23514' });
    await saltFor(db.appDb, '2026-08-01');
    await expect(
      db.owner.query(`insert into core.visitor_salt (day, salt) values ('2026-08-01', $1)`, [
        Buffer.alloc(SALT_BYTES),
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('the daily sweep', () => {
  it('deletes the past salts on a day nobody viewed the page, and says how many', async () => {
    for (const day of ['2026-07-30', '2026-07-31']) {
      await db.appDb.insert(visitorSalt).values({ day, salt: Buffer.alloc(SALT_BYTES, 3) });
    }
    const agent = { attempts: { sweep: () => Promise.resolve(0) } } as unknown as Agent;
    const app = new Hono<AppEnv>().get(
      '/api/cron/daily',
      dailyJob(
        () => agent,
        () => deleteSaltsBefore(db.appDb, utcDay(now)),
      ),
    );
    const res = await app.request('/api/cron/daily');
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ attemptsFailed: 0, saltsDeleted: 2 });
    expect(await salts()).toStrictEqual([]);
  });
});

describe('POST /api/events {name: landing_view}', () => {
  let signedIn: SessionUser | null;
  let vercel: CapturedWaitUntil;

  const app = () =>
    eventsApp(
      {
        track: createTrack(() => ({ store: eventStore(db.appDb), clock: () => now })),
        rateLimit: createRateLimit(() => ({
          count: (key, windowStart) => countHit(db.appDb, key, windowStart),
          clock: () => now,
        })),
        appVersion: () => 'abc1234',
        visitor: createVisitor(() => ({ db: () => db.appDb, clock: () => now })),
      },
      () => signedIn,
    );

  async function view(ip = '192.0.2.10', userAgent = UA): Promise<Response> {
    const res = await app().request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': ip, 'User-Agent': userAgent },
      body: JSON.stringify({ name: 'landing_view', props: {} }),
    });
    await vercel.settle();
    return res;
  }

  beforeEach(() => {
    signedIn = null;
    vercel = captureWaitUntil();
  });

  afterEach(() => vercel.restore());

  it('writes the event as nobody’s, segment unknown, with a 16-hex-character visitor, and sets no cookie', async () => {
    const res = await view();
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toBeNull();
    const [salt] = (await db.owner.query<{ salt: Buffer }>('select salt from core.visitor_salt'))
      .rows;
    expect(await storedEvents()).toStrictEqual([
      {
        name: 'landing_view',
        user_id: null,
        visitor: visitorHash(salt?.salt ?? Buffer.alloc(0), '192.0.2.10', UA),
        segment: 'unknown',
        props: {},
      },
    ]);
    expect((await storedEvents())[0]?.visitor).toMatch(/^[0-9a-f]{16}$/);
  });

  it('carries no user from a signed-in browser', async () => {
    signedIn = { userId: USER_A, emailVerified: true, segment: 'established' };
    expect((await view()).status).toBe(204);
    expect(await storedEvents()).toMatchObject([
      { name: 'landing_view', user_id: null, segment: 'unknown' },
    ]);
  });

  it('gives one browser one visitor all UTC day, another the next day, and deletes yesterday’s salt', async () => {
    now = at('2026-08-01T00:00:00.000Z');
    await view();
    now = at('2026-08-01T23:59:59.999Z');
    await view();
    await view('192.0.2.99');
    expect(await salts()).toStrictEqual([{ day: '2026-08-01', bytes: SALT_BYTES }]);

    now = at('2026-08-02T00:00:00.000Z');
    await view();
    expect(await salts()).toStrictEqual([{ day: '2026-08-02', bytes: SALT_BYTES }]);
    now = at('2026-08-02T18:30:00.000Z');
    await view();

    const [morning, night, other, nextDay, nextEvening] = (await storedEvents()).map(
      (e) => e.visitor,
    );
    expect(night).toBe(morning);
    expect(other).not.toBe(morning);
    expect(nextDay).not.toBe(morning);
    expect(nextEvening).toBe(nextDay);
    for (const visitor of [morning, other, nextDay]) expect(visitor).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives no other event a visitor', async () => {
    await view();
    signedIn = { userId: USER_A, emailVerified: true };
    await app().request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.10', 'User-Agent': UA },
      body: JSON.stringify({ name: 'session_started', props: {} }),
    });
    await vercel.settle();
    expect((await storedEvents()).map((e) => [e.name, e.visitor === null])).toStrictEqual([
      ['landing_view', false],
      ['session_started', true],
    ]);
  });

  it(`answers 429 past ${EVENTS_PER_MINUTE_PER_IP} a minute per IP, and writes only what it accepted`, async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= EVENTS_PER_MINUTE_PER_IP; i += 1) statuses.push((await view()).status);
    expect(statuses.filter((s) => s === 204)).toHaveLength(EVENTS_PER_MINUTE_PER_IP);
    expect(statuses.at(-1)).toBe(429);
    expect(await storedEvents()).toHaveLength(EVENTS_PER_MINUTE_PER_IP);
    expect((await view('192.0.2.11')).status).toBe(204);
  });
});
