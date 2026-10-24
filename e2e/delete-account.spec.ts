/// <reference lib="dom" />
import { withClient } from '@netnet/api/db/client';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  signedUp,
} from './accounts';
import { EMPTY_SNAPSHOT, mockConnections, mockPacks, mockSnapshot, SIGNED_IN } from './support';

/**
 * Account → Delete account (P3-T4): the 30-day window stated before anything can be confirmed,
 * then the deletion itself. A stale sign-in is sent to sign in again. All data is fictional.
 */
test.use({ timezoneId: 'UTC' });

/** The live country list, as content has it — the Account screen reads it, never a fixture. */
const COUNTRIES = JSON.parse(
  readFileSync(new URL('../content/countries.json', import.meta.url), 'utf8'),
) as Record<string, { currency: string; pack?: string }>;

async function asAccountScreens(page: Page): Promise<void> {
  await page.route('**/api/me', (route) => route.fulfill({ json: SIGNED_IN }));
  await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
  await mockSnapshot(page, EMPTY_SNAPSHOT);
  await mockConnections(page, []);
  await mockPacks(page);
  await page.route('**/api/content/current', (route) =>
    route.fulfill({ json: { countries: { countries: 1 }, pack: { generic: 1 } } }),
  );
  await page.route('**/api/content/countries/*', (route) => route.fulfill({ json: COUNTRIES }));
}

test('states the 30-day window before anything can be confirmed', async ({ page }, testInfo) => {
  await asAccountScreens(page);
  await page.goto('/app/account');
  await page.getByRole('link', { name: /Delete account/ }).click();
  await expect(page).toHaveURL(/\/app\/account\/delete$/);

  const screen = page.getByRole('heading', { name: 'Delete account' });
  await expect(screen).toBeVisible();
  await expect(page.getByText('This erases everything')).toBeVisible();
  await expect(page.getByText(/deleted within.*30 days/)).toBeVisible();
  await expect(
    page.getByText('immediately stop being readable by any connected agent'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Export first' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible();

  await expectSoundScreen(page, testInfo);
});

test('confirming deletes, and lands on sign-up with nothing cached', async ({ page }) => {
  await asAccountScreens(page);
  let deleted = false;
  // The session dies with the account: afterwards nobody is signed in.
  await page.route('**/api/me', (route) => {
    if (!deleted) {
      void route.fallback();
      return;
    }
    void route.fulfill({
      status: 401,
      json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } },
    });
  });
  const gone = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && new URL(request.url()).pathname === '/api/account',
  );
  await page.route('**/api/account', (route) => {
    deleted = true;
    void route.fulfill({ json: { erasedWithinDays: 30 } });
  });

  await page.goto('/app/account/delete');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByText('Delete your account and everything in it?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, delete everything' }).click();
  await gone;
  await expect(page).toHaveURL(/\/app\/signup$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
});

test('a stale sign-in is sent to sign in again, and nothing is deleted', async ({ page }) => {
  await asAccountScreens(page);
  let signedOut = false;
  await page.route('**/api/me', (route) => {
    if (!signedOut) {
      void route.fallback();
      return;
    }
    void route.fulfill({
      status: 401,
      json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } },
    });
  });
  await page.route('**/api/account', (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: 'REAUTH_REQUIRED', message: 'Sign in again first.' } },
    }),
  );
  await page.route('**/api/auth/sign-out', (route) => {
    signedOut = true;
    void route.fulfill({ json: {} });
  });
  await page.goto('/app/account/delete');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByRole('button', { name: 'Yes, delete everything' }).click();
  await expect(page.getByText(/For safety, sign in again first/)).toBeVisible();
  // Signing in again starts by signing out: a signed-in session cannot reach the login screen.
  await page.getByRole('button', { name: 'Log in again' }).click();
  await expect(page).toHaveURL(/\/app\/login$/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

test.describe('against the database', () => {
  onlyAgainstTheLocalApp();

  test('deletes for real: nothing readable afterwards', async ({ page }, testInfo) => {
    const person = newPerson(testInfo);
    await arriveAs(page, person);
    await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
    const userId = await queryOne(
      'select id from core.user where email = $1',
      [person.email],
      'id',
    );

    // Something to erase: a holding with a value.
    const snapshot = (await (await page.request.get('/api/snapshot')).json()) as {
      types: { id: string; universal: string; packTypeKey: string | null }[];
    };
    const cash = snapshot.types.find((t) => t.universal === 'cash' && t.packTypeKey === null)?.id;
    expect(cash).toBeTruthy();
    const holding = (await (
      await page.request.post('/api/holdings', {
        data: { name: 'Rainy day pot', kind: 'asset', typeId: cash, currency: 'SGD', via: 'form' },
      })
    ).json()) as { result: { id: string } };
    const today = new Date().toISOString().slice(0, 10);
    await page.request.post(`/api/holdings/${holding.result.id}/values`, {
      data: { amount: '100', date: today },
    });
    // One of this account's own events: after the deletion it carries the random id the account's
    // events were re-keyed to, which tells this run's `account_deleted` from those of other runs
    // deleting accounts into the same database at the same time.
    const ownEvent = await queryOne(
      'select coalesce(max(id), 0)::text as n from analytics.event where user_id = $1',
      [userId],
      'n',
    );
    expect(ownEvent).not.toBe('0');

    await page.goto('/app/account/delete');
    await expect(page.getByText(/deleted within.*30 days/)).toBeVisible();
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByRole('button', { name: 'Yes, delete everything' }).click();
    await expect(page).toHaveURL(/\/app\/signup$/);

    // The session died with the account.
    expect((await page.request.get('/api/me')).status()).toBe(401);

    // The ledger, the identity and the grants are gone; the events point at no one.
    expect(
      await queryOne('select count(*)::int as n from core.user where id = $1', [userId], 'n'),
    ).toBe('0');
    expect(
      await queryOne(
        'select count(*)::int as n from ledger.holding where user_id = $1',
        [userId],
        'n',
      ),
    ).toBe('0');
    expect(
      await queryOne(
        'select count(*)::int as n from core.oauth_refresh_token where user_id = $1',
        [userId],
        'n',
      ),
    ).toBe('0');
    expect(
      await queryOne(
        'select count(*)::int as n from analytics.event where user_id = $1',
        [userId],
        'n',
      ),
    ).toBe('0');
    const rekeyed = await queryOne(
      'select user_id from analytics.event where id = $1',
      [ownEvent],
      'user_id',
    );
    expect(rekeyed).not.toBe(userId);
    expect(
      await queryOne(
        `select count(*)::int as n from analytics.event
         where name = 'account_deleted' and user_id = $1`,
        [rekeyed],
        'n',
      ),
    ).toBe('1');
  });
});

/** One cell from the local database the built app runs on. */
async function queryOne(sql: string, values: unknown[], column: string): Promise<string> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('This spec reads the local database: set DATABASE_URL.');
  return withClient(url, async (client) => {
    const { rows } = await client.query(sql, values);
    return String((rows[0] as Record<string, unknown> | undefined)?.[column]);
  });
}
