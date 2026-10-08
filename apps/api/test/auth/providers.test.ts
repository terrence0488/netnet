import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIGN_UPS_PER_MINUTE } from '../../src/auth/routes';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { Browser, ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';

/**
 * Google and Apple sign-up and sign-in against Postgres, as `netnet_app` (P2-T1, architecture
 * §7.1, §8): each provider creates one verified account asking for nothing else, carries `method`
 * on `account_created`, skips the verification email, and resumes the same account on return.
 * The providers are faked at the OAuth interface: their token endpoints answer over a stubbed
 * `fetch`, while every NetNet side of the flow (state, callback, session, profile, events) is
 * real. Fictional addresses only.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

let db: TestDatabase;
let bareDb: TestDatabase;
let target: AccountsApp;
let bare: AccountsApp;
let count = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db, {
    social: {
      google: { clientId: 'test-google-id', clientSecret: 'test-google-secret' },
      apple: { clientId: 'com.netnet.test', clientSecret: 'test-apple-secret' },
    },
  });
  // No providers configured, on its own database: F17/F18 pending (the wave note's expected
  // state). Its own database because each app seeds the OAuth server's rows on first use.
  bareDb = await createTestDatabase();
  bare = accountsApp(bareDb);
}, 120_000);

afterAll(async () => {
  await db?.close();
  await bareDb?.close();
});

beforeEach(async () => {
  target.clock.now = FIXED_NOW;
  await db.owner.query('truncate core.rate_limit');
  await bareDb.owner.query('truncate core.rate_limit');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A new fictional address for each test. */
function newEmail(): string {
  count += 1;
  return `provider-person-${count}@example.com`;
}

function base64urlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * An id token as the provider's token endpoint would mint it: header, claims, signature. The
 * callback path trusts the TLS exchange with the token endpoint and reads the claims from the
 * token it answers with, so the fake signs with a fixed key rather than a provider CA.
 */
function idToken(claims: Record<string, unknown>): string {
  const signingInput = `${base64urlJson({ alg: 'HS256', typ: 'JWT' })}.${base64urlJson(claims)}`;
  const signature = createHmac('sha256', 'fake-provider-key').update(signingInput).digest();
  return `${signingInput}.${signature.toString('base64url')}`;
}

/**
 * The providers' token endpoints, over a stubbed `fetch`: whatever `code` the callback carries
 * is good, and the id token carries the person the test set. Anything else goes to the real
 * `fetch`, so nothing else in the app notices the stub.
 */
function fakeProviders() {
  const realFetch = globalThis.fetch;
  const google = { sub: '', email: '' };
  const apple = { sub: '', email: '' };
  const calls: string[] = [];
  const answer = (claims: Record<string, unknown>): Response =>
    new Response(
      JSON.stringify({
        access_token: 'fake-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid email profile',
        id_token: idToken(claims),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    // better-fetch calls it with a URL object, not a string.
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url === GOOGLE_TOKEN_URL) {
      return Promise.resolve(
        answer({
          iss: 'https://accounts.google.com',
          aud: 'test-google-id',
          sub: google.sub,
          email: google.email,
          email_verified: true,
          name: 'Fictional Person',
          picture: 'https://example.com/face.png',
        }),
      );
    }
    if (url === APPLE_TOKEN_URL) {
      return Promise.resolve(
        answer({
          iss: 'https://appleid.apple.com',
          aud: 'com.netnet.test',
          sub: apple.sub,
          email: apple.email,
          email_verified: 'true',
          is_private_email: false,
        }),
      );
    }
    return realFetch(input, init);
  });
  return {
    calls,
    asGoogle(sub: string, email: string) {
      google.sub = sub;
      google.email = email;
    },
    asApple(sub: string, email: string) {
      apple.sub = sub;
      apple.email = email;
    },
  };
}

type Provider = 'google' | 'apple';

/**
 * The whole provider round trip through NetNet's endpoints: start the flow, take the state from
 * the provider URL, and answer the callback as the provider would. Returns the callback's answer.
 */
async function providerRoundTrip(
  browser: Browser,
  provider: Provider,
  callbackURL = `${ORIGIN}/app`,
): Promise<Response> {
  const start = await browser.send('/api/auth/sign-in/social', {
    json: { provider, callbackURL },
  });
  expect(start.status).toBe(200);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get('state');
  expect(state).not.toBeNull();
  return browser.send(`/api/auth/callback/${provider}?code=fake-code&state=${state}`);
}

async function userOf(email: string): Promise<{ id: string; email_verified: boolean }> {
  const { rows } = await db.owner.query<{ id: string; email_verified: boolean }>(
    'select id, email_verified from core.user where email = $1',
    [email],
  );
  const user = rows[0];
  if (user === undefined) throw new Error(`no account for ${email}`);
  return user;
}

async function eventsOf(userId: string): Promise<{ name: string; props: unknown }[]> {
  const { rows } = await db.owner.query<{ name: string; props: unknown }>(
    'select name, props from analytics.event where user_id = $1 order by at',
    [userId],
  );
  return rows;
}

describe.each([
  ['google', 'https://accounts.google.com/o/oauth2/v2/auth'],
  ['apple', 'https://appleid.apple.com/auth/authorize'],
] as const)('%s', (provider, authorizeUrl) => {
  it('starts the flow at the provider’s authorization endpoint', async () => {
    const res = await new Browser(target).send('/api/auth/sign-in/social', {
      json: { provider, callbackURL: `${ORIGIN}/app` },
    });
    expect(res.status).toBe(200);
    const { url, redirect } = (await res.json()) as { url: string; redirect: boolean };
    expect(redirect).toBe(true);
    const to = new URL(url);
    expect(`${to.origin}${to.pathname}`).toBe(authorizeUrl);
    expect(to.searchParams.get('state')).not.toBeNull();
    expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/${provider}`);
  });

  it('signs up one verified account, asking for nothing else, and fires account_created', async () => {
    const fake = fakeProviders();
    const email = newEmail();
    const sub = `fake-${provider}-sub-${count}`;
    if (provider === 'google') fake.asGoogle(sub, email);
    else fake.asApple(sub, email);

    const browser = new Browser(target);
    const callback = await providerRoundTrip(browser, provider);
    expect(callback.status).toBe(302);
    expect(callback.headers.get('Location')).toBe(`${ORIGIN}/app`);
    await target.settle();

    expect(fake.calls).toContain(provider === 'google' ? GOOGLE_TOKEN_URL : APPLE_TOKEN_URL);

    // Verified at once, with no name or picture kept, whatever the provider sent.
    const { rows: users } = await db.owner.query(
      'select id, name, email_verified, image from core.user where email = $1',
      [email],
    );
    expect(users).toHaveLength(1);
    const user = users[0] as { id: string };
    expect(user).toMatchObject({ name: '', email_verified: true, image: null });

    const { rows: accounts } = await db.owner.query(
      'select provider_id, account_id from core.account where user_id = $1',
      [user.id],
    );
    expect(accounts).toStrictEqual([{ provider_id: provider, account_id: sub }]);

    // Onboarding starts where the email flow starts it, in UTC until the web app says otherwise.
    const { rows: profiles } = await db.owner.query(
      'select time_zone, onboarding_state from core.profile where user_id = $1',
      [user.id],
    );
    expect(profiles).toStrictEqual([{ time_zone: 'UTC', onboarding_state: 'country' }]);

    // The way in is carried, and no verification email goes out.
    expect(await eventsOf(user.id)).toStrictEqual([
      { name: 'account_created', props: { method: provider } },
    ]);
    expect(target.emails.captured.filter((m) => m.to === email)).toEqual([]);

    // Signed in at once.
    const me = await browser.send('/api/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email, emailVerified: true });
  });

  it('resumes the same account on a returning sign-in, firing no second account_created', async () => {
    const fake = fakeProviders();
    const email = newEmail();
    const sub = `fake-${provider}-returning-${count}`;
    if (provider === 'google') fake.asGoogle(sub, email);
    else fake.asApple(sub, email);

    const first = new Browser(target);
    expect((await providerRoundTrip(first, provider)).status).toBe(302);
    await target.settle();
    const { id } = await userOf(email);

    const second = new Browser(target);
    const callback = await providerRoundTrip(second, provider);
    expect(callback.status).toBe(302);
    expect(callback.headers.get('Location')).toBe(`${ORIGIN}/app`);
    await target.settle();

    expect((await userOf(email)).id).toBe(id);
    const { rowCount } = await db.owner.query('select 1 from core.user where email = $1', [email]);
    expect(rowCount).toBe(1);
    const { rows: accounts } = await db.owner.query(
      'select 1 from core.account where user_id = $1',
      [id],
    );
    expect(accounts).toHaveLength(1);
    expect(await eventsOf(id)).toStrictEqual([
      { name: 'account_created', props: { method: provider } },
    ]);
    expect((await second.send('/api/me')).status).toBe(200);
  });
});

describe('without the secrets (F17/F18 pending)', () => {
  it('leaves the providers cleanly unavailable and the email flow untouched', async () => {
    const start = await new Browser(bare).send('/api/auth/sign-in/social', {
      json: { provider: 'google', callbackURL: `${ORIGIN}/app` },
    });
    expect(start.status).toBe(404);

    const callback = await new Browser(bare).send(
      '/api/auth/callback/google?code=fake-code&state=fake-state',
    );
    expect(callback.status).toBe(302);
    // Better Auth's own error page, which NetNet does not serve: the web app always sends an
    // errorCallbackURL, so a real failure returns to the screen it started from.
    expect(callback.headers.get('Location')).toContain(`${ORIGIN}/api/auth/error`);

    const email = newEmail();
    const browser = new Browser(bare);
    expect((await browser.signUp(email, 'correct horse')).status).toBe(200);
    await bare.settle();
    expect((await browser.send('/api/me')).status).toBe(200);
  });
});

describe('the social start’s rate limit', () => {
  it(`allows ${SIGN_UPS_PER_MINUTE} starts a minute from one IP address`, async () => {
    const browser = new Browser(target, '198.51.100.20');
    for (let i = 0; i < SIGN_UPS_PER_MINUTE; i += 1) {
      const res = await browser.send('/api/auth/sign-in/social', {
        json: { provider: 'google', callbackURL: `${ORIGIN}/app` },
      });
      expect(res.status).toBe(200);
    }
    const refused = await browser.send('/api/auth/sign-in/social', {
      json: { provider: 'google', callbackURL: `${ORIGIN}/app` },
    });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    await target.settle();
  });
});
