import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedLedger } from '../../src/ledger/seed';
import { Browser, accountsApp, type AccountsApp } from '../support/accounts-app';
import {
  CONNECTION_A,
  CONNECTION_B,
  MARKER_A,
  MARKER_B,
  createTestDatabase,
  type TestDatabase,
} from './harness';

/**
 * The isolation cases for `/api/me` (architecture §8, CONVENTIONS §9): it has no ids in its path,
 * so B's attempts are to name A in the query or the body. Each answers with B's own profile, or a
 * validation error, never anything of A's, and A's profile never changes.
 */
let db: TestDatabase;
let target: AccountsApp;
let a: { browser: Browser; userId: string; email: string };
let b: { browser: Browser; userId: string; email: string };

async function person(email: string, timeZone: string) {
  const browser = new Browser(target);
  expect((await browser.signUp(email, 'correct horse', { timeZone })).status).toBe(200);
  await target.settle();
  const { rows } = await db.owner.query<{ id: string }>(
    'select id from core.user where email = $1',
    [email],
  );
  const userId = rows[0]?.id ?? '';
  return { browser, userId, email };
}

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
  a = await person(`${MARKER_A.toLowerCase()}@example.com`, 'Asia/Singapore');
  b = await person(`${MARKER_B.toLowerCase()}@example.com`, 'Europe/London');
  await seedLedger(db.withUser, {
    userId: a.userId,
    baseCurrency: 'USD',
    connectionId: CONNECTION_A,
    marker: MARKER_A,
  });
  await seedLedger(db.withUser, {
    userId: b.userId,
    baseCurrency: 'EUR',
    connectionId: CONNECTION_B,
    marker: MARKER_B,
  });
  expect(
    (await a.browser.send('/api/me', { method: 'PATCH', json: { country: 'SG' } })).status,
  ).toBe(200);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Fails if `body` holds anything of A's. */
function expectNothingOfA(body: string): void {
  expect(body).not.toContain(a.userId);
  expect(body.toLowerCase()).not.toContain(MARKER_A.toLowerCase());
  expect(body).not.toContain('Asia/Singapore');
  expect(body).not.toContain('USD');
}

async function profileOfA() {
  const { rows } = await db.owner.query('select * from core.profile where user_id = $1', [
    a.userId,
  ]);
  return rows[0] as unknown;
}

describe('/api/me as user B', () => {
  it('GET answers with B’s own profile, whatever names A in the query', async () => {
    for (const path of ['/api/me', `/api/me?userId=${a.userId}`, `/api/me?user_id=${a.userId}`]) {
      const res = await b.browser.send(path);
      expect(res.status).toBe(200);
      const body = await res.text();
      expectNothingOfA(body);
      expect(JSON.parse(body)).toStrictEqual({
        email: b.email,
        emailVerified: false,
        country: null,
        baseCurrency: 'EUR',
        segment: 'unknown',
        timeZone: 'Europe/London',
        onboardingState: 'country',
      });
    }
  });

  it('PATCH changes only B’s profile, and refuses a body that names A', async () => {
    const before = await profileOfA();
    const named = await b.browser.send('/api/me', {
      method: 'PATCH',
      json: { userId: a.userId, country: 'FR' },
    });
    expect(named.status).toBe(400);
    const namedBody = await named.text();
    expectNothingOfA(namedBody);
    expect(JSON.parse(namedBody)).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fields: { userId: expect.any(String) as string } },
    });

    const own = await b.browser.send(`/api/me?userId=${a.userId}`, {
      method: 'PATCH',
      json: { country: 'FR', segment: 'established' },
    });
    expect(own.status).toBe(200);
    expectNothingOfA(await own.text());
    expect(await profileOfA()).toStrictEqual(before);
  });

  it('A’s session still sees only A', async () => {
    const res = await a.browser.send('/api/me');
    const body = await res.text();
    expect(body).not.toContain(b.email);
    expect(JSON.parse(body)).toMatchObject({
      country: 'SG',
      baseCurrency: 'USD',
      segment: 'unknown',
    });
  });
});
