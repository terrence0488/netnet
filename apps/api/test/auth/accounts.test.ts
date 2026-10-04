import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SIGN_INS_PER_MINUTE, SIGN_UPS_PER_MINUTE } from '../../src/auth/routes';
import { isId } from '../../src/lib/ids';
import { seedLedger } from '../../src/ledger/seed';
import type { CapturedEmail } from '../../src/notify/email';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { Browser, ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';

/**
 * Accounts against Postgres, as `netnet_app` (PRD J1, architecture §7.2, §8): sign-up asks for an
 * email and a password and nothing else, signs the person in at once and sends the verification
 * email through notify(); sign-in, sign-out and the password reset; the session cookie; the rate
 * limits on a fake clock; the Origin check; and the profile.
 */
let db: TestDatabase;
let target: AccountsApp;
let count = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  target.clock.now = FIXED_NOW;
  await db.owner.query('truncate core.rate_limit');
});

/** A new fictional address for each test. */
function newEmail(): string {
  count += 1;
  return `person-${count}@example.com`;
}

const PASSWORD = 'correct horse';

async function signedUp(email = newEmail(), extra: Record<string, unknown> = {}) {
  const browser = new Browser(target);
  const res = await browser.signUp(email, PASSWORD, extra);
  expect(res.status).toBe(200);
  await target.settle();
  const userId = await userIdOf(email);
  return { browser, email, userId };
}

async function userIdOf(email: string): Promise<string> {
  const { rows } = await db.owner.query<{ id: string }>(
    'select id from core.user where email = $1',
    [email],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no account for ${email}`);
  return id;
}

function emailsTo(address: string): CapturedEmail[] {
  return target.emails.captured.filter((m) => m.to === address);
}

/** The link in an email's text, as a path on our origin. */
function linkIn(message: CapturedEmail | undefined): string {
  const url = /https?:\/\/\S+/.exec(message?.rendered.text ?? '')?.[0];
  if (!url?.startsWith(`${ORIGIN}/`)) throw new Error('no link to NetNet in the email');
  return url.slice(ORIGIN.length);
}

interface ProfileRow {
  country: string | null;
  time_zone: string;
  segment: string;
  onboarding_state: string;
}

async function profileOf(userId: string): Promise<ProfileRow | undefined> {
  const { rows } = await db.owner.query<ProfileRow>(
    'select country, time_zone, segment, onboarding_state from core.profile where user_id = $1',
    [userId],
  );
  return rows[0];
}

describe('sign-up', () => {
  it('asks for an email and a password only, and signs the person in at once', async () => {
    const browser = new Browser(target);
    const res = await browser.signUp('Mixed.Case@Example.com', PASSWORD, {
      timeZone: 'Asia/Singapore',
    });
    expect(res.status).toBe(200);
    const [cookie, ...others] = res.headers.getSetCookie();
    expect(others).toEqual([]);
    expect(cookie).toMatch(/^__Secure-netnet\.session_token=[^;]+;/);
    const attributes = cookie?.split(/;\s*/).slice(1) ?? [];
    expect(attributes).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']),
    );
    await target.settle();

    const { rows: users } = await db.owner.query(
      'select id, name, email, email_verified, image from core.user where email = $1',
      ['mixed.case@example.com'],
    );
    expect(users).toHaveLength(1);
    const [user] = users as [{ id: string }];
    expect(isId(user.id, 'usr')).toBe(true);
    expect(user).toMatchObject({ name: '', email_verified: false, image: null });

    const { rows: accounts } = await db.owner.query<{ provider_id: string; password: string }>(
      'select provider_id, password from core.account where user_id = $1',
      [user.id],
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ provider_id: 'credential' });
    expect(accounts[0]?.password).not.toContain(PASSWORD);

    const { rows: sessions } = await db.owner.query(
      'select ip_address, user_agent, expires_at from core.session where user_id = $1',
      [user.id],
    );
    expect(sessions).toEqual([
      { ip_address: null, user_agent: null, expires_at: expect.any(Date) as Date },
    ]);

    expect(await profileOf(user.id)).toStrictEqual({
      country: null,
      time_zone: 'Asia/Singapore',
      segment: 'unknown',
      onboarding_state: 'country',
    });

    const me = await browser.send('/api/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toStrictEqual({
      email: 'mixed.case@example.com',
      emailVerified: false,
      country: null,
      baseCurrency: null,
      segment: 'unknown',
      timeZone: 'Asia/Singapore',
      onboardingState: 'country',
    });
  });

  it('records UTC when the browser gives no time zone, or one that is not', async () => {
    const none = await signedUp();
    const bogus = await signedUp(newEmail(), { timeZone: 'Mars/Olympus_Mons' });
    const lowercase = await signedUp(newEmail(), { timeZone: 'europe/paris' });
    expect((await profileOf(none.userId))?.time_zone).toBe('UTC');
    expect((await profileOf(bogus.userId))?.time_zone).toBe('UTC');
    expect((await profileOf(lowercase.userId))?.time_zone).toBe('Europe/Paris');
  });

  it('keeps no name or picture, whatever the client sends', async () => {
    const { userId } = await signedUp(newEmail(), {
      name: 'Fictional Person',
      image: 'https://example.com/face.png',
    });
    const { rows } = await db.owner.query('select name, image from core.user where id = $1', [
      userId,
    ]);
    expect(rows).toEqual([{ name: '', image: null }]);
  });

  it('takes any password of 8 characters or more, with no composition rules', async () => {
    const browser = new Browser(target);
    expect((await browser.signUp(newEmail(), 'aaaaaaaa')).status).toBe(200);
    const short = newEmail();
    const res = await new Browser(target).signUp(short, 'aaaaaaa');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
    const { rowCount } = await db.owner.query('select 1 from core.user where email = $1', [short]);
    expect(rowCount).toBe(0);
  });

  it('sends the verification email through notify(), and its link verifies the address', async () => {
    const { browser, email, userId } = await signedUp();
    const sent = emailsTo(email);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.rendered.subject).toBe('Verify your email for NetNet');

    const res = await new Browser(target).send(linkIn(sent[0]));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/app/verify');
    const { rows } = await db.owner.query('select email_verified from core.user where id = $1', [
      userId,
    ]);
    expect(rows).toEqual([{ email_verified: true }]);
    expect(await (await browser.send('/api/me')).json()).toMatchObject({ emailVerified: true });
  });

  it('sends the verification email again when asked', async () => {
    const { browser, email } = await signedUp();
    const res = await browser.send('/api/auth/send-verification-email', { json: { email } });
    expect(res.status).toBe(200);
    await target.settle();
    expect(emailsTo(email)).toHaveLength(2);
  });

  it('fires account_created with method email and segment unknown', async () => {
    const { userId } = await signedUp();
    const { rows } = await db.owner.query(
      'select name, props, segment, app_version from analytics.event where user_id = $1',
      [userId],
    );
    expect(rows).toStrictEqual([
      {
        name: 'account_created',
        props: { method: 'email' },
        segment: 'unknown',
        app_version: 'test123',
      },
    ]);
  });

  it('refuses a second account for the same email, and keeps the first', async () => {
    const { email, userId } = await signedUp();
    const res = await new Browser(target).signUp(email, 'another password');
    expect(res.status).toBe(422);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await userIdOf(email)).toBe(userId);
  });
});

describe('sign-in and sign-out', () => {
  it('signs in with the right password only, and answers an unknown email the same way', async () => {
    const { email } = await signedUp();
    const browser = new Browser(target);
    const wrong = await browser.signIn(email, 'wrong password');
    const unknown = await browser.signIn(newEmail(), 'wrong password');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toStrictEqual(await unknown.json());
    expect(browser.cookies.size).toBe(0);

    const right = await browser.signIn(email.toUpperCase(), PASSWORD);
    expect(right.status).toBe(200);
    expect((await browser.send('/api/me')).status).toBe(200);
  });

  it('lets an unverified person use the app: verification only gates connecting an agent', async () => {
    const { browser } = await signedUp();
    expect(
      (await browser.send('/api/me', { method: 'PATCH', json: { country: 'SG' } })).status,
    ).toBe(200);
    expect(await (await browser.send('/api/me')).json()).toMatchObject({
      emailVerified: false,
      country: 'SG',
    });
  });

  it('signs out: the session ends and the cookie is cleared', async () => {
    const { browser, userId } = await signedUp();
    const res = await browser.send('/api/auth/sign-out', { method: 'POST', json: {} });
    expect(res.status).toBe(200);
    expect(browser.cookies.size).toBe(0);
    const { rowCount } = await db.owner.query('select 1 from core.session where user_id = $1', [
      userId,
    ]);
    expect(rowCount).toBe(0);
    expect((await browser.send('/api/me')).status).toBe(401);
  });

  it('accepts no session cookie it did not sign', async () => {
    const { browser } = await signedUp();
    for (const [name, value] of browser.cookies) {
      browser.cookies.set(name, value.replace(/^.{4}/, 'AAAA'));
    }
    const res = await browser.send('/api/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});

describe('password reset', () => {
  it('answers the same whether or not the account exists, and emails only a real one', async () => {
    const { email } = await signedUp();
    const nobody = newEmail();
    const browser = new Browser(target);
    const real = await browser.send('/api/auth/request-password-reset', { json: { email } });
    const unknown = await browser.send('/api/auth/request-password-reset', {
      json: { email: nobody },
    });
    expect(real.status).toBe(200);
    expect(unknown.status).toBe(real.status);
    expect(await unknown.json()).toStrictEqual(await real.json());
    await target.settle();
    const resets = emailsTo(email).filter(
      (m) => m.rendered.subject === 'Reset your NetNet password',
    );
    expect(resets).toHaveLength(1);
    expect(emailsTo(nobody)).toEqual([]);
  });

  it('leads from the email to the web app with a token that sets a new password once', async () => {
    const { browser: signedIn, email } = await signedUp();
    const browser = new Browser(target);
    await browser.send('/api/auth/request-password-reset', { json: { email } });
    await target.settle();
    const reset = emailsTo(email).find((m) => m.rendered.subject === 'Reset your NetNet password');

    const landing = await browser.send(linkIn(reset));
    expect(landing.status).toBe(302);
    const location = new URL(landing.headers.get('Location') ?? '', ORIGIN);
    expect(location.pathname).toBe('/app/reset');
    const token = location.searchParams.get('token') ?? '';
    expect(token).not.toBe('');

    expect(
      (await browser.send('/api/auth/reset-password', { json: { token, newPassword: 'short' } }))
        .status,
    ).toBe(400);
    const done = await browser.send('/api/auth/reset-password', {
      json: { token, newPassword: 'a new passphrase' },
    });
    expect(done.status).toBe(200);
    const again = await browser.send('/api/auth/reset-password', {
      json: { token, newPassword: 'yet another one' },
    });
    expect(again.status).toBe(400);

    // Every session ends with the reset; only the new password signs in.
    expect((await signedIn.send('/api/me')).status).toBe(401);
    expect((await browser.signIn(email, PASSWORD)).status).toBe(401);
    expect((await browser.signIn(email, 'a new passphrase')).status).toBe(200);
  });
});

describe('rate limits (core.rate_limit, fake clock)', () => {
  async function refusal(res: Response) {
    expect(res.status).toBe(429);
    return (await res.json()) as { error: { code: string; retry_after_s: number } };
  }

  it(`allows ${SIGN_UPS_PER_MINUTE} sign-ups a minute from one IP address`, async () => {
    const browser = new Browser(target, '198.51.100.1');
    for (let i = 0; i < SIGN_UPS_PER_MINUTE; i += 1) {
      expect((await browser.signUp(newEmail(), PASSWORD)).status).toBe(200);
    }
    target.clock.now = new Date(FIXED_NOW.getTime() + 20_000);
    const refused = newEmail();
    expect(await refusal(await browser.signUp(refused, PASSWORD))).toMatchObject({
      error: { code: 'RATE_LIMITED', retry_after_s: 40 },
    });
    const { rowCount } = await db.owner.query('select 1 from core.user where email = $1', [
      refused,
    ]);
    expect(rowCount).toBe(0);
    expect((await new Browser(target, '198.51.100.2').signUp(newEmail(), PASSWORD)).status).toBe(
      200,
    );
    target.clock.now = new Date(FIXED_NOW.getTime() + 60_000);
    expect((await browser.signUp(newEmail(), PASSWORD)).status).toBe(200);
    await target.settle();
  });

  it(`allows ${SIGN_INS_PER_MINUTE} sign-ins a minute per IP address and email`, async () => {
    const { email } = await signedUp();
    const other = await signedUp();
    const browser = new Browser(target, '198.51.100.3');
    for (let i = 0; i < SIGN_INS_PER_MINUTE; i += 1) {
      expect((await browser.signIn(email, 'wrong password')).status).toBe(401);
    }
    expect(await refusal(await browser.signIn(email, PASSWORD))).toMatchObject({
      error: { code: 'RATE_LIMITED', retry_after_s: 60 },
    });
    expect((await browser.signIn(other.email, PASSWORD)).status).toBe(200);
    expect((await new Browser(target, '198.51.100.4').signIn(email, PASSWORD)).status).toBe(200);
    target.clock.now = new Date(FIXED_NOW.getTime() + 60_000);
    expect((await browser.signIn(email, PASSWORD)).status).toBe(200);
  });

  it('limits reset and verification emails per IP address', async () => {
    const { email } = await signedUp();
    const browser = new Browser(target, '198.51.100.5');
    for (const path of ['/api/auth/request-password-reset', '/api/auth/send-verification-email']) {
      for (let i = 0; i < 5; i += 1) {
        expect((await browser.send(path, { json: { email } })).status).toBe(200);
      }
      await refusal(await browser.send(path, { json: { email } }));
    }
    await target.settle();
  });
});

describe('the Origin check on state-changing requests', () => {
  const EVIL = 'https://evil.example';

  it('refuses a sign-in, a profile change or an event sent from another site', async () => {
    const { browser, email, userId } = await signedUp();
    const signIn = await new Browser(target).send('/api/auth/sign-in/email', {
      json: { email, password: PASSWORD },
      origin: EVIL,
    });
    expect(signIn.status).toBe(401);
    expect(await signIn.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(signIn.headers.getSetCookie()).toEqual([]);

    const patch = await browser.send('/api/me', {
      method: 'PATCH',
      json: { country: 'FR' },
      origin: EVIL,
    });
    expect(patch.status).toBe(401);
    expect((await profileOf(userId))?.country).toBeNull();

    const event = await browser.send('/api/events', {
      json: { name: 'session_started', props: {} },
      origin: EVIL,
    });
    expect(event.status).toBe(401);
    expect(
      (await browser.send('/api/events', { json: { name: 'session_started', props: {} } })).status,
    ).toBe(204);
    await target.settle();
  });

  it('refuses one the browser says came from another site, even without Origin', async () => {
    const { browser } = await signedUp();
    const res = await browser.send('/api/auth/sign-out', {
      json: {},
      origin: null,
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    expect(res.status).toBe(401);
    expect((await browser.send('/api/me')).status).toBe(200);
  });

  it('lets through a request with neither header (a server, not a browser) and every read', async () => {
    const { browser } = await signedUp();
    expect(
      (
        await new Browser(target).send('/api/events', {
          json: { name: 'signup_started', props: { method: 'email' } },
          origin: null,
        })
      ).status,
    ).toBe(204);
    expect((await browser.send('/api/me', { origin: EVIL })).status).toBe(200);
    await target.settle();
  });
});

describe('GET /api/me and PATCH /api/me', () => {
  it('needs a session', async () => {
    const browser = new Browser(target);
    for (const res of [
      await browser.send('/api/me'),
      await browser.send('/api/me', { method: 'PATCH', json: { country: 'SG' } }),
    ]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toStrictEqual({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Sign in first: this needs a signed-in session.',
        },
      });
    }
  });

  it('records a country on the list, with a pack or without', async () => {
    const { browser, userId } = await signedUp();
    const patch = (json: unknown) => browser.send('/api/me', { method: 'PATCH', json });
    const withPack = await patch({ country: 'MY' });
    expect(withPack.status).toBe(200);
    expect(await withPack.json()).toMatchObject({ country: 'MY' });
    expect(await (await patch({ country: 'FR' })).json()).toMatchObject({ country: 'FR' });
    expect((await profileOf(userId))?.country).toBe('FR');

    for (const country of ['ZZ', 'fr', 'FRA', 42, null]) {
      const res = await patch({ country });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: { code: 'VALIDATION_FAILED', fields: { country: expect.any(String) as string } },
      });
    }
    expect((await profileOf(userId))?.country).toBe('FR');
  });

  it('sets the segment once, and refuses to change it afterwards', async () => {
    const { browser, userId } = await signedUp();
    const patch = (json: unknown) => browser.send('/api/me', { method: 'PATCH', json });
    expect((await patch({ segment: 'unknown' })).status).toBe(200);
    expect(await (await patch({ segment: 'accumulating' })).json()).toMatchObject({
      segment: 'accumulating',
    });
    expect((await patch({ segment: 'accumulating', onboardingState: 'done' })).status).toBe(200);

    const change = await patch({ segment: 'established', country: 'SG' });
    expect(change.status).toBe(400);
    expect(await change.json()).toMatchObject({
      error: { fields: { segment: expect.any(String) as string } },
    });
    expect(await profileOf(userId)).toMatchObject({ segment: 'accumulating', country: null });
    expect((await patch({ segment: 'unknown' })).status).toBe(400);
  });

  it('takes the browser’s time zone and the onboarding step, and refuses anything else', async () => {
    const { browser } = await signedUp();
    const patch = (json: unknown) => browser.send('/api/me', { method: 'PATCH', json });
    expect(await (await patch({ timeZone: 'america/new_york' })).json()).toMatchObject({
      timeZone: 'America/New_York',
    });
    expect(await (await patch({ onboardingState: 'segment' })).json()).toMatchObject({
      onboardingState: 'segment',
    });
    const cases: [unknown, string][] = [
      [{ timeZone: 'Mars/Olympus_Mons' }, 'timeZone'],
      [{ timeZone: '' }, 'timeZone'],
      [{ onboardingState: 'basics' }, 'onboardingState'],
      [{ segment: 'rich' }, 'segment'],
      [{ email: 'someone@example.com' }, 'email'],
      [{ emailVerified: true }, 'emailVerified'],
      [{ baseCurrency: 'USD' }, 'baseCurrency'],
      [[], 'body'],
    ];
    for (const [json, field] of cases) {
      const res = await patch(json);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: { fields: { [field]: expect.any(String) as string } },
      });
    }
    const notJson = await browser.send('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      origin: ORIGIN,
      json: undefined,
    });
    expect(notJson.status).toBe(400);
    expect(await (await browser.send('/api/me')).json()).toMatchObject({
      timeZone: 'America/New_York',
      onboardingState: 'segment',
    });
  });

  it('shows the ledger’s base currency once the ledger exists', async () => {
    const { browser, userId } = await signedUp();
    expect(await (await browser.send('/api/me')).json()).toMatchObject({ baseCurrency: null });
    await seedLedger(db.withUser, {
      userId,
      baseCurrency: 'SGD',
      connectionId: 'con_01K1G4KX00CCCCCCCCCCCCCCCC',
    });
    expect(await (await browser.send('/api/me')).json()).toMatchObject({ baseCurrency: 'SGD' });
  });

  it('makes a missing profile with its defaults', async () => {
    const { browser, userId } = await signedUp(newEmail(), { timeZone: 'Asia/Singapore' });
    await db.owner.query('delete from core.profile where user_id = $1', [userId]);
    expect(await (await browser.send('/api/me')).json()).toMatchObject({
      country: null,
      timeZone: 'UTC',
      segment: 'unknown',
      onboardingState: 'country',
    });
  });
});

describe('GET /api/geo', () => {
  async function geo(headers: Record<string, string>) {
    const res = await new Browser(target).send('/api/geo', { headers });
    expect(res.status).toBe(200);
    return res.json();
  }

  it('reads the country from the CDN’s header, needing no session', async () => {
    expect(await geo({ 'x-vercel-ip-country': 'SG' })).toStrictEqual({ country: 'SG' });
    expect(await geo({ 'x-vercel-ip-country': 'FR' })).toStrictEqual({ country: 'FR' });
  });

  it('suggests nothing without the header, or with a code not on the country list', async () => {
    expect(await geo({})).toStrictEqual({ country: null });
    expect(await geo({ 'x-vercel-ip-country': 'ZZ' })).toStrictEqual({ country: null });
    expect(await geo({ 'x-vercel-ip-country': 'sg' })).toStrictEqual({ country: null });
  });
});
