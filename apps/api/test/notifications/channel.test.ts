import { createECDH, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import webpush from 'web-push';
import { eventStore } from '../../src/db/analytics';
import {
  activePushTargets,
  recordPushFailure,
  recordPushSuccess,
  revokeEndpoint,
} from '../../src/db/endpoints';
import { createTrack } from '../../src/events/track';
import type { PushEndpoint } from '../../src/notify/channel';
import { webPushChannel, type VapidConfig, type WebPushPost } from '../../src/notify/webpush';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  CRON_SECRET,
  ORIGIN,
  TEST_PUSH_HOSTS,
  accountsApp,
  type AccountsApp,
} from '../support/accounts-app';
import { signUpPerson, type Person } from '../support/oauth-client';

/**
 * Revocation (architecture §7.10 step 6, CONVENTIONS §9): `404`/`410` revokes a device at once;
 * any other failure counts, and the fifth in a row revokes; a success resets the count. Each rule
 * against the real rows, and a `410` through a real reminder run — with the real channel, real
 * encryption and the test VAPID keys — revoking the device, firing `push_disabled {by: browser}`
 * and falling back to email. An endpoint stored off the push services' list is revoked the same
 * way, without being sent to.
 */
let db: TestDatabase;
let target: AccountsApp;
let serial = 0;

const VAPID: VapidConfig = {
  ...webpush.generateVAPIDKeys(),
  subject: 'mailto:push@netnet.example',
};

/** Per-device HTTP answers for the run's push service, in send order. */
let answers: { ok: boolean; status: number }[];
const sent: { url: string; headers: Record<string, string>; body: Buffer }[] = [];

const post: WebPushPost = (url, init) => {
  sent.push({ url, headers: init.headers, body: init.body });
  const answer = answers[sent.length - 1] ?? { ok: false, status: 500 };
  return Promise.resolve(answer);
};

beforeAll(async () => {
  db = await createTestDatabase();
  // The run below sends through the real channel over the real rows; the push service is the stub.
  const track = createTrack(() => ({ store: eventStore(db.appDb), clock: () => target.clock.now }));
  target = accountsApp(db, {
    push: {
      endpoints: async (userId): Promise<PushEndpoint[]> =>
        (await activePushTargets(db.appDb, userId, target.clock.now)).map((row) => ({
          id: row.id,
          userId: row.userId,
          platform: row.platform,
          subscription: { endpoint: row.endpoint, ...row.keys },
          ttlSeconds: row.ttlSeconds,
        })),
      channel: webPushChannel({
        vapid: VAPID,
        post,
        store: {
          success: (id, at) => recordPushSuccess(db.appDb, id, at),
          failure: (id, status, at) => recordPushFailure(db.appDb, id, status, at),
          revoke: async (id, userId, at) =>
            (await revokeEndpoint(db.appDb, userId, id, at)) !== null,
        },
        track,
        appVersion: () => 'test123',
        clock: () => target.clock.now,
        pushHosts: TEST_PUSH_HOSTS,
      }),
    },
  });
}, 60_000);

beforeEach(() => {
  target.clock.now = FIXED_NOW;
  target.emailDown.value = false;
  answers = [];
  sent.length = 0;
});

afterAll(async () => {
  await db?.close();
});

function newPerson(): Promise<Person> {
  serial += 1;
  return signUpPerson(target, db, `revoke-person-${serial}@example.com`);
}

/** A subscription the library can really encrypt for. */
function realKeys(): { p256dh: string; auth: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

async function subscribe(person: Person, n: number): Promise<string> {
  const res = await person.browser.send('/api/notifications/endpoints', {
    json: {
      endpoint: `https://push.example.net/push/revoke-${serial}-${n}`,
      keys: realKeys(),
      platform: 'android',
      deviceLabel: 'Android · Chrome',
    },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

/** Makes the reminder due today (FIXED_NOW), as if the person last checked 30 days ago. */
async function makeDue(userId: string): Promise<void> {
  await db.owner.query(
    `update core.reminder_state set last_checked_on = '2026-07-02', next_due_on = '2026-08-01'
     where user_id = $1`,
    [userId],
  );
}

async function runReminders() {
  const res = await target.app.request(`${ORIGIN}/api/cron/reminders`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  await target.settle();
  expect(res.status).toBe(200);
  return res.json();
}

async function rowOf(id: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    `select failure_count, revoked_at, last_success_at from core.notification_endpoint
     where id = $1`,
    [id],
  );
  return rows[0];
}

async function events(userId: string, name: string) {
  await target.settle();
  const { rows } = await db.owner.query<{ name: string; props: Record<string, unknown> }>(
    `select name, props from analytics.event where user_id = $1 and name = $2 order by id`,
    [userId, name],
  );
  return rows;
}

describe('recordPushFailure', () => {
  it('revokes at once on 404 and 410', async () => {
    for (const status of [404, 410]) {
      const person = await newPerson();
      const id = await subscribe(person, status);
      const outcome = await recordPushFailure(db.appDb, id, status, FIXED_NOW);
      expect(outcome).toMatchObject({ userId: person.userId, revoked: true });
      expect(await rowOf(id)).toMatchObject({ failure_count: 1 });
      expect((await rowOf(id))?.revoked_at).not.toBeNull();
    }
  });

  it('counts other failures, revoking on the fifth in a row', async () => {
    const person = await newPerson();
    const id = await subscribe(person, 1);
    for (const [n, status] of [
      [1, 500],
      [2, 503],
      [3, 429],
      [4, undefined],
    ] as const) {
      const outcome = await recordPushFailure(db.appDb, id, status, FIXED_NOW);
      expect(outcome, `failure ${n}`).toMatchObject({ revoked: false });
      expect(await rowOf(id)).toMatchObject({ failure_count: n });
      expect((await rowOf(id))?.revoked_at, `failure ${n}`).toBeNull();
    }
    expect(await recordPushFailure(db.appDb, id, 500, FIXED_NOW)).toMatchObject({
      revoked: true,
    });
    expect(await rowOf(id)).toMatchObject({ failure_count: 5 });
    expect((await rowOf(id))?.revoked_at).not.toBeNull();
  });

  it('resets the count on a success, and stays silent on a revoked row', async () => {
    const person = await newPerson();
    const id = await subscribe(person, 1);
    await recordPushFailure(db.appDb, id, 500, FIXED_NOW);
    await recordPushFailure(db.appDb, id, 500, FIXED_NOW);
    await recordPushSuccess(db.appDb, id, FIXED_NOW);
    expect(await rowOf(id)).toMatchObject({ failure_count: 0 });
    expect((await rowOf(id))?.last_success_at).not.toBeNull();
    // Two failures after the success count from nothing: no revocation.
    await recordPushFailure(db.appDb, id, 500, FIXED_NOW);
    expect(await recordPushFailure(db.appDb, id, 500, FIXED_NOW)).toMatchObject({
      revoked: false,
    });
    // And once revoked, a late failure changes nothing and fires nothing.
    await recordPushFailure(db.appDb, id, 410, FIXED_NOW);
    expect(await recordPushFailure(db.appDb, id, 410, FIXED_NOW)).toBeNull();
    expect(await events(person.userId, 'push_disabled')).toEqual([]);
  });
});

describe('a 410 through a reminder run', () => {
  it('revokes the device, fires push_disabled {by: browser}, and falls back to email', async () => {
    const person = await newPerson();
    const id = await subscribe(person, 1);
    await target.settle();
    await db.owner.query(
      `update core.reminder_state set last_checked_on = '2026-07-02', next_due_on = '2026-08-01'
       where user_id = $1`,
      [person.userId],
    );
    answers = [{ ok: false, status: 410 }];

    const res = await target.app.request(`${ORIGIN}/api/cron/reminders`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    await target.settle();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reminders: { push: 0, email: 1, released: 0 } });

    // The real request went out first: encrypted, VAPID-signed, TTL'd.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toContain('/push/revoke-');
    expect(sent[0]?.headers['TTL']).toBe(String(3 * 3600));
    expect(sent[0]?.headers['Urgency']).toBe('normal');
    expect(sent[0]?.headers['Authorization']).toMatch(/^vapid t=[^,]+, k=.+$/);
    expect(sent[0]?.body.toString('latin1')).not.toContain('Your net worth');

    expect((await rowOf(id))?.revoked_at).not.toBeNull();
    expect(await events(person.userId, 'push_disabled')).toEqual([
      { name: 'push_disabled', props: { platform: 'android', by: 'browser' } },
    ]);
    expect(await events(person.userId, 'reminder_sent')).toEqual([
      { name: 'reminder_sent', props: { channel: 'email' } },
    ]);
    const prefs = await person.browser.send('/api/notifications/prefs');
    expect(((await prefs.json()) as { devices: unknown[] }).devices).toEqual([]);
  });
});

describe('an endpoint stored off the push services’ list', () => {
  it('is revoked at the next run instead of sent to, and the reminder goes by email', async () => {
    const person = await newPerson();
    const id = await subscribe(person, 1);
    await target.settle();
    // A row stored before the list: the route refuses such a URL now, so it is written directly.
    await db.owner.query(`update core.notification_endpoint set endpoint = $2 where id = $1`, [
      id,
      `https://push.example.org/push/stored-before-the-list-${serial}`,
    ]);
    await makeDue(person.userId);
    answers = [{ ok: true, status: 201 }];

    expect(await runReminders()).toMatchObject({ reminders: { push: 0, email: 1, released: 0 } });
    expect(sent).toEqual([]);
    expect((await rowOf(id))?.revoked_at).not.toBeNull();
    expect(await events(person.userId, 'push_disabled')).toEqual([
      { name: 'push_disabled', props: { platform: 'android', by: 'browser' } },
    ]);
    expect(await events(person.userId, 'reminder_sent')).toEqual([
      { name: 'reminder_sent', props: { channel: 'email' } },
    ]);
  });

  it('leaves the person’s other devices to carry the reminder', async () => {
    const person = await newPerson();
    const off = await subscribe(person, 1);
    const on = await subscribe(person, 2);
    await target.settle();
    await db.owner.query(`update core.notification_endpoint set endpoint = $2 where id = $1`, [
      off,
      `https://push.example.org/push/stored-before-the-list-${serial}`,
    ]);
    await makeDue(person.userId);
    answers = [{ ok: true, status: 201 }];

    expect(await runReminders()).toMatchObject({ reminders: { push: 1, email: 0, released: 0 } });
    expect(sent.map((request) => request.url)).toEqual([
      `https://push.example.net/push/revoke-${serial}-2`,
    ]);
    expect((await rowOf(off))?.revoked_at).not.toBeNull();
    expect((await rowOf(on))?.revoked_at).toBeNull();
    expect(await events(person.userId, 'push_disabled')).toEqual([
      { name: 'push_disabled', props: { platform: 'android', by: 'browser' } },
    ]);
    expect(await events(person.userId, 'reminder_sent')).toEqual([
      { name: 'reminder_sent', props: { channel: 'push' } },
    ]);
  });
});
