/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectSoundScreen } from './accounts';
import { EMPTY_SNAPSHOT, mockConnections, mockPacks, mockSnapshot, SIGNED_IN } from './support';

/**
 * Account → General (P3-T3): where the person lives and the default currency, both applied as
 * chosen, and Log out. The country list is every country alphabetically with none pinned; the
 * currency list is every currency content knows. All data is fictional.
 */
test.use({ timezoneId: 'UTC' });

/** The live country list, as content has it — the screens read it, never a fixture. */
const COUNTRIES = JSON.parse(
  readFileSync(new URL('../content/countries.json', import.meta.url), 'utf8'),
) as Record<string, { currency: string; pack?: string }>;

interface Profile {
  email: string;
  emailVerified: boolean;
  country: string | null;
  baseCurrency: string | null;
  segment: string;
  timeZone: string;
  onboardingState: string;
}

let profile: Profile;
let signedOut: boolean;
/** The bodies PATCHed to /api/me, in order. */
let patches: Record<string, unknown>[];
/** The `If-None-Match` of each snapshot request the app made, in order. */
let snapshots: Promise<string | null>[];

test.beforeEach(async ({ page }) => {
  profile = { ...SIGNED_IN };
  signedOut = false;
  patches = [];
  snapshots = [];
  await page.route('**/api/me', (route) => {
    if (signedOut) {
      void route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } },
      });
      return;
    }
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push(body);
      if (typeof body.country === 'string') {
        // The mocked ledger is empty, so a new country starts it over in its currency.
        profile = {
          ...profile,
          country: body.country,
          baseCurrency: COUNTRIES[body.country]?.currency ?? profile.baseCurrency,
        };
      }
      if (typeof body.baseCurrency === 'string') {
        profile = { ...profile, baseCurrency: body.baseCurrency };
      }
    }
    void route.fulfill({ json: profile });
  });
  await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
  await mockSnapshot(page, EMPTY_SNAPSHOT);
  await mockConnections(page, []);
  await mockPacks(page);
  await page.route('**/api/content/current', (route) =>
    route.fulfill({ json: { countries: { countries: 1 }, pack: { generic: 1 } } }),
  );
  await page.route('**/api/content/countries/*', (route) => route.fulfill({ json: COUNTRIES }));
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/snapshot') {
      snapshots.push(request.headerValue('if-none-match'));
    }
  });
});

const countrySelect = (page: Page) => page.getByLabel('Where you live');
const currencySelect = (page: Page) => page.getByLabel('Default currency');

/** Follows a tab without reloading, so the app's cache survives the trip. */
async function goTab(page: Page, name: 'Home' | 'Account'): Promise<void> {
  const tabs = page
    .getByRole('navigation', { name: 'Tabs' })
    .getByRole('link', { name, exact: true });
  if (await tabs.isVisible()) {
    await tabs.click();
  } else {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name, exact: true })
      .click();
  }
}

test('Account leads to General, with every country alphabetical and every currency', async ({
  page,
}, testInfo) => {
  await page.goto('/app/account');
  await expect(page.getByRole('link', { name: /General/ })).toContainText('Singapore · SGD');
  await page.getByRole('link', { name: /General/ }).click();
  await expect(page).toHaveURL(/\/app\/account\/general$/);
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();

  const options = countrySelect(page).locator('option');
  await expect(options).toHaveCount(Object.keys(COUNTRIES).length);
  const names = await options.allTextContents();
  // Alphabetical in the reader's language, with none pinned above the rest.
  const ordered = await page.evaluate((texts: string[]) => {
    const order = new Intl.Collator([...navigator.languages, 'en']);
    return texts.every((text, i) => i === 0 || order.compare(texts[i - 1]!, text) <= 0);
  }, names);
  expect(ordered).toBe(true);
  expect(names[0]).toBe('Afghanistan');
  expect(names.filter((name) => name === 'Singapore')).toHaveLength(1);
  await expect(countrySelect(page)).toHaveValue('SG');

  const codes = await currencySelect(page).locator('option').allTextContents();
  const wanted = [...new Set(Object.values(COUNTRIES).map((c) => c.currency))].sort();
  expect(codes).toStrictEqual(wanted);
  await expect(currencySelect(page)).toHaveValue('SGD');

  await expectSoundScreen(page, testInfo);
});

test('changing the currency saves it, and Home reads the snapshot again', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Net worth' })).toBeVisible();
  expect(snapshots).toHaveLength(1);

  await goTab(page, 'Account');
  await page.getByRole('link', { name: /General/ }).click();
  await expect(currencySelect(page)).toBeVisible();
  const patched = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === '/api/me',
  );
  await currencySelect(page).selectOption('EUR');
  await patched;
  await expect(currencySelect(page)).toHaveValue('EUR');
  expect(patches).toStrictEqual([{ baseCurrency: 'EUR' }]);
  expect(snapshots).toHaveLength(1);

  await goTab(page, 'Home');
  await expect(page.getByRole('heading', { name: 'Net worth' })).toBeVisible();
  expect(snapshots).toHaveLength(2);
  expect(await snapshots[1]).toBe('"1:generic@1"');
});

test('changing the country saves it', async ({ page }, testInfo) => {
  await page.goto('/app/account/general');
  await countrySelect(page).selectOption('DE');
  await expect(countrySelect(page)).toHaveValue('DE');
  expect(patches).toStrictEqual([{ country: 'DE' }]);
  // An empty ledger starts over in the new country's currency.
  await expect(currencySelect(page)).toHaveValue('EUR');

  await expectSoundScreen(page, testInfo);
});

test('Log out signs out and lands on log-in', async ({ page }) => {
  await page.goto('/app/account');
  const signOut = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/sign-out',
  );
  await page.route('**/api/auth/sign-out', (route) => {
    signedOut = true;
    void route.fulfill({ json: {} });
  });
  await page.getByRole('button', { name: 'Log out' }).click();
  await signOut;
  await expect(page).toHaveURL(/\/app\/login$/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});
