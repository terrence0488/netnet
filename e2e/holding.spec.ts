/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectSoundScreen } from './accounts';
import { asSignedIn, mockSnapshot } from './support';

/**
 * The holding page (PRD J2, J3, J4): the latest value, the trend with the change over the
 * baseline, the history newest first, a new value, changed accessibility, corrected and deleted
 * values, archive and delete, tags, and the connect flow. All data is fictional.
 */
test.use({ timezoneId: 'UTC' });

const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
const today = () => day(0);

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
    id: 'typ_listed',
    universal: 'listed',
    packTypeKey: null,
    customName: null,
    sort: 1,
    archived: false,
  },
  {
    id: 'typ_prop',
    universal: 'property',
    packTypeKey: null,
    customName: null,
    sort: 2,
    archived: false,
  },
];

const holdingRow = (over: Record<string, unknown>) => ({
  kind: 'asset',
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

const valueRow = (over: Record<string, unknown>) => ({
  amountMinor: 100_000,
  currency: 'SGD',
  baseMinor: 100_000,
  baseCurrency: 'SGD',
  fxRate: '1',
  fxRateDate: null,
  fxSource: 'same',
  source: 'web',
  clientName: null,
  connectionId: null,
  batchId: null,
  enteredAt: '2026-09-20T12:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  rowVersion: 1,
  ...over,
});

const BROKER = holdingRow({
  id: 'hld_broker',
  name: 'Brokerage account',
  typeId: 'typ_listed',
  currency: 'USD',
  accessReason: 'listed investments can be sold within days',
});
const FLAT = holdingRow({
  id: 'hld_flat',
  name: 'Riverside flat',
  typeId: 'typ_prop',
  access: 'undecided',
  accessBasis: {
    via: 'undecided',
    pack: 'generic',
    pack_version: 1,
    question: 'property',
    answer: 'not_sure',
  },
});

const LEDGER = {
  dataVersion: 4,
  baseCurrency: 'SGD',
  packRef: [{ key: 'generic', version: 1 }],
  prefs: {},
  types: TYPES,
  tags: [{ id: 'tag_1', name: 'Retirement', sort: 0 }],
  holdings: [BROKER, FLAT],
  values: {
    hld_broker: [
      [day(30), 4_800_000, 'USD', 6_400_000, 'web', null, 'val_old'],
      [day(1), 5_000_000, 'USD', 6_750_000, 'agent', 'Claude', 'val_new'],
    ],
    hld_flat: [[day(3), 30_000_000, 'SGD', 30_000_000, 'web', null, 'val_flat']],
  },
};

const BROKER_VALUES = {
  items: [
    valueRow({
      id: 'val_new',
      holdingId: 'hld_broker',
      date: day(1),
      amountMinor: 5_000_000,
      currency: 'USD',
      baseMinor: 6_750_000,
      fxRate: '1.35',
      fxRateDate: day(1),
      fxSource: 'ecb',
      source: 'agent',
      clientName: 'Claude',
      connectionId: 'con_1',
      enteredAt: `${day(1)}T12:00:00.000Z`,
      updatedAt: `${day(1)}T12:00:00.000Z`,
    }),
    valueRow({
      id: 'val_old',
      holdingId: 'hld_broker',
      date: day(30),
      amountMinor: 4_800_000,
      currency: 'USD',
      baseMinor: 6_400_000,
      fxRate: '1.3333',
      fxRateDate: day(30),
      fxSource: 'ecb',
      enteredAt: new Date(Date.now() - 30_000).toISOString(),
      updatedAt: new Date(Date.now() - 30_000).toISOString(),
    }),
  ],
  nextCursor: null,
};

const CLAUDE_GUIDE = {
  id: 'claude',
  name: 'Claude',
  listed: true,
  order: 1,
  platforms: {
    phone: { steps: [{ text: 'In the Claude app, open **Settings → Connectors**.' }] },
    computer: { steps: [{ text: 'In Claude, open **Settings → Connectors**.' }] },
  },
};

const OTHER_GUIDE = {
  id: 'other',
  name: 'Other agent',
  listed: true,
  order: 3,
  platforms: {
    any: { steps: [{ text: 'In your agent’s settings, add a **custom connector**.' }] },
  },
};

/** The setup guides as administered content, so the connect flow can start. */
async function mockGuides(page: Page) {
  await page.route('**/api/content/current', (route) =>
    route.fulfill({ json: { agent: { claude: 1, other: 1 } } }),
  );
  await page.route('**/api/content/agent/*', (route) => {
    const key = new URL(route.request().url()).pathname.split('/').pop()?.split('@')[0];
    return route.fulfill({ json: key === 'claude' ? CLAUDE_GUIDE : OTHER_GUIDE });
  });
}

async function mockHolding(page: Page) {
  await asSignedIn(page);
  await mockSnapshot(page, LEDGER);
  await page.route('**/api/holdings/hld_broker/values*', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: BROKER_VALUES });
    return route.fallback();
  });
  await page.route('**/api/holdings/hld_flat/values*', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          items: [
            valueRow({
              id: 'val_flat',
              holdingId: 'hld_flat',
              date: day(3),
              amountMinor: 30_000_000,
              baseMinor: 30_000_000,
            }),
          ],
          nextCursor: null,
        },
      });
    }
    return route.fallback();
  });
}

test.beforeEach(async ({ page }) => {
  await mockHolding(page);
});

test('the latest value with its consequence, and the history newest first', async ({ page }) => {
  await page.goto('/app/holdings/hld_broker');
  await expect(page.getByRole('heading', { level: 1, name: 'Brokerage account' })).toBeVisible();
  await expect(page.getByText('Investments · USD')).toBeVisible();
  await expect(page.getByText('$67,500').first()).toBeVisible();
  await expect(page.getByText(/Counts toward what you could use this month/)).toBeVisible();
  await expect(page.getByText(/listed investments can be sold within days/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask your agent' })).toHaveCount(0);

  await expect(page.getByRole('heading', { level: 2, name: 'History · 2' })).toBeVisible();
  const rows = page.getByRole('button', { expanded: false }).filter({ hasText: /\$/ });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('$67,500');
  await expect(rows.nth(1)).toContainText('$64,000');
  await expect(rows.nth(0)).toHaveAttribute('data-agent-written', 'true');
  await expect(rows.nth(1)).not.toHaveAttribute('data-agent-written', 'true');
});

test('opening a value names its writer, once, with no rate and no repeated amounts', async ({
  page,
}) => {
  await page.goto('/app/holdings/hld_broker');
  const collapsed = page.getByRole('button', { expanded: false }).filter({ hasText: /\$/ });
  await expect(collapsed).toHaveCount(2);
  await collapsed.nth(0).click();
  await expect(page.getByRole('button', { expanded: true })).toHaveCount(1);

  await expect(page.locator('main').getByText(/Added .+ by Claude/)).toBeVisible();
  // The original currency twice (the hero's meta, and the opened value), each figure once per
  // place: the original only in the panel, the base in the hero and the row, nowhere else. Visible
  // text only: the closed sheets stay in the page, hidden.
  const body = await page.locator('main').innerText();
  expect(body?.match(/USD/g)?.length).toBe(2);
  expect(body?.match(/\$50,000/g)?.length).toBe(1);
  expect(body?.match(/\$67,500/g)?.length).toBe(2);
  expect(body).not.toMatch(/rate|1 USD =/i);
  expect(body).not.toContain('(agent)');

  await page.getByRole('button', { expanded: false }).filter({ hasText: /\$/ }).first().click();
  await expect(page.getByText('Added just now by you')).toBeVisible();
});

test('adds a value from the floating Update, warning when it replaces the same date', async ({
  page,
}) => {
  let gets = 0;
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/api/holdings/hld_broker/values')) {
      gets += 1;
    }
  });
  let post: Record<string, unknown> | undefined;
  await page.route('**/api/holdings/hld_broker/values', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    post = route.request().postDataJSON() as Record<string, unknown>;
    await mockSnapshot(page, { ...LEDGER, dataVersion: 5 });
    return route.fulfill({
      json: {
        result: valueRow({ id: 'val_today', holdingId: 'hld_broker', date: today() }),
        dataVersion: 5,
        warnings: [{ code: 'SAME_DATE_REPLACED', message: 'A value already sat on that date.' }],
      },
    });
  });

  await page.goto('/app/holdings/hld_broker');
  const fab = page.getByRole('button', { name: 'Update' });
  await expect(fab).toBeVisible();
  await fab.click();

  const dialog = page.getByRole('dialog', { name: 'Add Value' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Currency')).toHaveValue('USD');
  await expect(dialog.getByLabel('As of')).toHaveValue(today());
  await dialog.getByLabel('Asset Value').fill('60000');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText(/replaces the value already saved for/)).toBeVisible();
  expect(post).toStrictEqual({ amount: '60000', date: today(), currency: 'USD' });
  expect(gets).toBeGreaterThanOrEqual(2);
});

test('a back-dated value is accepted', async ({ page }) => {
  let post: Record<string, unknown> | undefined;
  await page.route('**/api/holdings/hld_broker/values', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    post = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({
      json: {
        result: valueRow({ id: 'val_old2', holdingId: 'hld_broker', date: '2025-06-15' }),
        dataVersion: 5,
        warnings: [],
      },
    });
  });

  await page.goto('/app/holdings/hld_broker');
  await page.getByRole('button', { name: 'Update' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Value' });
  await dialog.getByLabel('Asset Value').fill('48000');
  await dialog.getByLabel('As of').fill('2025-06-15');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(post).toStrictEqual({ amount: '48000', date: '2025-06-15', currency: 'USD' });
});

test('decides the undecided, or asks the agent', async ({ page }) => {
  let patch: Record<string, unknown> | undefined;
  await page.route('**/api/holdings/hld_flat', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    patch = route.request().postDataJSON() as Record<string, unknown>;
    const locked = {
      ...FLAT,
      access: 'locked',
      accessReason: 'it’s your home',
      accessBasis: {
        via: 'answer',
        pack: 'generic',
        pack_version: 1,
        question: 'property',
        answer: 'yes',
      },
    };
    await mockSnapshot(page, { ...LEDGER, dataVersion: 5, holdings: [BROKER, locked] });
    return route.fulfill({ json: { result: locked, dataVersion: 5, warnings: [] } });
  });

  await page.goto('/app/holdings/hld_flat');
  await expect(page.getByText(/until you decide/)).toBeVisible();
  await page.getByRole('button', { name: 'Decide', exact: true }).click();

  const sheet = page.getByRole('dialog', { name: 'Riverside flat' });
  await expect(sheet.getByText('Do you live in it?')).toBeVisible();
  await sheet.getByRole('button', { name: 'Yes, it’s my home' }).click();
  await expect(sheet.getByText(/it’s your home/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText(/it’s your home/).first()).toBeVisible();
  expect(patch).toStrictEqual({ access: 'yes' });

  // Decided holdings keep Change but lose the ask link on the hero.
  await expect(page.getByRole('button', { name: 'Ask your agent' })).toHaveCount(0);
});

test('asking the agent about a saved holding names it, with no financial data', async ({
  page,
  context,
}) => {
  await page.goto('/app/holdings/hld_flat');
  await page.getByRole('button', { name: 'Ask your agent' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ask your agent' });
  await expect(dialog.getByText(/Look at my “Riverside flat” in NetNet/)).toBeVisible();

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', { name: 'Copy' }).click();
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  expect(pasted).toContain('Riverside flat');
  expect(pasted).not.toMatch(/[\d$€£¥]/);
});

test('pages older values on', async ({ page }) => {
  await page.unroute('**/api/holdings/hld_broker/values*');
  await page.route('**/api/holdings/hld_broker/values*', (route) => {
    const url = new URL(route.request().url());
    const second = url.searchParams.get('cursor') === 'older';
    return route.fulfill({
      json: second
        ? {
            items: [valueRow({ id: 'val_ancient', holdingId: 'hld_broker', date: '2025-01-15' })],
            nextCursor: null,
          }
        : { items: BROKER_VALUES.items, nextCursor: 'older' },
    });
  });

  await page.goto('/app/holdings/hld_broker');
  const rows = page.getByRole('button', { expanded: false }).filter({ hasText: /\$/ });
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Show older values' }).click();
  await expect(rows).toHaveCount(3);
});

test('the trend, the change over the baseline, and the staleness', async ({ page }) => {
  await page.goto('/app/holdings/hld_broker');
  await expect(page.getByRole('heading', { level: 2, name: 'Trend' })).toBeVisible();
  await expect(page.getByTestId('trend-chart')).toBeVisible();
  await expect(page.getByText('Last month')).toBeVisible();
  await expect(page.getByText('+$3,500')).toBeVisible();
  await expect(page.getByText('(+5.5%)')).toBeVisible();
  await expect(page.getByText('Updated yesterday')).toBeVisible();
});

test('edits a value’s amount, date and currency', async ({ page }) => {
  let patch: Record<string, unknown> | undefined;
  await page.route('**/api/values/val_new', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    patch = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({
      json: {
        result: valueRow({ id: 'val_new', holdingId: 'hld_broker', date: day(1) }),
        dataVersion: 5,
        warnings: [],
      },
    });
  });

  await page.goto('/app/holdings/hld_broker');
  const rows = page.getByRole('button', { expanded: false }).filter({ hasText: /\$/ });
  await rows.nth(0).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Value' });
  await expect(dialog.getByLabel('Asset Value')).toHaveValue('50000.00');
  await expect(dialog.getByLabel('Currency')).toHaveValue('USD');
  await expect(dialog.getByLabel('As of')).toHaveValue(day(1));
  await dialog.getByLabel('Asset Value').fill('51000');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(patch).toStrictEqual({ amount: '51000', date: day(1), currency: 'USD' });
});

test('deletes a value only after it asks', async ({ page }) => {
  let deletes = 0;
  await page.route('**/api/values/val_old', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deletes += 1;
    return route.fulfill({ json: { result: null, dataVersion: 5, warnings: [] } });
  });

  await page.goto('/app/holdings/hld_broker');
  const rows = page.getByRole('button', { expanded: false }).filter({ hasText: /\$/ });
  await rows.nth(1).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Delete this value?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByText('Delete this value?')).toBeHidden();
  expect(deletes).toBe(0);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete value' }).click();
  await expect(page.getByText('Deleted.')).toBeVisible();
  expect(deletes).toBe(1);
});

test('archives and unarchives the holding', async ({ page }) => {
  const patches: unknown[] = [];
  await page.route('**/api/holdings/hld_broker', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON() as { archived: boolean };
    patches.push(body);
    const row = {
      ...BROKER,
      archived: body.archived,
      archivedAt: body.archived ? '2026-10-01T00:00:00.000Z' : null,
    };
    await mockSnapshot(page, { ...LEDGER, dataVersion: 5, holdings: [row, FLAT] });
    return route.fulfill({ json: { result: row, dataVersion: 5, warnings: [] } });
  });

  await page.goto('/app/holdings/hld_broker');
  await page.getByRole('button', { name: 'Archive holding' }).click();
  await expect(page.getByText('Archived.', { exact: true })).toBeVisible();
  await expect(page.getByText('Archived · Investments · USD')).toBeVisible();
  await page.getByRole('button', { name: 'Unarchive holding' }).click();
  await expect(page.getByText('Unarchived.', { exact: true })).toBeVisible();
  expect(patches).toStrictEqual([{ archived: true }, { archived: false }]);
});

test('deletes the holding only after it asks, then leaves for Home', async ({ page }) => {
  let deletes = 0;
  await page.route('**/api/holdings/hld_broker', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deletes += 1;
    return route.fulfill({ json: { result: null, dataVersion: 5, warnings: [] } });
  });

  await page.goto('/app/holdings/hld_broker');
  await page.getByRole('button', { name: 'Delete holding' }).click();
  await expect(page.getByText(/Brokerage account” and its 2 values go/)).toBeVisible();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByText(/and its 2 values go/)).toBeHidden();
  expect(deletes).toBe(0);

  await page.getByRole('button', { name: 'Delete holding' }).click();
  await page.getByRole('button', { name: 'Delete holding' }).click();
  await expect(page.getByText('Deleted.')).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  expect(deletes).toBe(1);
});

test('assigns tags to the holding', async ({ page }) => {
  let patch: Record<string, unknown> | undefined;
  await page.route('**/api/holdings/hld_broker', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    patch = route.request().postDataJSON() as Record<string, unknown>;
    const row = { ...BROKER, tagIds: ['tag_1'] };
    await mockSnapshot(page, { ...LEDGER, dataVersion: 5, holdings: [row, FLAT] });
    return route.fulfill({ json: { result: row, dataVersion: 5, warnings: [] } });
  });

  await page.goto('/app/holdings/hld_broker');
  await expect(page.getByText('No tags')).toBeVisible();
  await page.getByRole('button', { name: 'Edit tags' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tags' });
  const chip = dialog.getByRole('button', { name: 'Retirement' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Saved.')).toBeVisible();
  expect(patch).toStrictEqual({ tagIds: ['tag_1'] });
  await expect(page.getByText('No tags')).toBeHidden();
  await expect(page.locator('main').getByText('Retirement')).toBeVisible();
});

test('the connect flow starts here with the holding entry', async ({ page }) => {
  await mockGuides(page);
  let post: Record<string, unknown> | undefined;
  await page.route('**/api/agent/attempts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    post = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 201, json: { id: 'att_1', state: 'started' } });
  });
  await page.route('**/api/agent/attempts/*', (route) =>
    route.fulfill({ json: { id: 'att_1', state: 'started' } }),
  );

  await page.goto('/app/holdings/hld_flat');
  await page.getByRole('button', { name: 'Ask your agent' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ask your agent' });
  const connect = dialog.getByRole('link', { name: 'Connect your agent' });
  await expect(connect).toHaveAttribute(
    'href',
    '/app/agent/connect?entry=holding&holding=hld_flat',
  );
  await connect.click();

  await expect(page).toHaveURL(/\/agent\/connect\?entry=holding&holding=hld_flat/);
  await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute(
    'href',
    '/app/holdings/hld_flat',
  );
  await page.getByRole('link', { name: 'Claude' }).click();
  await expect(page.getByText(/Waiting for Claude/)).toBeVisible();
  expect(post).toMatchObject({ client: 'claude', entry: 'holding' });
});

test('an unknown holding says so, with the way back', async ({ page }) => {
  await page.goto('/app/holdings/hld_nope');
  await expect(page.getByText('This holding isn’t here any more.')).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
  await page.goto('/app/holdings/hld_broker');
  await expect(page.getByRole('heading', { level: 2, name: 'History · 2' })).toBeVisible();
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByRole('dialog', { name: 'Add Value' })).toBeVisible();
  await expectSoundScreen(page, testInfo);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Edit tags' }).click();
  await expect(page.getByRole('dialog', { name: 'Tags' })).toBeVisible();
  await expectSoundScreen(page, testInfo);
  await page.keyboard.press('Escape');

  const rows = page.getByRole('button', { expanded: false }).filter({ hasText: /\$/ });
  await rows.nth(0).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Value' })).toBeVisible();
  await expectSoundScreen(page, testInfo);
});
