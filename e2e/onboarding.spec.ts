/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  profileOf,
  recordProblems,
  signedUp,
} from './accounts';

/**
 * Onboarding (PRD J1, J2, §2.3 rule 2): where they live, inferred and confirmed with one tap or
 * chosen from every country alphabetically, then the skippable segment, one question per screen,
 * landing on Home; Back, and resuming. At 390 and 1280px, against the built app and its database.
 */
onlyAgainstTheLocalApp();

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

const country = (page: Page) => page.getByRole('combobox', { name: 'Country' });

/** The number of countries NetNet lists: the keys of the live countries.json. */
async function countryCount(page: Page): Promise<number> {
  const current = (await (await page.request.get('/api/content/current')).json()) as {
    countries: { countries: number };
  };
  const doc = await page.request.get(
    `/api/content/countries/countries@${current.countries.countries}`,
  );
  return Object.keys((await doc.json()) as object).length;
}

/** The list's names, without the "Choose…" placeholder, and whether they are in the page's order. */
async function listed(page: Page) {
  return country(page).evaluate((select: HTMLSelectElement) => {
    const names = [...select.options].filter((o) => o.value !== '').map((o) => o.text);
    const order = new Intl.Collator(navigator.languages as string[]);
    return {
      first: select.options[0]?.text,
      names,
      sorted: names.every((name, i) => i === 0 || order.compare(names[i - 1] ?? '', name) <= 0),
    };
  });
}

test('the looked-up country is confirmed with one tap, the segment skipped, then Home', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person);
  const problems = recordProblems(page);

  await page.goto('/app/');
  await expect(heading(page, 'Where do you live?')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/onboarding\/country$/);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByText('1 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Singapore' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Totals in SGD')).toBeVisible();
  await expect(country(page)).toHaveCount(0);
  await expectSoundScreen(page, testInfo);

  // Home is not open before onboarding is done, nor any other screen with chrome.
  await page.goto('/app/agent');
  await expect(heading(page, 'Where do you live?')).toBeVisible();

  // One tap.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'Which is closest to you?')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/onboarding\/segment$/);
  await expect(page.getByText('2 of 2')).toBeVisible();
  await expect(page.getByText('Optional. It changes nothing you see.')).toBeVisible();
  await expectSoundScreen(page, testInfo);
  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(heading(page, 'Net worth')).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  expect(await profileOf(page)).toMatchObject({
    country: 'SG',
    segment: 'unknown',
    onboardingState: 'done',
  });

  // Done is done: onboarding is behind them.
  await page.goto('/app/onboarding/country');
  await expect(heading(page, 'Net worth')).toBeVisible();
  expect(problems).toStrictEqual([]);
});

test('Somewhere else lists every other country alphabetically; Back keeps the answers', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person);
  const all = await countryCount(page);

  await page.goto('/app/onboarding');
  await page.getByRole('button', { name: 'Somewhere else' }).click();
  await expect(page.getByRole('button', { name: 'Somewhere else' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const list = await listed(page);
  expect(list.first).toBe('Choose…');
  expect(list.names).toHaveLength(all - 1);
  expect(list.sorted, 'alphabetical in the reader’s language').toBe(true);
  expect(list.names, 'the suggestion is not repeated, let alone pinned').not.toContain('Singapore');
  expect(list.names[0]).not.toBe('Singapore');
  await expect(page.getByText(/Totals in/)).toHaveCount(0);
  await expectSoundScreen(page, testInfo);

  await country(page).selectOption({ label: 'Malaysia' });
  await expect(page.getByText('Totals in MYR')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(heading(page, 'Which is closest to you?')).toBeVisible();
  const building = page.getByRole('button', { name: /^Building up/ });
  await building.click();
  await expect(building).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

  // Back shows the earlier answer, and coming forward again keeps the segment.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, 'Where do you live?')).toBeVisible();
  await expect(country(page)).toHaveValue('MY');
  await expect(page.getByText('Totals in MYR')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(building).toHaveAttribute('aria-pressed', 'true');

  // Choosing it again unchooses it; choosing again chooses it.
  await building.click();
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  await building.click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(heading(page, 'Net worth')).toBeVisible();
  expect(await profileOf(page)).toMatchObject({
    country: 'MY',
    segment: 'accumulating',
    onboardingState: 'done',
  });
});

test('a returning person resumes onboarding where it was left', async ({ page }, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person);

  // A step ahead of the saved one is not open yet.
  await page.goto('/app/onboarding/segment');
  await expect(heading(page, 'Where do you live?')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(heading(page, 'Which is closest to you?')).toBeVisible();

  await page.context().clearCookies();
  await page.goto('/app/login');
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password', { exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(heading(page, 'Which is closest to you?')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/onboarding\/segment$/);

  // Back still shows the country saved before.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Singapore' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('no network: Continue says so, and nothing moves on', async ({ page }, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person);
  await page.goto('/app/onboarding/country');
  await expect(page.getByRole('button', { name: 'Singapore' })).toBeVisible();
  await page.route('**/api/me', (route) =>
    route.request().method() === 'PATCH' ? route.abort('internetdisconnected') : route.fallback(),
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByText('NetNet can’t be reached. Check your connection, then try again.'),
  ).toBeVisible();
  await expect(heading(page, 'Where do you live?')).toBeVisible();
});

test.describe('with nothing looked up', () => {
  // No IP lookup (no header) and a language without a region.
  test.use({ locale: 'en' });

  test('every country is listed, nothing chosen, and a choice is asked for', async ({
    page,
  }, testInfo) => {
    const person = newPerson(testInfo);
    await arriveAs(page, person);
    await signedUp(page, person);
    const all = await countryCount(page);

    await page.goto('/app/onboarding/country');
    await expect(heading(page, 'Where do you live?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Somewhere else' })).toHaveCount(0);
    await expect(country(page)).toHaveValue('');
    const list = await listed(page);
    expect(list.names).toHaveLength(all);
    expect(list.sorted).toBe(true);
    await expectSoundScreen(page, testInfo);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Choose where you live to carry on.')).toBeVisible();
    await country(page).selectOption({ label: 'Germany' });
    await expect(page.getByText('Totals in EUR')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(heading(page, 'Which is closest to you?')).toBeVisible();
    expect(await profileOf(page)).toMatchObject({ country: 'DE', onboardingState: 'segment' });
  });
});

test.describe('with no IP lookup but a regional language', () => {
  test.use({ locale: 'en-MY' });

  test('the language’s country is suggested instead (PRD §2.3 rule 2)', async ({
    page,
  }, testInfo) => {
    const person = newPerson(testInfo);
    await arriveAs(page, person);
    await signedUp(page, person);
    await page.goto('/app/onboarding/country');
    await expect(page.getByRole('button', { name: 'Malaysia' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText('Totals in MYR')).toBeVisible();
  });
});
