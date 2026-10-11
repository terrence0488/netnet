/// <reference lib="dom" />
import { expect, test, type Page, type Request } from '@playwright/test';
import { expectSoundScreen } from './accounts';
import { asSignedIn, mockSnapshot } from './support';

/**
 * Types and tags (PRD J2): added, renamed, merged and deleted from the web, with holdings
 * following every change; the Add form takes tags for assets and liabilities. Type labels follow
 * the real generic pack until renamed. All data is fictional.
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
];

const TAGS = [
  { id: 'tag_long', name: 'Long term', sort: 0 },
  { id: 'tag_joint', name: 'Joint', sort: 1 },
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

const ledger = (
  dataVersion: number,
  holdings: unknown[],
  values: Record<string, unknown>,
  over: Record<string, unknown> = {},
) => ({
  dataVersion,
  baseCurrency: 'SGD',
  packRef: [{ key: 'generic', version: 1 }],
  prefs: {},
  types: TYPES,
  tags: TAGS,
  holdings,
  values,
  ...over,
});

const written = (result: unknown, dataVersion: number) => ({ result, dataVersion, warnings: [] });

const HOLDINGS: Record<string, unknown>[] = [
  holdingRow({ id: 'hld_1', name: 'Everyday savings', tagIds: ['tag_long'] }),
  holdingRow({ id: 'hld_2', name: 'Flat', typeId: 'typ_prop' }),
  holdingRow({
    id: 'hld_3',
    name: 'Student loan',
    kind: 'liability',
    typeId: 'typ_loan',
    access: null,
  }),
];
const VALUES = {
  hld_1: [[today(), 125_000, 'SGD', 125_000, 'web', null, 'val_1']],
  hld_2: [[today(), 40_000_000, 'SGD', 40_000_000, 'web', null, 'val_2']],
  hld_3: [[today(), 40_000, 'SGD', 40_000, 'web', null, 'val_3']],
};

interface Posted {
  requests: Request[];
  bodies: Record<string, unknown>[];
}

/** The bodies POSTed or PATCHed to one API path. */
function captureWrites(page: Page, path: string): Posted {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (
      (request.method() === 'POST' || request.method() === 'PATCH') &&
      new URL(request.url()).pathname === path
    ) {
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

/** The URLs requested with DELETE. */
function captureDeletes(page: Page): URL[] {
  const urls: URL[] = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE') urls.push(new URL(request.url()));
  });
  return urls;
}

test.beforeEach(async ({ page }) => {
  await asSignedIn(page);
  await mockSnapshot(page, ledger(1, HOLDINGS, VALUES));
});

test('Account leads to types and tags, whose labels follow the pack', async ({ page }) => {
  await page.goto('/app/account');
  await page.getByRole('link', { name: 'Types and tags' }).click();
  await expect(page).toHaveURL(/\/app\/account\/taxonomy$/);

  await expect(page.getByRole('heading', { level: 1, name: 'Types and tags' })).toBeVisible();
  // Unrenamed, so the generic pack's labels: cash, property, loan.
  await expect(page.getByRole('button', { name: /Cash & savings/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Property/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Loan/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Long term/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Joint/ })).toBeVisible();
  // Each row says what follows it.
  await expect(page.getByRole('button', { name: /Cash & savings/ })).toContainText('1 holding');
});

test('a type renames from the web, and Home follows', async ({ page }) => {
  const writes = captureWrites(page, '/api/types/typ_cash');
  const renamed = TYPES.map((t) =>
    t.id === 'typ_cash' ? { ...t, customName: 'Spending money' } : t,
  );
  await page.route(
    (url) => url.pathname === '/api/types/typ_cash',
    async (route) => {
      await mockSnapshot(page, ledger(2, HOLDINGS, VALUES, { types: renamed }));
      await route.fulfill({ json: written(renamed[0], 2) });
    },
  );

  await page.goto('/app/account/taxonomy');
  await page.getByRole('button', { name: /Cash & savings/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Cash & savings' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill('Spending money');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  expect(writes.bodies).toStrictEqual([{ name: 'Spending money' }]);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Spending money/ })).toBeVisible();

  // The holding follows the rename.
  await page.goto('/app');
  await expect(page.getByRole('link', { name: /Everyday savings/ })).toContainText(
    'Spending money',
  );
});

test('a type deletes with moveTo, and its holdings move', async ({ page }) => {
  const deletes = captureDeletes(page);
  const moved = HOLDINGS.map((h) => (h.id === 'hld_2' ? { ...h, typeId: 'typ_cash' } : h));
  const kept = TYPES.filter((t) => t.id !== 'typ_prop');
  await page.route(
    (url) => url.pathname === '/api/types/typ_prop',
    async (route) => {
      await mockSnapshot(page, ledger(2, moved, VALUES, { types: kept }));
      await route.fulfill({ json: written(null, 2) });
    },
  );

  await page.goto('/app/account/taxonomy');
  await page.getByRole('button', { name: /Property/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Property' });
  await expect(dialog.getByText(/1 holding uses it/)).toBeVisible();
  await dialog.getByLabel('Move its holdings to').selectOption({ label: 'Cash & savings' });
  await dialog.getByRole('button', { name: 'Move and delete' }).click();

  expect(deletes).toHaveLength(1);
  expect(deletes[0]?.pathname).toBe('/api/types/typ_prop');
  expect(deletes[0]?.searchParams.get('moveTo')).toBe('typ_cash');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Property/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cash & savings/ })).toContainText('2 holdings');

  await page.goto('/app');
  await expect(page.getByRole('link', { name: /Flat/ })).toContainText('Cash & savings');
});

test('a type adds from the web, and the Add form offers it', async ({ page }) => {
  const writes = captureWrites(page, '/api/types');
  const added = {
    id: 'typ_hol',
    universal: 'listed',
    packTypeKey: null,
    customName: 'Holiday fund',
    sort: 3,
    archived: false,
  };
  await page.route(
    (url) => url.pathname === '/api/types',
    async (route) => {
      await mockSnapshot(page, ledger(2, HOLDINGS, VALUES, { types: [...TYPES, added] }));
      await route.fulfill({ json: written(added, 2) });
    },
  );

  await page.goto('/app/account/taxonomy');
  await page.getByRole('button', { name: '+ Add New Type', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New type' });
  await dialog.getByLabel('Name').fill('Holiday fund');
  await dialog.getByLabel('It means').selectOption({ label: 'Investments' });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  expect(writes.bodies).toStrictEqual([{ name: 'Holiday fund', universal: 'listed' }]);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Holiday fund/ })).toBeVisible();

  await page.goto('/app/add');
  await expect(page.getByRole('heading', { level: 1, name: 'New Asset' })).toBeVisible();
  const types = await page.getByLabel('Type').locator('option').allTextContents();
  expect(types).toContain('Holiday fund');
});

test('a tag adds and renames from the web', async ({ page }) => {
  const posts = captureWrites(page, '/api/tags');
  const patches = captureWrites(page, '/api/tags/tag_long');
  const added = { id: 'tag_rain', name: 'Rainy day', sort: 2 };
  await page.route(
    (url) => url.pathname === '/api/tags',
    async (route) => {
      await mockSnapshot(page, ledger(2, HOLDINGS, VALUES, { tags: [...TAGS, added] }));
      await route.fulfill({ json: written(added, 2) });
    },
  );
  const renamed = TAGS.map((t) => (t.id === 'tag_long' ? { ...t, name: 'Forever money' } : t));
  await page.route(
    (url) => url.pathname === '/api/tags/tag_long',
    async (route) => {
      await mockSnapshot(page, ledger(3, HOLDINGS, VALUES, { tags: [...renamed, added] }));
      await route.fulfill({ json: written(renamed[0], 3) });
    },
  );

  await page.goto('/app/account/taxonomy');
  await page.getByRole('button', { name: '+ Add New Tag', exact: true }).click();
  const addDialog = page.getByRole('dialog', { name: 'New tag' });
  await addDialog.getByLabel('Name').fill('Rainy day');
  await addDialog.getByRole('button', { name: 'Save', exact: true }).click();
  expect(posts.bodies).toStrictEqual([{ name: 'Rainy day' }]);
  await expect(addDialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Rainy day/ })).toBeVisible();

  await page.getByRole('button', { name: /Long term/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Long term' });
  await dialog.getByLabel('Name').fill('Forever money');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  expect(patches.bodies).toStrictEqual([{ name: 'Forever money' }]);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Forever money/ })).toBeVisible();
});

test('a tag deletes, or merges into another with mergeInto', async ({ page }) => {
  const deletes = captureDeletes(page);
  const merged = HOLDINGS.map((h) => (h.id === 'hld_1' ? { ...h, tagIds: ['tag_joint'] } : h));
  await page.route(
    (url) => url.pathname === '/api/tags/tag_long',
    async (route) => {
      await mockSnapshot(
        page,
        ledger(2, merged, VALUES, { tags: TAGS.filter((t) => t.id !== 'tag_long') }),
      );
      await route.fulfill({ json: written(null, 2) });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/tags/tag_joint',
    async (route) => {
      await mockSnapshot(
        page,
        ledger(
          3,
          HOLDINGS.map((h) => ({ ...h, tagIds: [] })),
          VALUES,
          {
            tags: TAGS.filter((t) => t.id !== 'tag_long' && t.id !== 'tag_joint'),
          },
        ),
      );
      await route.fulfill({ json: written(null, 3) });
    },
  );

  await page.goto('/app/account/taxonomy');
  await page.getByRole('button', { name: /Long term/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Long term' });
  await expect(dialog.getByText(/1 holding carries it/)).toBeVisible();
  await dialog.getByLabel('Carry this tag instead').selectOption({ label: 'Joint' });
  await dialog.getByRole('button', { name: 'Merge and delete' }).click();

  expect(deletes).toHaveLength(1);
  expect(deletes[0]?.searchParams.get('mergeInto')).toBe('tag_joint');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /Long term/ })).toHaveCount(0);
  // The holding carries Joint instead.
  await expect(page.getByRole('button', { name: /Joint/ })).toContainText('1 holding');

  await page.getByRole('button', { name: /Joint/ }).click();
  const plain = page.getByRole('dialog', { name: 'Joint' });
  await plain.getByRole('button', { name: 'Delete tag' }).click();
  expect(deletes).toHaveLength(2);
  expect(deletes[1]?.pathname).toBe('/api/tags/tag_joint');
  expect(deletes[1]?.searchParams.get('mergeInto')).toBeNull();
  await expect(plain).toBeHidden();
  await expect(page.getByRole('button', { name: '+ Add New Tag', exact: true })).toBeVisible();
});

test('a taken tag name is refused in plain language', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/tags',
    (route) =>
      route.fulfill({
        status: 400,
        json: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'A tag with this name already exists.',
            fields: { name: 'A tag with this name already exists ("tag_long"): use it.' },
          },
        },
      }),
  );

  await page.goto('/app/account/taxonomy');
  await page.getByRole('button', { name: '+ Add New Tag', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New tag' });
  await dialog.getByLabel('Name').fill('Long term');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText('Another tag already has this name.')).toBeVisible();
});

test('the Add form takes tags for an asset', async ({ page }) => {
  const posts = captureWrites(page, '/api/holdings');
  await page.route('**/api/holdings', (route) =>
    route.fulfill({ json: written(holdingRow({ id: 'hld_9', name: 'Brokerage' }), 2) }),
  );

  await page.goto('/app/add');
  await page.getByLabel('Asset Name').fill('Brokerage');
  await page.getByLabel('Asset Value').fill('50000');
  const chips = page.getByRole('group', { name: 'Tags' });
  await expect(chips.getByRole('button', { name: 'Long term' })).toBeVisible();
  await chips.getByRole('button', { name: 'Joint' }).click();
  await expect(chips.getByRole('button', { name: 'Joint' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(posts.bodies).toHaveLength(1);
  expect(posts.bodies[0]).toMatchObject({ tagIds: ['tag_joint'] });
});

test('the Add form takes tags for a liability', async ({ page }) => {
  const posts = captureWrites(page, '/api/holdings');
  await page.route('**/api/holdings', (route) =>
    route.fulfill({ json: written(holdingRow({ id: 'hld_9', name: 'Car loan' }), 2) }),
  );

  await page.goto('/app/add');
  await page.getByRole('button', { name: 'Liability', exact: true }).click();
  await page.getByLabel('Liability Name').fill('Car loan');
  await page.getByLabel('Liability Value').fill('12000');
  const chips = page.getByRole('group', { name: 'Tags' });
  await chips.getByRole('button', { name: 'Long term' }).click();
  await chips.getByRole('button', { name: 'Joint' }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(posts.bodies).toHaveLength(1);
  expect(posts.bodies[0]).toMatchObject({ kind: 'liability', tagIds: ['tag_joint', 'tag_long'] });
});

test('the Add form keeps its Tags row while there are none, leading to Types and tags', async ({
  page,
}) => {
  await mockSnapshot(page, ledger(1, [], {}, { tags: [] }));
  await page.goto('/app/add');
  await expect(page.getByRole('heading', { level: 1, name: 'New Asset' })).toBeVisible();
  await expect(page.getByText('Tags', { exact: true })).toBeVisible();
  await expect(page.getByText('No tags yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Liability', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New Liability' })).toBeVisible();
  await expect(page.getByText('No tags yet.')).toBeVisible();

  await page.getByRole('link', { name: 'Add tags' }).click();
  await expect(page).toHaveURL(/\/app\/account\/taxonomy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Types and tags' })).toBeVisible();
});

test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
  await page.goto('/app/account/taxonomy');
  await expect(page.getByRole('heading', { level: 1, name: 'Types and tags' })).toBeVisible();
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: /Cash & savings/ }).click();
  await expect(page.getByRole('dialog', { name: 'Cash & savings' })).toBeVisible();
  await expectSoundScreen(page, testInfo);
});
