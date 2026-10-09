/// <reference lib="dom" />
import { expect, test, type Page, type Request } from '@playwright/test';
import { expectSoundScreen } from './accounts';
import { asSignedIn, mockSnapshot } from './support';

/**
 * Add (PRD J2): an asset or a liability with a value in any currency, accessibility settled by a
 * fact, a default or "Not sure". Types, questions and reasons come from the real generic pack.
 * All data is fictional.
 */
test.use({ timezoneId: 'UTC' });

const today = () => new Date().toISOString().slice(0, 10);

const TYPES = [
  {
    id: 'typ_cash',
    universal: 'cash',
    packTypeKey: null,
    customName: null,
    sort: 0,
    archived: false,
  },
  {
    id: 'typ_prop',
    universal: 'property',
    packTypeKey: null,
    customName: null,
    sort: 1,
    archived: false,
  },
  {
    id: 'typ_loan',
    universal: 'loan',
    packTypeKey: null,
    customName: null,
    sort: 2,
    archived: false,
  },
  {
    id: 'typ_card',
    universal: 'card',
    packTypeKey: null,
    customName: null,
    sort: 3,
    archived: false,
  },
];

const holdingRow = (over: Record<string, unknown>) => ({
  kind: 'asset',
  typeId: 'typ_cash',
  currency: 'SGD',
  cadenceDays: null,
  archived: false,
  archivedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  rowVersion: 1,
  access: 'accessible',
  accessReason: null,
  accessUntil: null,
  accessBasis: null,
  tagIds: [],
  ...over,
});

const ledger = (dataVersion: number, holdings: unknown[], values: Record<string, unknown>) => ({
  dataVersion,
  baseCurrency: 'SGD',
  packRef: [{ key: 'generic', version: 1 }],
  prefs: {},
  types: TYPES,
  tags: [],
  holdings,
  values,
});

const written = (result: unknown, dataVersion: number, warnings: unknown[] = []) => ({
  result,
  dataVersion,
  warnings,
});

interface Posted {
  requests: Request[];
  bodies: Record<string, unknown>[];
}

function capturePosts(page: Page): Posted {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/holdings') {
      requests.push(request);
    }
  });
  return {
    requests,
    get bodies() {
      return requests.map((r) => r.postDataJSON() as Record<string, unknown>);
    },
  };
}

test.beforeEach(async ({ page }) => {
  await asSignedIn(page);
  await mockSnapshot(page, ledger(1, [], {}));
});

test('adds an asset with its default stated, and Home totals the one holding', async ({ page }) => {
  const posts = capturePosts(page);
  const saved = ledger(2, [holdingRow({ id: 'hld_1', name: 'Everyday savings' })], {
    hld_1: [[today(), 125_000, 'SGD', 125_000, 'web', null, 'val_1']],
  });
  await page.route('**/api/holdings', async (route) => {
    await mockSnapshot(page, saved);
    await route.fulfill({
      json: written(
        holdingRow({
          id: 'hld_1',
          name: 'Everyday savings',
          accessBasis: {
            via: 'default',
            pack: 'generic',
            pack_version: 1,
            question: null,
            answer: null,
          },
        }),
        2,
      ),
    });
  });

  await page.goto('/app/add');
  await expect(page.getByRole('heading', { level: 1, name: 'New Asset' })).toBeVisible();
  await expect(page.getByLabel('Currency')).toHaveValue('SGD');
  await expect(page.getByLabel('As of')).toHaveValue(today());
  // The default, stated with its reason — nothing asked.
  await expect(page.getByText(/it’s money in the bank/)).toBeVisible();
  await expect(page.getByText(/Counts toward the /)).toBeVisible();

  await page.getByLabel('Asset Name').fill('Everyday savings');
  await page.getByLabel('Asset Value').fill('1250');
  // The consequence previews in money as the amount is typed.
  await expect(page.getByText(/Counts toward the /)).toContainText('$1,250');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('$1,250').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Everyday savings/ })).toBeVisible();

  expect(posts.bodies).toHaveLength(1);
  expect(posts.bodies[0]).toStrictEqual({
    name: 'Everyday savings',
    kind: 'asset',
    typeId: 'typ_cash',
    currency: 'SGD',
    opening: { amount: '1250', date: today() },
    via: 'form',
  });
});

test('a fact question, “Not sure”, and asking the agent instead of deciding', async ({ page }) => {
  const posts = capturePosts(page);
  await page.route('**/api/holdings', (route) =>
    route.fulfill({ json: written(holdingRow({ id: 'hld_1', name: 'Flat' }), 2) }),
  );

  await page.goto('/app/add');
  await page.getByLabel('Asset Name').fill('Flat');
  await page.getByLabel('Type').selectOption({ label: 'Property' });
  await expect(page.getByText('Do you live in it?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not sure' })).toBeVisible();

  await page.getByRole('button', { name: 'Not sure' }).click();
  await expect(page.getByText(/until you decide/)).toBeVisible();
  await expect(page.getByText(/Saving is fine as it is/)).toBeVisible();

  await page.getByRole('button', { name: 'Ask your agent' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ask your agent' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/I’m adding “Flat” to NetNet/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Connect your agent' })).toHaveAttribute(
    'href',
    '/app/agent/connect?entry=home',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel('Asset Value').fill('300000');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(posts.bodies).toHaveLength(1);
  expect(posts.bodies[0]).toMatchObject({ access: 'not_sure', via: 'form' });
});

test('a liability contributes negatively, with no accessibility question', async ({ page }) => {
  await mockSnapshot(
    page,
    ledger(2, [holdingRow({ id: 'hld_1', name: 'Everyday savings' })], {
      hld_1: [[today(), 125_000, 'SGD', 125_000, 'web', null, 'val_1']],
    }),
  );
  const posts = capturePosts(page);
  const saved = ledger(
    3,
    [
      holdingRow({ id: 'hld_1', name: 'Everyday savings' }),
      holdingRow({
        id: 'hld_2',
        name: 'Student loan',
        kind: 'liability',
        typeId: 'typ_loan',
        access: null,
      }),
    ],
    {
      hld_1: [[today(), 125_000, 'SGD', 125_000, 'web', null, 'val_1']],
      hld_2: [[today(), 40_000, 'SGD', 40_000, 'web', null, 'val_2']],
    },
  );
  await page.route('**/api/holdings', async (route) => {
    await mockSnapshot(page, saved);
    await route.fulfill({ json: written(holdingRow({ id: 'hld_2', name: 'Student loan' }), 3) });
  });

  await page.goto('/app/add');
  await page.getByRole('button', { name: 'Liability', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New Liability' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask your agent' })).toHaveCount(0);
  const types = await page.getByLabel('Type').locator('option').allTextContents();
  expect(types).toStrictEqual(['Loan', 'Credit card']);

  await page.getByLabel('Liability Name').fill('Student loan');
  await page.getByLabel('Liability Value').fill('400');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  // Net worth = assets − liabilities: $1,250 − $400.
  await expect(page.getByText('$850').first()).toBeVisible();

  expect(posts.bodies).toHaveLength(1);
  expect(posts.bodies[0]).toMatchObject({ kind: 'liability', typeId: 'typ_loan', via: 'form' });
  expect(posts.bodies[0]).not.toHaveProperty('access');
});

test('a foreign value hides its rate and shows the original on Home', async ({ page }) => {
  const posts = capturePosts(page);
  const saved = ledger(2, [holdingRow({ id: 'hld_1', name: 'Brokerage', currency: 'USD' })], {
    hld_1: [[today(), 5_000_000, 'USD', 6_750_000, 'web', null, 'val_1']],
  });
  await page.route('**/api/holdings', async (route) => {
    await mockSnapshot(page, saved);
    await route.fulfill({ json: written(holdingRow({ id: 'hld_1', name: 'Brokerage' }), 2) });
  });

  await page.goto('/app/add');
  await page.getByLabel('Asset Name').fill('Brokerage');
  await page.getByLabel('Currency').selectOption('USD');
  await page.getByLabel('Asset Value').fill('50000');
  // No rate on screen, and the preview leaves the amount out rather than converting it twice.
  await expect(page.getByText('Counts toward what you could use this month')).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  const row = page.getByRole('link', { name: /Brokerage/ });
  await expect(row).toContainText('$50,000 USD');
  await expect(row).toContainText('$67,500');

  expect(posts.bodies[0]).toMatchObject({
    currency: 'USD',
    opening: { amount: '50000', date: today() },
  });
});

test('a name and an amount are needed; anything else waits for the server', async ({ page }) => {
  const posts = capturePosts(page);
  await page.goto('/app/add');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Give it a name.')).toBeVisible();
  expect(posts.requests).toHaveLength(0);

  await page.getByLabel('Asset Name').fill('Everyday savings');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Enter a value.')).toBeVisible();
  expect(posts.requests).toHaveLength(0);

  await page.getByLabel('Asset Value').fill('12.345');
  await expect(page.getByText('Use at most 2 decimal places.')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(posts.requests).toHaveLength(0);
});

test('a likely duplicate names its candidates, or saves anyway', async ({ page }) => {
  const posts = capturePosts(page);
  let tries = 0;
  await page.route('**/api/holdings', (route) => {
    tries += 1;
    if (tries === 1) {
      return route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'LIKELY_DUPLICATE',
            message: 'This looks like a holding already tracked (candidates).',
            candidates: [{ id: 'hld_old', name: 'Old savings', latest: null }],
          },
        },
      });
    }
    return route.fulfill({ json: written(holdingRow({ id: 'hld_1', name: 'Old savings' }), 2) });
  });

  await page.goto('/app/add');
  await page.getByLabel('Asset Name').fill('Old savings');
  await page.getByLabel('Asset Value').fill('100');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText(/already track/)).toBeVisible();
  const candidate = page.getByRole('link', { name: 'Old savings' });
  await expect(candidate).toHaveAttribute('href', '/app/holdings/hld_old');

  await page.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(posts.bodies).toHaveLength(2);
  expect(posts.bodies[1]).toMatchObject({ allowDuplicate: true });
});

test('a back-dated opening value is accepted', async ({ page }) => {
  const posts = capturePosts(page);
  await page.route('**/api/holdings', (route) =>
    route.fulfill({ json: written(holdingRow({ id: 'hld_1', name: 'Everyday savings' }), 2) }),
  );

  await page.goto('/app/add');
  await page.getByLabel('Asset Name').fill('Everyday savings');
  await page.getByLabel('Asset Value').fill('1250');
  await page.getByLabel('As of').fill('2025-06-15');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(posts.bodies[0]).toMatchObject({ opening: { amount: '1250', date: '2025-06-15' } });
});

test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
  await page.goto('/app/add');
  await expect(page.getByRole('heading', { level: 1, name: 'New Asset' })).toBeVisible();
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: 'Ask your agent' }).click();
  await expect(page.getByRole('dialog', { name: 'Ask your agent' })).toBeVisible();
  await expectSoundScreen(page, testInfo);
});
