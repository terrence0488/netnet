import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activePushTargets } from '../../src/db/endpoints';
import type { PushChannel, PushEndpoint, RenderedPush } from '../../src/notify/channel';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { CRON_SECRET, ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';
import { signUpPerson, type Person } from '../support/oauth-client';

/**
 * The claim's somewhere-to-send (architecture §7.10 step 1, PRD J12): an active device claims a
 * person even with email reminders off or an unverified address; a revoked device claims no one.
 * The channel is a fake answering per device; the endpoints are the real rows.
 */
let db: TestDatabase;
let target: AccountsApp;
let serial = 0;

/** Per-device answers, in send order; what each send carried. */
let answers: boolean[];
const sent: { to: PushEndpoint; rendered: RenderedPush }[] = [];

const fakePush: PushChannel = {
  id: 'webpush',
  send: (to, rendered) => {
    sent.push({ to, rendered });
    return Promise.resolve({ ok: answers[sent.length - 1] ?? false });
  },
};

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db, {
    push: {
      endpoints: async (userId) =>
        (await activePushTargets(db.appDb, userId, target.clock.now)).map((row) => ({
          id: row.id,
          userId: row.userId,
          platform: row.platform,
          subscription: { endpoint: row.endpoint, ...row.keys },
          ttlSeconds: row.ttlSeconds,
        })),
      channel: fakePush,
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

function newPerson(options: { verified?: boolean } = {}): Promise<Person> {
  serial += 1;
  return signUpPerson(target, db, `claim-person-${serial}@example.com`, options);
}

const KEYS = { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' };

async function subscribe(person: Person, n: number): Promise<string> {
  const res = await person.browser.send('/api/notifications/endpoints', {
    json: {
      endpoint: `https://push.example.net/push/claim-${serial}-${n}`,
      keys: KEYS,
      platform: 'android',
      deviceLabel: 'Android · Chrome',
    },
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

/** Due on the run's day, in the daytime (Asia/Singapore 18:00 at 10:00 UTC). */
async function makeDue(userId: string): Promise<void> {
  // Setup requests touch the clock after their responses; settle them before rewinding it.
  await target.settle();
  await db.owner.query(
    `update core.reminder_state set last_checked_on = '2026-07-02', next_due_on = '2026-08-01'
     where user_id = $1`,
    [userId],
  );
}

async function cron(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await target.app.request(`${ORIGIN}/api/cron/reminders`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  await target.settle();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function stateOf(userId: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    `select enabled, email_enabled, next_due_on::text, sent_since_check, last_sent_at, last_channel
     from core.reminder_state where user_id = $1`,
    [userId],
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

function remindersTo(person: Person) {
  return target.emails.captured.filter(
    (e) => e.to === person.email && e.rendered.subject === 'Your net worth is due for an update.',
  );
}

describe('the claim’s device disjunct', () => {
  it('claims a push-only person and pushes, with no email', async () => {
    const person = await newPerson();
    await subscribe(person, 1);
    await subscribe(person, 2);
    const off = await person.browser.send('/api/notifications/prefs', {
      method: 'PATCH',
      json: { email: false },
    });
    expect(off.status).toBe(200);
    await makeDue(person.userId);
    answers = [true, true];

    const run = await cron();
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ reminders: { push: 1, email: 0, released: 0 } });
    expect(sent).toHaveLength(2);
    expect(sent[0]?.rendered).toMatchObject({
      title: 'NetNet',
      body: 'Your net worth is due for an update.',
    });
    expect(sent[0]?.rendered.url).toMatch(/^https?:\/\/[^/]+\/app\/\?r=r1\./);
    expect(sent[0]?.to.ttlSeconds).toBe(3 * 3600);
    expect(remindersTo(person)).toHaveLength(0);
    expect(await stateOf(person.userId)).toMatchObject({
      sent_since_check: 1,
      last_channel: 'push',
    });
    expect(await events(person.userId, 'reminder_sent')).toEqual([
      { name: 'reminder_sent', props: { channel: 'push' } },
    ]);
  });

  it('claims an unverified address with a device: push needs no verified email', async () => {
    const person = await newPerson({ verified: false });
    await subscribe(person, 1);
    await makeDue(person.userId);
    answers = [true];

    const run = await cron();
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ reminders: { push: 1, email: 0, released: 0 } });
    expect(sent).toHaveLength(1);
    expect(await events(person.userId, 'reminder_sent')).toEqual([
      { name: 'reminder_sent', props: { channel: 'push' } },
    ]);
  });

  it('claims no one with email off and no active device', async () => {
    const emailOff = await newPerson();
    const revoked = await newPerson();
    const off = await emailOff.browser.send('/api/notifications/prefs', {
      method: 'PATCH',
      json: { email: false },
    });
    expect(off.status).toBe(200);
    const id = await subscribe(revoked, 1);
    const gone = await revoked.browser.send(`/api/notifications/endpoints/${id}?by=user`, {
      method: 'DELETE',
    });
    expect(gone.status).toBe(204);
    const revokedOff = await revoked.browser.send('/api/notifications/prefs', {
      method: 'PATCH',
      json: { email: false },
    });
    expect(revokedOff.status).toBe(200);
    await makeDue(emailOff.userId);
    await makeDue(revoked.userId);
    answers = [true];

    const run = await cron();
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ reminders: { push: 0, email: 0, released: 0 } });
    expect(sent).toHaveLength(0);
    for (const person of [emailOff, revoked]) {
      expect(await stateOf(person.userId)).toMatchObject({ sent_since_check: 0 });
      expect(await events(person.userId, 'reminder_sent')).toEqual([]);
    }
  });

  it('falls back to email when every push failed', async () => {
    const person = await newPerson();
    await subscribe(person, 1);
    await subscribe(person, 2);
    await makeDue(person.userId);
    answers = [false, false];

    const run = await cron();
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ reminders: { push: 0, email: 1, released: 0 } });
    expect(sent).toHaveLength(2);
    expect(remindersTo(person)).toHaveLength(1);
    expect(await stateOf(person.userId)).toMatchObject({ last_channel: 'email' });
    expect(await events(person.userId, 'reminder_sent')).toEqual([
      { name: 'reminder_sent', props: { channel: 'email' } },
    ]);
  });
});
