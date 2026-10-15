import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MARKER_A, MARKER_B, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { accountsApp, type AccountsApp } from '../support/accounts-app';
import { signUpPerson, type Person } from '../support/oauth-client';

/**
 * The notifications routes' isolation (architecture §8, CONVENTIONS §9): B with A's endpoint ids
 * answers NOT_FOUND with none of A's markers, and leaves A's rows exactly as they were; the prefs
 * show each person only their own devices and switches.
 */
let db: TestDatabase;
let target: AccountsApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const KEYS = { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' };

/** A's device, carrying A's marker in its label and URL; B's likewise. */
async function deviceOf(person: Person, marker: string): Promise<string> {
  const res = await person.browser.send('/api/notifications/endpoints', {
    json: {
      endpoint: `https://push.example.net/push/${marker.toLowerCase()}`,
      keys: KEYS,
      platform: 'android',
      deviceLabel: `Android · Chrome ${marker}`,
    },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

async function endpointsOf(userId: string): Promise<string> {
  const { rows } = await db.owner.query(
    `select * from core.notification_endpoint where user_id = $1 order by id`,
    [userId],
  );
  return JSON.stringify(rows);
}

async function switchesOf(userId: string): Promise<string> {
  const { rows } = await db.owner.query(
    `select enabled, email_enabled from core.reminder_state where user_id = $1`,
    [userId],
  );
  return JSON.stringify(rows);
}

async function pushEvents(userId: string): Promise<string> {
  await target.settle();
  const { rows } = await db.owner.query(
    `select name, props from analytics.event
     where user_id = $1 and name in ('push_enabled', 'push_disabled') order by id`,
    [userId],
  );
  return JSON.stringify(rows);
}

describe('the notifications routes as B, with A’s ids', () => {
  it('PUT and DELETE answer NOT_FOUND and leave A’s row exactly as it was', async () => {
    const a = await signUpPerson(target, db, 'niso-a@example.com');
    const b = await signUpPerson(target, db, 'niso-b@example.com');
    const aId = await deviceOf(a, MARKER_A);
    await deviceOf(b, MARKER_B);
    const beforeA = await endpointsOf(a.userId);
    const beforeB = await endpointsOf(b.userId);
    const eventsA = await pushEvents(a.userId);

    const put = await b.browser.send(`/api/notifications/endpoints/${aId}`, {
      method: 'PUT',
      json: { endpoint: `https://push.example.net/push/${MARKER_B.toLowerCase()}`, keys: KEYS },
    });
    expect(put.status).toBe(404);
    const putText = await put.text();
    expect(JSON.parse(putText)).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(putText).not.toContain(MARKER_A);

    const del = await b.browser.send(`/api/notifications/endpoints/${aId}?by=user`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(404);
    expect(await del.text()).not.toContain(MARKER_A);

    await target.settle();
    expect(await endpointsOf(a.userId)).toBe(beforeA);
    expect(await endpointsOf(b.userId)).toBe(beforeB);
    expect(await pushEvents(a.userId)).toBe(eventsA);
    expect(await pushEvents(b.userId)).not.toContain(MARKER_A);
  });

  it('shows each person only their own devices, and patches only their own switches', async () => {
    const a = await signUpPerson(target, db, 'niso-c@example.com');
    const b = await signUpPerson(target, db, 'niso-d@example.com');
    await deviceOf(a, MARKER_A);
    await deviceOf(b, MARKER_B);

    const prefs = await b.browser.send('/api/notifications/prefs');
    expect(prefs.status).toBe(200);
    const body = await prefs.text();
    expect(body).toContain(MARKER_B);
    expect(body).not.toContain(MARKER_A);
    expect(body).not.toContain(a.userId);

    const switchesA = await switchesOf(a.userId);
    const patch = await b.browser.send('/api/notifications/prefs', {
      method: 'PATCH',
      json: { reminders: false, email: false },
    });
    expect(patch.status).toBe(200);
    expect(await switchesOf(a.userId)).toBe(switchesA);
    expect(await switchesOf(b.userId)).toContain('"enabled":false');
  });

  it('POST makes a row for the session’s person only', async () => {
    const a = await signUpPerson(target, db, 'niso-e@example.com');
    const b = await signUpPerson(target, db, 'niso-f@example.com');
    const beforeA = await endpointsOf(a.userId);
    const res = await b.browser.send('/api/notifications/endpoints', {
      json: {
        endpoint: `https://push.example.net/push/${MARKER_B.toLowerCase()}-post`,
        keys: KEYS,
        platform: 'desktop',
        deviceLabel: `Desktop · Chrome ${MARKER_B}`,
      },
    });
    expect(res.status).toBe(200);
    await target.settle();
    expect(await endpointsOf(a.userId)).toBe(beforeA);
    const rows = JSON.parse(await endpointsOf(b.userId)) as { user_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.user_id).toBe(b.userId);
  });
});
