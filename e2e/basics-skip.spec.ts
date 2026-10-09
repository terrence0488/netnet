import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { recordProblems } from './accounts';
import { EMPTY_SNAPSHOT, mockPacks, mockSnapshot, SIGNED_IN } from './support';

/**
 * The basics' Skip, mocked (PRD J1): skipping after Yes saves nothing, clears the pending yes,
 * and moves to the next question — without the amount screen's own guard bouncing back to the
 * ask screen it just left. Runs without a database, unlike onboarding-basics.
 */

interface ChecklistItem {
  readonly id: string;
  readonly name: string;
  readonly ask: string;
  readonly amount: string;
}

/** A pack's checklist from content/, so no local wording lives in this spec (N10). */
function pack(key: string): ChecklistItem[] {
  const url = new URL(`../content/packs/${key}.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, 'utf8')) as { checklist: ChecklistItem[] }).checklist;
}

const GENERIC = pack('generic');
const SG = pack('sg');

function byId(items: readonly ChecklistItem[], id: string): ChecklistItem {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`The ${id} question is missing.`);
  return item;
}

const ME = { ...SIGNED_IN, onboardingState: 'basics' };

async function mockBasics(page: Page, key = 'generic') {
  let version = 1;
  await page.route('**/api/me', (route) => route.fulfill({ json: ME }));
  await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
  await mockSnapshot(page, { ...EMPTY_SNAPSHOT, packRef: [{ key, version: 1 }] });
  await mockPacks(page);
  await page.route('**/api/holdings', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    version += 1;
    return route.fulfill({
      json: { result: { id: `hld_${version}` }, dataVersion: version, warnings: [] },
    });
  });
}

const ask = (page: Page, item: ChecklistItem) =>
  expect(page.getByRole('heading', { level: 1, name: item.ask })).toBeVisible();

test('skipping on the amount screen moves to the next question, not back', async ({ page }) => {
  await mockBasics(page);
  const problems = recordProblems(page);
  const bank = byId(GENERIC, 'bank');
  const pension = byId(GENERIC, 'pension');
  const invest = byId(GENERIC, 'invest');
  await page.goto('/app/onboarding/basics');

  await ask(page, bank);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: bank.amount })).toBeVisible();
  await page.getByRole('textbox', { name: bank.name }).fill('5000');
  await page.getByRole('button', { name: 'Add' }).click();

  await ask(page, pension);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: pension.amount })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(page).toHaveURL(/\/app\/onboarding\/basics\/invest$/);
  await ask(page, invest);

  // Back returns to the skipped question, with nothing chosen.
  await page.getByRole('link', { name: 'Back' }).click();
  await ask(page, pension);
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(problems).toStrictEqual([]);
});

test('skipping on the ask screen after Back clears the pending yes too', async ({ page }) => {
  await mockBasics(page, 'sg');
  const problems = recordProblems(page);
  const bank = byId(SG, 'bank');
  const second = byId(SG, 'cpf');
  const third = byId(SG, 'invest');
  const home = byId(SG, 'home');
  const car = byId(SG, 'car');
  await page.goto('/app/onboarding/basics');

  await ask(page, bank);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.getByRole('textbox', { name: bank.name }).fill('5000');
  await page.getByRole('button', { name: 'Add' }).click();

  await ask(page, second);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: second.amount })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  await ask(page, third);
  await page.getByRole('button', { name: 'Skip' }).click();

  // Yes, then Back, then Skip: the pending yes is cleared, so the home loan is never asked.
  await ask(page, home);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: home.amount })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Skip' }).click();
  await ask(page, car);

  await page.getByRole('link', { name: 'Back' }).click();
  await ask(page, home);
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(problems).toStrictEqual([]);
});
