import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteEndpointsForUser, secondsUntil2100 } from '../../src/db/endpoints';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { ORIGIN, TEST_VAPID, accountsApp, type AccountsApp } from '../support/accounts-app';
import { signUpPerson, type Person } from '../support/oauth-client';

/**
 * The endpoints lifecycle (PRD J12, architecture §7.2): subscribe, idempotent re-subscribe,
 * re-activation, the session check-in with rotation, switch off, Remove, sign-out — each with the
 * right `push_*` event — the prefs, the VAPID key, and deletion cleanup with no event.
 */
let db: TestDatabase;
let target: AccountsApp;
let serial = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
}, 60_000);

beforeEach(() => {
  target.clock.now = FIXED_NOW;
  target.emailDown.value = false;
});

afterAll(async () => {
  await db?.close();
});

function newPerson(): Promise<Person> {
  serial += 1;
  return signUpPerson(target, db, `endpoint-person-${serial}@example.com`);
}

const KEYS = { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' };

/** The refusal for a push service off the list: plain words, and what happens instead. */
const NOT_A_PUSH_SERVICE =
  "This browser's push service is not one NetNet sends to; reminders will come by email instead.";
const subscription = (n: number) => ({
  endpoint: `https://push.example.net/push/device-${serial}-${n}`,
  keys: KEYS,
  platform: 'android',
  deviceLabel: 'Android · Chrome',
});

async function postEndpoint(person: Person, body: Record<string, unknown>) {
  const res = await person.browser.send('/api/notifications/endpoints', { json: body });
  return { status: res.status, body: (await res.json()) as { id: string } };
}

async function prefsOf(person: Person) {
  const res = await person.browser.send('/api/notifications/prefs');
  expect(res.status).toBe(200);
  return (await res.json()) as {
    reminders: boolean;
    email: boolean;
    emailVerified: boolean;
    devices: { id: string; label: string; platform: string; lastSeenAt: string }[];
  };
}

async function events(userId: string, name: string) {
  await target.settle();
  const { rows } = await db.owner.query<{ name: string; props: Record<string, unknown> }>(
    `select name, props from analytics.event where user_id = $1 and name = $2 order by id`,
    [userId, name],
  );
  return rows;
}

async function rowsOf(userId: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    `select id, user_id, channel, endpoint, keys, platform, device_label, created_at,
       last_seen_at, last_success_at, failure_count, revoked_at
     from core.notification_endpoint where user_id = $1 order by created_at, id`,
    [userId],
  );
  return rows;
}

describe('POST /api/notifications/endpoints', () => {
  it('saves a subscription and fires push_enabled {platform}', async () => {
    const person = await newPerson();
    const { status, body } = await postEndpoint(person, subscription(1));
    expect(status).toBe(200);
    expect(body.id).toMatch(/^nep_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

    const rows = await rowsOf(person.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: body.id,
      channel: 'webpush',
      endpoint: subscription(1).endpoint,
      keys: KEYS,
      platform: 'android',
      device_label: 'Android · Chrome',
      failure_count: 0,
      last_success_at: null,
      revoked_at: null,
    });
    expect((rows[0]?.last_seen_at as Date).toISOString()).toBe(FIXED_NOW.toISOString());
    expect(await events(person.userId, 'push_enabled')).toEqual([
      { name: 'push_enabled', props: { platform: 'android' } },
    ]);
  });

  it('is idempotent per endpoint URL: the same id, and no second event', async () => {
    const person = await newPerson();
    const first = await postEndpoint(person, subscription(1));
    // A re-subscribe with rotated keys and a new label keeps the row.
    const second = await postEndpoint(person, {
      ...subscription(1),
      keys: { p256dh: 'BNewRotatedP256dhKey0123456789_-ab', auth: 'newrotatedauthsecret12' },
      deviceLabel: 'Android · Firefox',
    });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    const rows = await rowsOf(person.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.body.id,
      keys: { p256dh: 'BNewRotatedP256dhKey0123456789_-ab', auth: 'newrotatedauthsecret12' },
      device_label: 'Android · Firefox',
    });
    expect(await events(person.userId, 'push_enabled')).toHaveLength(1);
  });

  it('re-activates a revoked row, its failures forgotten, firing push_enabled again', async () => {
    const person = await newPerson();
    const first = await postEndpoint(person, subscription(1));
    const gone = await person.browser.send(
      `/api/notifications/endpoints/${first.body.id}?by=user`,
      {
        method: 'DELETE',
      },
    );
    expect(gone.status).toBe(204);
    await db.owner.query(`update core.notification_endpoint set failure_count = 4 where id = $1`, [
      first.body.id,
    ]);
    const second = await postEndpoint(person, subscription(1));
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    const rows = await rowsOf(person.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ failure_count: 0, revoked_at: null });
    expect(await events(person.userId, 'push_enabled')).toHaveLength(2);
  });

  it('accepts a subscription at each push service on the list', async () => {
    const person = await newPerson();
    const endpoints = [
      `https://fcm.googleapis.com/fcm/send/device-${serial}`,
      `https://updates.push.services.mozilla.com/wpush/v2/device-${serial}`,
      `https://wns2-par02p.notify.windows.com/w/?token=device-${serial}`,
      `https://web.push.apple.com/device-${serial}`,
    ];
    for (const endpoint of endpoints) {
      const { status } = await postEndpoint(person, { ...subscription(1), endpoint });
      expect(status, endpoint).toBe(200);
    }
    // One clock tick for all four: the order among them is the ids' random part.
    expect((await rowsOf(person.userId)).map((row) => row.endpoint).sort()).toEqual(
      [...endpoints].sort(),
    );
  });

  it('refuses any other host, an IP literal, a port or userinfo, storing nothing', async () => {
    const person = await newPerson();
    for (const endpoint of [
      'https://push.example.org/push/device',
      'https://evilnotify.windows.com.example/w/?token=device',
      'https://notify.windows.com/w/?token=device',
      'https://203.0.113.7/push/device',
      'https://[2001:db8::7]/push/device',
      'https://push.example.net:8443/push/device',
      'https://someone:secret@push.example.net/push/device',
    ]) {
      const res = await person.browser.send('/api/notifications/endpoints', {
        json: { ...subscription(1), endpoint },
      });
      expect(res.status, endpoint).toBe(400);
      expect(await res.json(), endpoint).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          fields: { endpoint: NOT_A_PUSH_SERVICE },
        },
      });
    }
    expect(await rowsOf(person.userId)).toEqual([]);
    expect(await events(person.userId, 'push_enabled')).toEqual([]);
  });

  it('holds one row per person per URL: another account may hold the same URL', async () => {
    const a = await newPerson();
    const b = await newPerson();
    const shared = { ...subscription(9), endpoint: 'https://push.example.net/push/shared-device' };
    const first = await postEndpoint(a, shared);
    const second = await postEndpoint(b, shared);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.id).not.toBe(first.body.id);
    expect(await rowsOf(a.userId)).toHaveLength(1);
    expect(await rowsOf(b.userId)).toHaveLength(1);
  });
});

describe('the prefs', () => {
  it('lists the active devices with their switches, on by default', async () => {
    const person = await newPerson();
    expect(await prefsOf(person)).toEqual({
      reminders: true,
      email: true,
      emailVerified: true,
      devices: [],
    });
    const first = await postEndpoint(person, {
      ...subscription(1),
      platform: 'ios',
      deviceLabel: 'iOS · Safari',
    });
    const second = await postEndpoint(person, subscription(2));
    const gone = await person.browser.send(
      `/api/notifications/endpoints/${first.body.id}?by=user`,
      {
        method: 'DELETE',
      },
    );
    expect(gone.status).toBe(204);
    await target.settle();
    // Active only: the revoked device is gone from the list.
    expect(await prefsOf(person)).toEqual({
      reminders: true,
      email: true,
      emailVerified: true,
      devices: [
        {
          id: second.body.id,
          label: 'Android · Chrome',
          platform: 'android',
          lastSeenAt: FIXED_NOW.toISOString(),
        },
      ],
    });
  });

  it('applies PATCH at once, either switch or both, making the row when missing', async () => {
    const person = await newPerson();
    await db.owner.query('delete from core.reminder_state where user_id = $1', [person.userId]);
    expect(await prefsOf(person)).toMatchObject({ reminders: true, email: true });
    const off = await person.browser.send('/api/notifications/prefs', {
      method: 'PATCH',
      json: { reminders: false },
    });
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ reminders: false, email: true });
    const on = await person.browser.send('/api/notifications/prefs', {
      method: 'PATCH',
      json: { reminders: true, email: false },
    });
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({ reminders: true, email: false });
    expect(await prefsOf(person)).toMatchObject({ reminders: true, email: false });
  });
});

describe('GET /api/notifications/vapid-key', () => {
  it('serves the public key', async () => {
    const person = await newPerson();
    const res = await person.browser.send('/api/notifications/vapid-key');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicKey: TEST_VAPID.publicKey });
  });
});

describe('PUT /api/notifications/endpoints/:id', () => {
  it('checks the session in, moving last_seen_at and following a rotation', async () => {
    const person = await newPerson();
    const { body } = await postEndpoint(person, subscription(1));
    target.clock.now = new Date(FIXED_NOW.getTime() + 3 * 24 * 60 * 60_000);
    const rotated = {
      endpoint: `https://push.example.net/push/rotated-${serial}`,
      keys: { p256dh: 'BRotatedP256dhKey0123456789_-abcdef', auth: 'rotatedauthsecret1234' },
    };
    const res = await person.browser.send(`/api/notifications/endpoints/${body.id}`, {
      method: 'PUT',
      json: rotated,
    });
    expect(res.status).toBe(204);
    const rows = await rowsOf(person.userId);
    expect(rows[0]).toMatchObject({ id: body.id, endpoint: rotated.endpoint, keys: rotated.keys });
    expect((rows[0]?.last_seen_at as Date).toISOString()).toBe(target.clock.now.toISOString());
    expect(await events(person.userId, 'push_enabled')).toHaveLength(1);
    expect(await events(person.userId, 'push_disabled')).toEqual([]);
  });

  it('refuses a rotation off the list, leaving the device as it was', async () => {
    const person = await newPerson();
    const { body } = await postEndpoint(person, subscription(1));
    const before = await rowsOf(person.userId);
    const res = await person.browser.send(`/api/notifications/endpoints/${body.id}`, {
      method: 'PUT',
      json: { endpoint: 'https://push.example.org/push/rotated', keys: KEYS },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fields: { endpoint: NOT_A_PUSH_SERVICE } },
    });
    expect(await rowsOf(person.userId)).toEqual(before);
  });

  it('answers 404 for an unknown, revoked or removed device', async () => {
    const person = await newPerson();
    const { body } = await postEndpoint(person, subscription(1));
    const revoked = await person.browser.send(`/api/notifications/endpoints/${body.id}?by=user`, {
      method: 'DELETE',
    });
    expect(revoked.status).toBe(204);
    for (const id of [body.id, 'nep_01K1G4KX00ZZZZZZZZZZZZZZZZ']) {
      const res = await person.browser.send(`/api/notifications/endpoints/${id}`, {
        method: 'PUT',
        json: { endpoint: subscription(1).endpoint, keys: KEYS },
      });
      expect(res.status, id).toBe(404);
      expect(await res.text()).toContain('NOT_FOUND');
    }
  });

  it('merges a rotation onto a URL another row holds: one URL, one row', async () => {
    const person = await newPerson();
    const first = await postEndpoint(person, subscription(1));
    const second = await postEndpoint(person, subscription(2));
    const res = await person.browser.send(`/api/notifications/endpoints/${first.body.id}`, {
      method: 'PUT',
      json: { endpoint: subscription(2).endpoint, keys: KEYS },
    });
    expect(res.status).toBe(204);
    const rows = await rowsOf(person.userId);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === first.body.id)).toMatchObject({
      endpoint: subscription(2).endpoint,
      revoked_at: null,
    });
    expect(rows.find((row) => row.id === second.body.id)?.revoked_at).not.toBeNull();
    // A merge is no device turned off: no event.
    expect(await events(person.userId, 'push_disabled')).toEqual([]);
  });
});

describe('DELETE /api/notifications/endpoints/:id', () => {
  it('turns the device off (?by=user), firing push_disabled once', async () => {
    const person = await newPerson();
    const { body } = await postEndpoint(person, subscription(1));
    const res = await person.browser.send(`/api/notifications/endpoints/${body.id}?by=user`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
    const rows = await rowsOf(person.userId);
    expect(rows[0]?.revoked_at).not.toBeNull();
    expect(await events(person.userId, 'push_disabled')).toEqual([
      { name: 'push_disabled', props: { platform: 'android', by: 'user' } },
    ]);
    // Already gone: 404, and no second event.
    const again = await person.browser.send(`/api/notifications/endpoints/${body.id}?by=user`, {
      method: 'DELETE',
    });
    expect(again.status).toBe(404);
    expect(await events(person.userId, 'push_disabled')).toHaveLength(1);
  });

  it('signs the device out (?by=signout) with its own event', async () => {
    const person = await newPerson();
    const { body } = await postEndpoint(person, {
      ...subscription(1),
      platform: 'desktop',
      deviceLabel: 'macOS · Safari',
    });
    const res = await person.browser.send(`/api/notifications/endpoints/${body.id}?by=signout`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
    expect(await events(person.userId, 'push_disabled')).toEqual([
      { name: 'push_disabled', props: { platform: 'desktop', by: 'signout' } },
    ]);
  });

  it('answers 404 for an unknown device', async () => {
    const person = await newPerson();
    const res = await person.browser.send(
      '/api/notifications/endpoints/nep_01K1G4KX00ZZZZZZZZZZZZZZZZ?by=user',
      { method: 'DELETE' },
    );
    expect(res.status).toBe(404);
    expect(await events(person.userId, 'push_disabled')).toEqual([]);
  });
});

describe('deletion cleanup', () => {
  it('removes every endpoint with no push_disabled', async () => {
    const person = await newPerson();
    await postEndpoint(person, subscription(1));
    await postEndpoint(person, subscription(2));
    expect(await deleteEndpointsForUser(db.appDb, person.userId)).toBe(2);
    expect(await rowsOf(person.userId)).toEqual([]);
    expect(await prefsOf(person)).toMatchObject({ devices: [] });
    expect(await events(person.userId, 'push_disabled')).toEqual([]);
  });
});

describe('secondsUntil2100', () => {
  it('counts the seconds until 21:00 in the zone, never negative', () => {
    // 10:00 UTC: Singapore 18:00 (3h left), New York 06:00 (15h left).
    const at = new Date('2026-08-01T10:00:00.000Z');
    expect(secondsUntil2100('Asia/Singapore', at)).toBe(3 * 3600);
    expect(secondsUntil2100('America/New_York', at)).toBe(15 * 3600);
    expect(secondsUntil2100('UTC', new Date('2026-08-01T20:59:30.000Z'))).toBe(30);
    // Past 21:00 (only clock skew away, the run sends in the daytime): tried at once, expiring.
    expect(secondsUntil2100('UTC', new Date('2026-08-01T21:00:00.000Z'))).toBe(0);
    expect(secondsUntil2100('UTC', new Date('2026-08-01T23:00:00.000Z'))).toBe(0);
    // An unknown zone reads the day in UTC rather than failing.
    expect(secondsUntil2100('Not/AZone', at)).toBe(11 * 3600);
  });
});

describe('the routes’ address', () => {
  it('lives under /api/notifications', async () => {
    const res = await target.app.request(`${ORIGIN}/api/notifications/prefs`);
    expect(res.status).toBe(401);
  });
});
