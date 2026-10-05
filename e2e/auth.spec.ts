/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousAxeViolations } from './support';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  profileOf,
  recordEventAnswers,
  recordEvents,
  recordProblems,
  resetLinkFor,
  signedUp,
  verifiedElsewhere,
} from './accounts';

/**
 * Sign-up, log-in, log-out, the password reset and the verify link's page (PRD J1, architecture
 * §8), at 390 and 1280px, against the built app and its database.
 */
onlyAgainstTheLocalApp();

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

test.use({ timezoneId: 'Asia/Singapore' });

test('sign-up asks for an email and a password, then onboarding, verification not waited for', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  const events = recordEvents(page);
  const answers = recordEventAnswers(page);
  const problems = recordProblems(page);

  await page.goto('/app/signup');
  await expect(heading(page, 'Create your account')).toBeVisible();
  await expect(page).toHaveTitle('Create your account · NetNet');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  // Nothing but a way in: no password yet, and nothing onboarding asks.
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await expect(page.getByText(/Where do you live|closest to you|Totals in/)).toHaveCount(0);
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByText('Enter an email address.')).toBeVisible();
  expect(events).toStrictEqual([]);

  await page.getByLabel('Email').fill(person.email);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(heading(page, 'Set a password')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/signup\/password$/);
  await expect(page.getByText(`For ${person.email}`)).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
  await expectSoundScreen(page, testInfo);

  // Back keeps the address, and the next Continue counts as another start.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByLabel('Email')).toHaveValue(person.email);
  await page.getByRole('button', { name: 'Continue with email' }).click();

  const password = page.getByLabel('Password', { exact: true });
  await password.fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  await password.fill(person.password);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Signed in at once: onboarding, with the verification email sent and not waited for.
  await expect(heading(page, 'Where do you live?')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/onboarding\/country$/);
  await expect(page.getByText(`We’ve sent a link to ${person.email}`)).toBeVisible();
  await page.getByRole('button', { name: 'Resend the link' }).click();
  await expect(page.getByText('Sent again.')).toBeVisible();

  // Before the account exists: signup_started, once per start; then the session.
  await expect.poll(() => events.at(-1)).toBe('session_started');
  expect(events).toStrictEqual([
    'signup_started:email',
    'signup_started:email',
    '(sign-up)',
    'session_started',
  ]);
  await expect.poll(() => answers.length).toBe(3);
  expect(answers.every((status) => status === 204)).toBe(true);

  const me = await profileOf(page);
  expect(me).toMatchObject({
    email: person.email,
    emailVerified: false,
    timeZone: 'Asia/Singapore',
    onboardingState: 'country',
  });
  expect(problems).toStrictEqual([]);
});

test('an address that already has an account is sent to log in, told why', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
  await page.context().clearCookies();

  await page.goto('/app/signup');
  await page.getByLabel('Email').fill(person.email);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByLabel('Password', { exact: true }).fill('another password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(heading(page, 'Log in')).toBeVisible();
  await expect(page.getByText('You already have an account. Log in instead.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue(person.email);
});

test('log in: a wrong password is refused plainly; then Home, and log out', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
  await page.context().clearCookies();
  const problems = recordProblems(page, [/\/api\/auth\/sign-in\/email$/]);

  // Signed out, the app's screens send a visitor to log in.
  await page.goto('/app/');
  await expect(heading(page, 'Log in')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/login$/);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Enter an email address.')).toBeVisible();
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(
    page.getByText('That email and password don’t match. Try again, or reset your password.'),
  ).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill(person.password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(heading(page, 'Home')).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);

  // Onboarded: sign-up and log-in are behind them.
  await page.goto('/app/signup');
  await expect(heading(page, 'Home')).toBeVisible();

  await page.getByRole('link', { name: 'Account' }).filter({ visible: true }).click();
  await expect(heading(page, 'Account')).toBeVisible();
  await expect(page.getByText(person.email)).toBeVisible();
  await expectSoundScreen(page, testInfo);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(heading(page, 'Log in')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/login$/);
  expect((await page.request.get('/api/me')).status()).toBe(401);

  await page.goto('/app/account');
  await expect(heading(page, 'Log in')).toBeVisible();
  expect(problems).toStrictEqual([]);
});

test('logging in returns to the screen asked for', async ({ page }, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
  await page.context().clearCookies();

  await page.goto('/app/agent');
  await expect(page).toHaveURL(/\/app\/login\?next=%2Fagent$/);
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password', { exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(heading(page, 'Agent')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/agent$/);
});

test('no network: log-in says so, with what to do', async ({ page }, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  await page.goto('/app/login');
  await expect(heading(page, 'Log in')).toBeVisible();
  await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password', { exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(
    page.getByText('NetNet can’t be reached. Check your connection, then try again.'),
  ).toBeVisible();
});

test('forgot and reset: never says whether an account exists; the link sets a new password once', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  const stranger = newPerson(testInfo);
  await arriveAs(page, person);
  await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
  await page.context().clearCookies();

  await page.goto('/app/login');
  await page.getByLabel('Email').fill(person.email);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(heading(page, 'Reset your password')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue(person.email);
  await expectSoundScreen(page, testInfo);
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(heading(page, 'Check your email')).toBeVisible();
  const told =
    (await page.getByRole('status').filter({ hasText: 'If there’s an account' }).textContent()) ??
    '';
  expect(told).toContain(person.email);
  await expectSoundScreen(page, testInfo);

  // The same words for an address with no account.
  await page.goto('/app/forgot');
  await page.getByLabel('Email').fill(stranger.email);
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(heading(page, 'Check your email')).toBeVisible();
  const toldStranger =
    (await page.getByRole('status').filter({ hasText: 'If there’s an account' }).textContent()) ??
    '';
  expect(toldStranger.replace(stranger.email, '<email>')).toBe(
    told.replace(person.email, '<email>'),
  );

  // The email's link, through Better Auth, to the page that asks for the new password.
  const link = await resetLinkFor(person);
  await page.goto(link);
  await expect(heading(page, 'Choose a new password')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/reset\?token=/);
  await expectSoundScreen(page, testInfo);
  await page.getByLabel('New password').fill('short');
  await page.getByRole('button', { name: 'Save the new password' }).click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  await page.getByLabel('New password').fill('a new passphrase');
  await page.getByRole('button', { name: 'Save the new password' }).click();

  await expect(heading(page, 'Log in')).toBeVisible();
  await expect(page.getByText('Your password is changed. Log in with the new one.')).toBeVisible();
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password', { exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(
    page.getByText('That email and password don’t match.', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('a new passphrase');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(heading(page, 'Home')).toBeVisible();

  // The link works once.
  await page.goto(link);
  await expect(heading(page, 'This link doesn’t work any more')).toBeVisible();
  await expectSoundScreen(page, testInfo);
  // Signed in again, so asking for another link leads Home rather than to Forgot password.
  await page.getByRole('link', { name: 'Ask for a new link' }).click();
  await expect(heading(page, 'Home')).toBeVisible();
});

test('the verify link’s page: verified, or a new link to ask for', async ({ page }, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person);
  await signedUp(page, person, { country: 'SG', onboardingState: 'done' });

  // A link that did not verify, while signed in and unverified: a new one is one tap away.
  await page.goto('/app/verify?error=INVALID_TOKEN');
  await expect(heading(page, 'That link didn’t work')).toBeVisible();
  await expectSoundScreen(page, testInfo);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByText(`A new link is on its way to ${person.email}.`)).toBeVisible();

  await verifiedElsewhere(person);
  await page.goto('/app/verify');
  await expect(heading(page, 'Your email is verified')).toBeVisible();
  await expectSoundScreen(page, testInfo);
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(heading(page, 'Home')).toBeVisible();
  await page.goto('/app/account');
  await expect(page.getByText('Not verified yet.')).toHaveCount(0);

  // Signed out, a failed link says how to get another.
  await page.context().clearCookies();
  await page.goto('/app/verify?error=INVALID_TOKEN');
  await expect(heading(page, 'That link didn’t work')).toBeVisible();
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/app\/login\?next=%2Faccount$/);
});

test('the browser’s time zone follows the person to the profile', async ({
  browser,
  baseURL,
}, testInfo) => {
  const person = newPerson(testInfo);
  const home = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    timezoneId: 'Asia/Singapore',
  });
  const homePage = await home.newPage();
  await arriveAs(homePage, person);
  await signedUp(homePage, person, { country: 'SG', onboardingState: 'done' });
  await home.close();

  const away = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    timezoneId: 'Europe/London',
  });
  const page = await away.newPage();
  await arriveAs(page, person);
  await page.goto('/app/login');
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password', { exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(heading(page, 'Home')).toBeVisible();
  await expect.poll(async () => (await profileOf(page)).timeZone).toBe('Europe/London');
  await away.close();
});

test('the signed-out screens pass axe in the dark theme too', async ({ page }, testInfo) => {
  await arriveAs(page, newPerson(testInfo));
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const [path, title] of [
    ['/app/signup', 'Create your account'],
    ['/app/login', 'Log in'],
    ['/app/forgot', 'Reset your password'],
    ['/app/reset?token=abcdefghijklmnopqrstuvwx', 'Choose a new password'],
    ['/app/reset?error=INVALID_TOKEN', 'This link doesn’t work any more'],
    ['/app/verify', 'Your email is verified'],
    ['/app/verify?error=INVALID_TOKEN', 'That link didn’t work'],
  ] as const) {
    await page.goto(path);
    await expect(heading(page, title)).toBeVisible();
    await expectNoSeriousAxeViolations(page);
  }
});
