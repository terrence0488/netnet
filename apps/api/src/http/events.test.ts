import { CLIENT_EVENT_NAMES, EVENT_NAMES, errorBodySchema, type Segment } from '@netnet/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventsApp, postEvent } from '../../test/support/events-app';
import { captureWaitUntil, type CapturedWaitUntil } from '../../test/support/wait-until';
import type { EventRow } from '../db/analytics';
import { createTrack } from '../events/track';
import type { SessionUser } from '../lib/context';
import { createRateLimit } from '../lib/rate-limit';
import { EVENTS_PER_MINUTE_PER_IP } from './events';

/** 2026-08-01T10:00:00Z: a minute boundary. */
const START = Date.UTC(2026, 7, 1, 10);
const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';

let now: number;
let rows: EventRow[];
let counters: Map<string, number>;
let signedIn: SessionUser | null;
let vercel: CapturedWaitUntil;
/** While set, writes wait for it: the response must not. */
let gate: Promise<void> | null;

const segments: Record<string, Segment> = { [USER]: 'starting_out' };

const app = eventsApp(
  {
    track: createTrack(() => ({
      store: {
        segmentOf: (userId) => Promise.resolve(segments[userId] ?? 'unknown'),
        insert: async (row) => {
          if (gate) await gate;
          rows.push(row);
        },
      },
      clock: () => new Date(now),
    })),
    rateLimit: createRateLimit(() => ({
      count: (key, windowStart) => {
        const slot = `${key}@${windowStart.getTime()}`;
        const count = (counters.get(slot) ?? 0) + 1;
        counters.set(slot, count);
        return Promise.resolve(count);
      },
      clock: () => new Date(now),
    })),
    appVersion: () => 'abc1234',
  },
  () => signedIn,
);

beforeEach(() => {
  now = START;
  rows = [];
  counters = new Map();
  signedIn = { userId: USER, emailVerified: false };
  vercel = captureWaitUntil();
  gate = null;
});

afterEach(() => vercel.restore());

/** A valid example of each client event. */
const EXAMPLES = {
  signup_started: { method: 'email' },
  session_started: {},
  agent_connection_started: { client: 'claude', entry: 'onboarding' },
  insights_viewed: { view: 'quarterly' },
  push_prompt_shown: { entry: 'home' },
  push_prompt_result: { entry: 'settings', result: 'not_now' },
} as const;

async function rejection(res: Response) {
  expect(res.status).toBe(400);
  const body = errorBodySchema.parse(await res.json());
  expect(body.error.code).toBe('VALIDATION_FAILED');
  await vercel.settle();
  expect(rows).toStrictEqual([]);
  return body.error.fields ?? {};
}

describe('POST /api/events', () => {
  it('has an example for every client event', () => {
    expect(Object.keys(EXAMPLES).sort()).toStrictEqual([...CLIENT_EVENT_NAMES].sort());
  });

  it.each(Object.entries(EXAMPLES))(
    'accepts %s with a session: 204, written after the response with the user and segment',
    async (name, props) => {
      const res = await postEvent(app, { name, props });
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(res.headers.get('X-Request-Id')).toMatch(/^req_/);
      await vercel.settle();
      expect(rows).toStrictEqual([
        {
          name,
          at: new Date(START),
          userId: USER,
          segment: 'starting_out',
          props,
          appVersion: 'abc1234',
        },
      ]);
    },
  );

  it('answers before the event is written, and hands the write to waitUntil', async () => {
    let open: () => void = () => undefined;
    gate = new Promise((resolve) => {
      open = resolve;
    });
    const res = await postEvent(app, { name: 'session_started', props: {} });
    expect(res.status).toBe(204);
    expect(vercel.pending).toBe(1);
    expect(rows).toStrictEqual([]);
    open();
    await vercel.settle();
    expect(rows).toHaveLength(1);
  });

  it('uses the segment the session already carries', async () => {
    signedIn = { userId: USER, emailVerified: true, segment: 'established' };
    await postEvent(app, { name: 'insights_viewed', props: { view: 'monthly' } });
    await vercel.settle();
    expect(rows[0]?.segment).toBe('established');
  });

  it('accepts an event without props as {}', async () => {
    expect((await postEvent(app, { name: 'session_started' })).status).toBe(204);
    await vercel.settle();
    expect(rows[0]?.props).toStrictEqual({});
  });

  describe('without a session', () => {
    beforeEach(() => {
      signedIn = null;
    });

    it('accepts signup_started, with no user and segment unknown', async () => {
      const res = await postEvent(app, { name: 'signup_started', props: { method: 'email' } });
      expect(res.status).toBe(204);
      await vercel.settle();
      expect(rows).toMatchObject([{ name: 'signup_started', userId: null, segment: 'unknown' }]);
    });

    it.each(CLIENT_EVENT_NAMES.filter((name) => name !== 'signup_started'))(
      'rejects %s',
      async (name) => {
        const fields = await rejection(await postEvent(app, { name, props: EXAMPLES[name] }));
        expect(fields).toStrictEqual({
          name: `${name} needs a signed-in session. Without one, only signup_started is accepted.`,
        });
      },
    );
  });

  it.each(EVENT_NAMES.filter((name) => !(CLIENT_EVENT_NAMES as readonly string[]).includes(name)))(
    'rejects the server-only event %s',
    async (name) => {
      const fields = await rejection(await postEvent(app, { name, props: {} }));
      expect(fields.name).toMatch(new RegExp(`^${name} is recorded by the server\\.`));
    },
  );

  it('rejects an unknown name without echoing it', async () => {
    const fields = await rejection(
      await postEvent(app, { name: 'balance_viewed', props: { amount: 1200 } }),
    );
    expect(fields).toStrictEqual({
      name: `Use one of ${CLIENT_EVENT_NAMES.join(', ')}.`,
    });
  });

  it('rejects unknown props, naming each', async () => {
    const fields = await rejection(
      await postEvent(app, {
        name: 'insights_viewed',
        props: { view: 'yearly', net_worth: 1840250, holding: 'Savings' },
      }),
    );
    expect(fields).toStrictEqual({
      'props.net_worth': 'insights_viewed has no such prop; remove it.',
      'props.holding': 'insights_viewed has no such prop; remove it.',
    });
  });

  it('rejects free text in an enum prop, and a missing prop', async () => {
    const fields = await rejection(
      await postEvent(app, { name: 'push_prompt_result', props: { result: 'I said no' } }),
    );
    expect(Object.keys(fields).sort()).toStrictEqual(['props.entry', 'props.result']);
    expect(fields['props.result']).toContain('"granted"|"denied"|"not_now"');
  });

  it('rejects props that are not an object, extra top-level keys, and a body that is not one event', async () => {
    expect(
      await rejection(await postEvent(app, { name: 'session_started', props: 'hello' })),
    ).toHaveProperty(['props']);
    expect(
      await rejection(
        await postEvent(app, { name: 'session_started', props: {}, userId: 'usr_someone' }),
      ),
    ).toStrictEqual({ userId: 'Remove it: send name and props.' });
    expect(await rejection(await postEvent(app, '{"name": '))).toHaveProperty(['body']);
    expect(await rejection(await postEvent(app, [{ name: 'session_started' }]))).toHaveProperty([
      'body',
    ]);
    expect(await rejection(await postEvent(app, 'null'))).toHaveProperty(['body']);
  });

  it('rejects a body larger than one event', async () => {
    const fields = await rejection(
      await postEvent(app, { name: 'session_started', props: {}, padding: 'x'.repeat(4096) }),
    );
    expect(fields).toStrictEqual({ body: 'Send at most 2048 bytes: one event.' });
  });

  describe('the rate limit', () => {
    it(`allows ${EVENTS_PER_MINUTE_PER_IP} a minute per IP, then answers 429 with retry_after_s`, async () => {
      for (let i = 0; i < EVENTS_PER_MINUTE_PER_IP; i += 1) {
        expect((await postEvent(app, { name: 'session_started', props: {} })).status).toBe(204);
      }
      now = START + 20_000;
      const res = await postEvent(app, { name: 'session_started', props: {} });
      expect(res.status).toBe(429);
      expect(errorBodySchema.parse(await res.json()).error).toMatchObject({
        code: 'RATE_LIMITED',
        retry_after_s: 40,
      });
      await vercel.settle();
      expect(rows).toHaveLength(EVENTS_PER_MINUTE_PER_IP);
    });

    it('counts each IP on its own, and starts again the next minute', async () => {
      for (let i = 0; i < EVENTS_PER_MINUTE_PER_IP; i += 1) {
        await postEvent(app, { name: 'session_started', props: {} }, '192.0.2.10');
      }
      expect((await postEvent(app, { name: 'session_started' }, '192.0.2.10')).status).toBe(429);
      expect((await postEvent(app, { name: 'session_started' }, '192.0.2.11')).status).toBe(204);
      now = START + 60_000;
      expect((await postEvent(app, { name: 'session_started' }, '192.0.2.10')).status).toBe(204);
    });

    it('counts anonymous requests too', async () => {
      signedIn = null;
      for (let i = 0; i < EVENTS_PER_MINUTE_PER_IP; i += 1) {
        await postEvent(app, { name: 'signup_started', props: { method: 'email' } });
      }
      const res = await postEvent(app, { name: 'signup_started', props: { method: 'email' } });
      expect(res.status).toBe(429);
    });

    it('does not count a malformed request', async () => {
      for (let i = 0; i < EVENTS_PER_MINUTE_PER_IP + 5; i += 1) {
        await postEvent(app, { name: 'value_recorded', props: { source: 'web' } });
      }
      expect(counters.size).toBe(0);
      expect((await postEvent(app, { name: 'session_started' })).status).toBe(204);
    });
  });

  it('answers only POST', async () => {
    const res = await app.request('/api/events');
    expect(res.status).toBe(404);
  });
});
