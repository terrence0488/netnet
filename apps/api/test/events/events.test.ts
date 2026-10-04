import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eventStore } from '../../src/db/analytics';
import { countHit } from '../../src/db/rate-limits';
import { event, profile } from '../../src/db/schema';
import { EVENTS_PER_MINUTE_PER_IP } from '../../src/http/events';
import { createTrack, type Track } from '../../src/events/track';
import type { SessionUser } from '../../src/lib/context';
import { createRateLimit, type RateLimit } from '../../src/lib/rate-limit';
import { eventsApp, postEvent } from '../support/events-app';
import { captureWaitUntil, type CapturedWaitUntil } from '../support/wait-until';
import {
  FIXED_NOW,
  USER_A,
  USER_B,
  createTestDatabase,
  sqlState,
  type TestDatabase,
} from '../isolation/harness';

/**
 * `track()` and `POST /api/events` against Postgres, as `netnet_app`: the app writes events and
 * cannot read them back (architecture §6.1), the segment comes from `core.profile`, and the rate
 * limit counts in `core.rate_limit` across connections.
 */
let db: TestDatabase;
let track: Track;
let now: Date;
let rateLimit: RateLimit;

beforeAll(async () => {
  db = await createTestDatabase();
  track = createTrack(() => ({ store: eventStore(db.appDb), clock: () => FIXED_NOW }));
  rateLimit = createRateLimit(() => ({
    count: (key, windowStart) => countHit(db.appDb, key, windowStart),
    clock: () => now,
  }));
  await db.appDb.insert(profile).values({ userId: USER_A, segment: 'accumulating' });
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  now = FIXED_NOW;
  await db.owner.query('truncate analytics.event, core.rate_limit');
});

interface StoredEvent {
  name: string;
  at: Date;
  user_id: string | null;
  visitor: string | null;
  segment: string;
  props: unknown;
  app_version: string;
}

/** Every event, read as the owner: the app itself cannot. */
async function storedEvents(): Promise<StoredEvent[]> {
  const { rows } = await db.owner.query<StoredEvent>(
    'select name, at, user_id, visitor, segment, props, app_version from analytics.event order by id',
  );
  return rows;
}

describe('track() as netnet_app', () => {
  it('inserts the event with the segment from core.profile', async () => {
    await track(
      'holding_created',
      { source: 'web', via: 'guided' },
      {
        userId: USER_A,
        appVersion: 'abc1234',
      },
    );
    expect(await storedEvents()).toStrictEqual([
      {
        name: 'holding_created',
        at: FIXED_NOW,
        user_id: USER_A,
        visitor: null,
        segment: 'accumulating',
        props: { source: 'web', via: 'guided' },
        app_version: 'abc1234',
      },
    ]);
  });

  it('carries unknown for a user with no profile yet, and with no user', async () => {
    await track('session_started', {}, { userId: USER_B, appVersion: 'dev' });
    await track('signup_started', { method: 'email' }, { appVersion: 'dev' });
    expect((await storedEvents()).map((e) => [e.user_id, e.segment])).toStrictEqual([
      [USER_B, 'unknown'],
      [null, 'unknown'],
    ]);
  });

  it('cannot select, change or delete what it wrote', async () => {
    await track('value_undone', {}, { userId: USER_A, appVersion: 'dev' });
    expect(await sqlState(db.appDb.select().from(event))).toBe('42501');
    expect(await sqlState(db.app.query(`update analytics.event set segment = 'unknown'`))).toBe(
      '42501',
    );
    expect(await sqlState(db.app.query('delete from analytics.event'))).toBe('42501');
    expect(await storedEvents()).toHaveLength(1);
  });

  it('writes nothing for an event its schema rejects', async () => {
    expect(() =>
      track('value_recorded', { source: 'web', amount: 1200 } as never, {
        userId: USER_A,
        appVersion: 'dev',
      }),
    ).toThrow(/props rejected/);
    expect(await storedEvents()).toStrictEqual([]);
  });
});

describe('rateLimit() over core.rate_limit', () => {
  it('counts every hit in one window, even concurrent ones', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => rateLimit('events:ip:192.0.2.1', 20, 60)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);
    const { rows } = await db.owner.query<{ key: string; window_start: Date; count: number }>(
      'select key, window_start, count from core.rate_limit',
    );
    expect(rows).toStrictEqual([
      {
        key: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
        window_start: FIXED_NOW,
        count: 25,
      },
    ]);
  });

  it('opens a new window when the minute turns', async () => {
    await rateLimit('k', 1, 60);
    await expect(rateLimit('k', 1, 60)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    now = new Date(FIXED_NOW.getTime() + 60_000);
    await expect(rateLimit('k', 1, 60)).resolves.toBe(undefined);
    const { rows } = await db.owner.query('select 1 from core.rate_limit');
    expect(rows).toHaveLength(2);
  });
});

describe('POST /api/events against the database', () => {
  let signedIn: SessionUser | null;
  let vercel: CapturedWaitUntil;
  const app = () => eventsApp({ track, rateLimit, appVersion: () => 'abc1234' }, () => signedIn);

  beforeEach(() => {
    signedIn = { userId: USER_A, emailVerified: false };
    vercel = captureWaitUntil();
  });

  afterEach(() => vercel.restore());

  it('writes a client event after the response, with the user and their segment', async () => {
    const res = await postEvent(app(), {
      name: 'agent_connection_started',
      props: { client: 'claude', entry: 'home' },
    });
    expect(res.status).toBe(204);
    await vercel.settle();
    expect(await storedEvents()).toMatchObject([
      {
        name: 'agent_connection_started',
        user_id: USER_A,
        segment: 'accumulating',
        props: { client: 'claude', entry: 'home' },
        app_version: 'abc1234',
      },
    ]);
  });

  it('writes signup_started without a session, and nothing for a refused event', async () => {
    signedIn = null;
    expect(
      (await postEvent(app(), { name: 'signup_started', props: { method: 'email' } })).status,
    ).toBe(204);
    expect((await postEvent(app(), { name: 'session_started', props: {} })).status).toBe(400);
    expect(
      (await postEvent(app(), { name: 'account_created', props: { method: 'email' } })).status,
    ).toBe(400);
    await vercel.settle();
    expect((await storedEvents()).map((e) => [e.name, e.user_id, e.segment])).toStrictEqual([
      ['signup_started', null, 'unknown'],
    ]);
  });

  it('answers 429 past the limit, and writes only what it accepted', async () => {
    const statuses: number[] = [];
    for (let i = 0; i <= EVENTS_PER_MINUTE_PER_IP; i += 1) {
      statuses.push((await postEvent(app(), { name: 'session_started', props: {} })).status);
    }
    expect(statuses.filter((s) => s === 204)).toHaveLength(EVENTS_PER_MINUTE_PER_IP);
    expect(statuses.at(-1)).toBe(429);
    await vercel.settle();
    expect(await storedEvents()).toHaveLength(EVENTS_PER_MINUTE_PER_IP);
  });
});
