/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  recordEventAnswers,
  recordEvents,
} from './accounts';

/**
 * Google and Apple sign-in buttons (P2-T1, architecture §8): the official buttons render above
 * the email on the sign-up and log-in screens, and tapping one fires `signup_started {method}`
 * (sign-up only) and starts the provider's flow. The providers themselves are never reached:
 * their authorization pages are answered with an abort, and the attempted URL is what is
 * asserted. Needs the E2E server's fake provider secrets and the VITE_AUTH_* build flags.
 */
onlyAgainstTheLocalApp();

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

/** The provider navigations this page attempts, aborted before they leave NetNet. */
async function attemptedProviderUrls(page: Page, host: string): Promise<string[]> {
  const urls: string[] = [];
  await page.route(`https://${host}/**`, (route) => {
    urls.push(route.request().url());
    void route.abort();
  });
  return urls;
}

/** The bodies the page posts to start a provider flow, in order. */
function startedFlows(page: Page): Record<string, string>[] {
  const flows: Record<string, string>[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/auth/sign-in/social'
    ) {
      flows.push(request.postDataJSON() as Record<string, string>);
    }
  });
  return flows;
}

test('sign-up: the official buttons start the Google flow, counted as a start', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  const events = recordEvents(page);
  const answers = recordEventAnswers(page);
  const flows = startedFlows(page);
  const attempts = await attemptedProviderUrls(page, 'accounts.google.com');

  await page.goto('/app/signup');
  await expect(heading(page, 'Create your account')).toBeVisible();
  // Before the click: the aborted navigation leaves the address unusable afterwards.
  const origin = new URL(page.url()).origin;
  const google = page.getByRole('button', { name: 'Continue with Google' });
  const apple = page.getByRole('button', { name: 'Continue with Apple' });
  await expect(google).toBeVisible();
  await expect(apple).toBeVisible();
  // The brands' marks, decoration only: screen readers hear just the labels.
  await expect(google.locator('svg')).toHaveCount(1);
  await expect(apple.locator('svg')).toHaveCount(1);
  await expectSoundScreen(page, testInfo);

  await google.click();
  await expect.poll(() => attempts.length, 'the provider page is navigated to').toBe(1);
  const [to] = attempts as [string];
  const url = new URL(to);
  expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  expect(url.searchParams.get('client_id')).toBeTruthy();
  expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/google`);

  // Before the account exists, like the email flow's own start (PRD §3.5).
  expect(events).toStrictEqual(['signup_started:google']);
  await expect.poll(() => answers.length).toBe(1);
  expect(answers).toStrictEqual([204]);

  expect(flows).toHaveLength(1);
  expect(flows[0]).toMatchObject({
    provider: 'google',
    callbackURL: `${origin}/app`,
    errorCallbackURL: `${origin}/app/signup?provider=google`,
  });
});

test('sign-up: the Apple button starts the Apple flow, counted as a start', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  const events = recordEvents(page);
  const flows = startedFlows(page);
  const attempts = await attemptedProviderUrls(page, 'appleid.apple.com');

  await page.goto('/app/signup');
  await expect(heading(page, 'Create your account')).toBeVisible();
  // Before the click: the aborted navigation leaves the address unusable afterwards.
  const origin = new URL(page.url()).origin;
  await page.getByRole('button', { name: 'Continue with Apple' }).click();
  await expect.poll(() => attempts.length, 'the provider page is navigated to').toBe(1);
  const url = new URL((attempts as [string])[0]);
  expect(`${url.origin}${url.pathname}`).toBe('https://appleid.apple.com/auth/authorize');
  expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/callback/apple`);
  expect(events).toStrictEqual(['signup_started:apple']);
  expect(flows).toHaveLength(1);
  expect(flows[0]).toMatchObject({
    provider: 'apple',
    errorCallbackURL: `${origin}/app/signup?provider=apple`,
  });
});

test('log-in: the buttons start the flow without counting a sign-up, keeping ?next=', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  const events = recordEvents(page);
  const flows = startedFlows(page);
  const attempts = await attemptedProviderUrls(page, 'accounts.google.com');

  await page.goto('/app/login?next=%2Fagent');
  await expect(heading(page, 'Log in')).toBeVisible();
  // Before the click: the aborted navigation leaves the address unusable afterwards.
  const origin = new URL(page.url()).origin;
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect.poll(() => attempts.length, 'the provider page is navigated to').toBe(1);
  // A returning person is not a start.
  expect(events).toStrictEqual([]);
  expect(flows).toHaveLength(1);
  expect(flows[0]).toMatchObject({
    provider: 'google',
    callbackURL: `${origin}/app?next=%2Fagent`,
    errorCallbackURL: `${origin}/app/login?next=%2Fagent&provider=google`,
  });
});

test('a provider failure returns to the screen it started from, told plainly', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);

  await page.goto('/app/signup?provider=google&error=access_denied');
  await expect(heading(page, 'Create your account')).toBeVisible();
  await expect(page.getByText('Google sign-in didn’t finish. Try again.')).toBeVisible();

  await page.goto('/app/login?provider=apple&error=account_not_linked');
  await expect(heading(page, 'Log in')).toBeVisible();
  await expect(page.getByText('Apple sign-in didn’t finish. Try again.')).toBeVisible();

  await page.goto('/app/login?error=access_denied');
  await expect(page.getByText('Sign-in didn’t finish. Try again.')).toBeVisible();
});
