import { ONBOARDING_STATES as CONTRACT_STATES } from '@netnet/contracts';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_STATES as PROFILE_STATES } from '../db/schema';
import type { AppEnv, SessionUser } from '../lib/context';
import { handleError } from '../lib/error-handler';
import { requestContext } from '../lib/request-context';
import { sessionContext } from '../lib/session';
import { geoRoutes } from './geo';
import { meRoutes } from './me';

/**
 * `/api/me` and `/api/geo` without a database: everything a request is refused for is decided
 * before the profile is read. The rest is in test/auth/accounts.test.ts, against Postgres.
 */
const USER: SessionUser = { userId: 'usr_01K1G4KX00AAAAAAAAAAAAAAAA', emailVerified: false };
const COUNTRIES = { SG: { currency: 'SGD', pack: 'sg' }, FR: { currency: 'EUR' } };

function appAs(user: SessionUser | null) {
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    sessionContext(() => Promise.resolve(user)),
  );
  app.route(
    '/api/me',
    meRoutes({
      db: () => {
        throw new Error('the database was reached');
      },
      baseCurrency: () => Promise.reject(new Error('the ledger was reached')),
      countries: () => Promise.resolve(COUNTRIES),
    }),
  );
  app.route(
    '/api/geo',
    geoRoutes(() => Promise.resolve(COUNTRIES)),
  );
  app.onError(handleError);
  return app;
}

function patch(app: Hono<AppEnv>, body: string) {
  return app.request('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('PATCH /api/me', () => {
  it('asks for a session before it reads the body', async () => {
    const res = await patch(appAs(null), 'not json');
    expect(res.status).toBe(401);
  });

  it.each([
    ['not json', 'body'],
    ['[]', 'body'],
    ['{"country": "ZZ"}', 'country'],
    ['{"country": "sg"}', 'country'],
    ['{"segment": "wealthy"}', 'segment'],
    ['{"timeZone": "Moon/Base"}', 'timeZone'],
    ['{"onboardingState": "finished"}', 'onboardingState'],
    ['{"userId": "usr_01K1G4KX00BBBBBBBBBBBBBBBB"}', 'userId'],
  ])('refuses %s before touching the database, naming %s', async (body, field) => {
    const res = await patch(appAs(USER), body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fields: { [field]: expect.any(String) as string } },
    });
  });

  it('refuses a body over 1 KB', async () => {
    const res = await patch(appAs(USER), JSON.stringify({ timeZone: 'x'.repeat(2000) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { fields: { body: expect.any(String) as string } },
    });
  });
});

describe('GET /api/geo', () => {
  it('suggests the CDN’s country only when it is on the list', async () => {
    const geo = async (country?: string) =>
      (
        await appAs(null).request('/api/geo', {
          headers: country === undefined ? {} : { 'x-vercel-ip-country': country },
        })
      ).json();
    expect(await geo('SG')).toStrictEqual({ country: 'SG' });
    expect(await geo('FR')).toStrictEqual({ country: 'FR' });
    expect(await geo('MY')).toStrictEqual({ country: null });
    expect(await geo('XX')).toStrictEqual({ country: null });
    expect(await geo()).toStrictEqual({ country: null });
  });
});

describe('onboarding states', () => {
  it('are the same in the contract and in core.profile', () => {
    expect([...CONTRACT_STATES]).toStrictEqual([...PROFILE_STATES]);
  });
});
