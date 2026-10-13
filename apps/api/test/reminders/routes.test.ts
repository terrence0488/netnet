import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signReminderToken } from '../../src/notify/links';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { LINK_SECRET, ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';
import { signUpPerson, type Person } from '../support/oauth-client';

/**
 * The reminder's signed links (PRD J12, architecture §7.2): `POST /api/reminders/opened` fires
 * `reminder_opened {channel}` for the first open of each reminder only, and `POST
 * /api/reminders/unsubscribe` turns email reminders off — through the footer's page and as the
 * `List-Unsubscribe-Post` target. Neither needs a session: the token is the authority, and it
 * signs no one in and counts as no check. A token that does not verify is NOT_FOUND; only a
 * missing one is a validation failure.
 */
let db: TestDatabase;
let target: AccountsApp;
let serial = 0;

const MINUTE = 60_000;

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
  return signUpPerson(target, db, `link-person-${serial}@example.com`);
}

/** A token for `person`'s reminder sent `minutesAgo` minutes ago, by `channel`. */
function tokenFor(person: Person, minutesAgo: number, channel: 'push' | 'email' = 'email'): string {
  const sentAt = new Date(target.clock.now.getTime() - minutesAgo * MINUTE).toISOString();
  const token = signReminderToken(LINK_SECRET, { userId: person.userId, channel, sentAt });
  if (token === null) throw new Error('the test secret signs nothing');
  return token;
}

async function openedOf(userId: string) {
  await target.settle();
  const { rows } = await db.owner.query<{ name: string; props: Record<string, unknown> }>(
    `select name, props from analytics.event where user_id = $1 and name = 'reminder_opened'
      order by id`,
    [userId],
  );
  return rows;
}

async function stateOf(userId: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    `select enabled, email_enabled, last_checked_on::text, next_due_on::text, sent_since_check,
       last_sent_at, last_channel, last_opened_at
     from core.reminder_state where user_id = $1`,
    [userId],
  );
  return rows[0];
}

async function setSentAt(userId: string, sentAt: Date): Promise<void> {
  await db.owner.query(`update core.reminder_state set last_sent_at = $2 where user_id = $1`, [
    userId,
    sentAt.toISOString(),
  ]);
}

describe('POST /api/reminders/opened', () => {
  it('fires reminder_opened for the first open of each reminder, in whichever order', async () => {
    const person = await newPerson();
    const first = tokenFor(person, 40 * 24 * 60);
    const second = tokenFor(person, 10 * 24 * 60);
    await setSentAt(person.userId, new Date(target.clock.now.getTime() - 10 * 24 * 60 * MINUTE));

    // The newer reminder first: its open fires; the older one's late open does not.
    for (const token of [second, second, first]) {
      const res = await target.app.request(`${ORIGIN}/api/reminders/opened`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      expect(res.status).toBe(204);
    }
    expect(await openedOf(person.userId)).toEqual([
      { name: 'reminder_opened', props: { channel: 'email' } },
    ]);

    // The other way round: each reminder's first open fires exactly once.
    const other = await newPerson();
    const older = tokenFor(other, 40 * 24 * 60);
    const newer = tokenFor(other, 10 * 24 * 60);
    for (const token of [older, newer, older, newer]) {
      const res = await target.app.request(`${ORIGIN}/api/reminders/opened`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      expect(res.status).toBe(204);
    }
    expect(await openedOf(other.userId)).toEqual([
      { name: 'reminder_opened', props: { channel: 'email' } },
      { name: 'reminder_opened', props: { channel: 'email' } },
    ]);
  });

  it('carries the channel the reminder went by', async () => {
    const person = await newPerson();
    const res = await target.app.request(`${ORIGIN}/api/reminders/opened`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenFor(person, 60, 'push') }),
    });
    expect(res.status).toBe(204);
    expect(await openedOf(person.userId)).toEqual([
      { name: 'reminder_opened', props: { channel: 'push' } },
    ]);
  });

  it('answers NOT_FOUND for a token that does not verify, and changes nothing', async () => {
    const person = await newPerson();
    const before = await stateOf(person.userId);
    const [version, body, sig] = tokenFor(person, 60).split('.') as [string, string, string];
    const forged = signReminderToken('another-secret-0123456789abcdef', {
      userId: person.userId,
      channel: 'email',
      sentAt: new Date(target.clock.now.getTime() - 60 * MINUTE).toISOString(),
    });
    for (const token of [
      'not-a-token',
      `${version}.${body}.AAAA`,
      `${version}.${body}.${sig.slice(0, -2)}AA`,
      forged ?? '',
      tokenFor({ ...person, userId: 'usr_01K1G4KX00ZZZZZZZZZZZZZZZZ' }, 60),
    ]) {
      const res = await target.app.request(`${ORIGIN}/api/reminders/opened`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      expect(res.status).toBe(404);
      expect(await res.text()).toContain('NOT_FOUND');
    }
    // And an expired one: sent 61 days ago.
    const old = await target.app.request(`${ORIGIN}/api/reminders/opened`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenFor(person, 61 * 24 * 60) }),
    });
    expect(old.status).toBe(404);
    expect(await stateOf(person.userId)).toEqual(before);
    expect(await openedOf(person.userId)).toEqual([]);
  });

  it('answers VALIDATION_FAILED only when the token is missing or malformed', async () => {
    for (const body of [
      {},
      { token: '' },
      { token: 'x'.repeat(1025) },
      { token: 'r1.a.b', extra: 1 },
    ]) {
      const res = await target.app.request(`${ORIGIN}/api/reminders/opened`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('VALIDATION_FAILED');
    }
  });
});

describe('POST /api/reminders/unsubscribe', () => {
  it('turns email reminders off, and stays off when posted again', async () => {
    const person = await newPerson();
    for (const attempt of [1, 2]) {
      const res = await target.app.request(`${ORIGIN}/api/reminders/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenFor(person, 60) }),
      });
      expect(res.status, `attempt ${attempt}`).toBe(204);
    }
    expect(await stateOf(person.userId)).toMatchObject({ email_enabled: false, enabled: true });
  });

  it('is the one-click target: the token rides the query, the body is no JSON object', async () => {
    const person = await newPerson();
    const res = await target.app.request(
      `${ORIGIN}/api/reminders/unsubscribe?token=${encodeURIComponent(tokenFor(person, 60))}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      },
    );
    expect(res.status).toBe(204);
    expect(await stateOf(person.userId)).toMatchObject({ email_enabled: false });
  });

  it('answers NOT_FOUND for a token that does not verify, and changes nothing', async () => {
    const person = await newPerson();
    const before = await stateOf(person.userId);
    const res = await target.app.request(`${ORIGIN}/api/reminders/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'r1.forged.forged' }),
    });
    expect(res.status).toBe(404);
    expect(await stateOf(person.userId)).toEqual(before);
  });

  it('answers VALIDATION_FAILED only when the token is missing or malformed', async () => {
    const res = await target.app.request(`${ORIGIN}/api/reminders/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('the signed-link routes’ isolation', () => {
  it('needs no session, ignores any session, and counts as no check', async () => {
    const a = await newPerson();
    const b = await newPerson();
    const beforeA = await stateOf(a.userId);
    const beforeB = await stateOf(b.userId);
    // B, signed in, posts A's token: the token is the authority, like a reset link.
    const res = await b.browser.send('/api/reminders/unsubscribe', {
      json: { token: tokenFor(a, 60) },
    });
    expect(res.status).toBe(204);
    expect(await stateOf(a.userId)).toMatchObject({ email_enabled: false });
    // Nothing else of A's moved — no check — and nothing of B's at all.
    expect(await stateOf(a.userId)).toMatchObject({
      last_checked_on: beforeA?.last_checked_on,
      next_due_on: beforeA?.next_due_on,
      sent_since_check: beforeA?.sent_since_check,
    });
    expect(await stateOf(b.userId)).toEqual(beforeB);
  });

  it('carries no user data in its answers, and refuses the wrong method', async () => {
    const person = await newPerson();
    const bodies: string[] = [];
    for (const path of ['/api/reminders/opened', '/api/reminders/unsubscribe']) {
      const bad = await target.app.request(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'r1.forged.forged' }),
      });
      bodies.push(await bad.text());
      const missing = await target.app.request(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      bodies.push(await missing.text());
      expect((await target.app.request(`${ORIGIN}${path}`)).status).toBe(404);
    }
    for (const body of bodies) {
      expect(body).not.toContain(person.userId);
      expect(body).not.toContain(person.email);
    }
  });

  it('rate-limits guessing: the 61st call in a minute is refused', async () => {
    const person = await newPerson();
    let refused = 0;
    for (let n = 0; n < 61; n += 1) {
      const res = await person.browser.send('/api/reminders/opened', {
        json: { token: 'r1.guess.guess' },
      });
      if (res.status === 429) refused += 1;
      else expect(res.status).toBe(404);
    }
    expect(refused).toBe(1);
  });
});
