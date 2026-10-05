/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectSoundScreen, recordEventAnswers, recordEvents } from './accounts';
import { asSignedIn, mockConnections, mockSnapshot } from './support';

/**
 * Home (PRD J1, §2.2): net worth with what it means, and the holdings under it. All data is
 * fictional.
 */
test.use({ timezoneId: 'UTC' });

const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);

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
  {
    id: 'typ_retire',
    universal: 'retirement',
    packTypeKey: null,
    customName: null,
    sort: 3,
    archived: false,
  },
  {
    id: 'typ_loan',
    universal: 'loan',
    packTypeKey: null,
    customName: null,
    sort: 4,
    archived: false,
  },
  {
    id: 'typ_card',
    universal: 'card',
    packTypeKey: null,
    customName: null,
    sort: 5,
    archived: false,
  },
];

const holding = (over: Record<string, unknown>) => ({
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

/** Eight holdings, every bucket and every figure distinct. Net worth: $583,750. */
const LEDGER = {
  dataVersion: 9,
  baseCurrency: 'SGD',
  packRef: [{ key: 'generic', version: 1 }],
  prefs: {},
  types: TYPES,
  tags: [],
  holdings: [
    holding({ id: 'hld_cash', name: 'Everyday savings', typeId: 'typ_cash' }),
    holding({ id: 'hld_broker', name: 'Brokerage account', typeId: 'typ_listed', currency: 'USD' }),
    holding({ id: 'hld_flat', name: 'Riverside flat', typeId: 'typ_prop', access: 'undecided' }),
    holding({ id: 'hld_studio', name: 'Seaside studio', typeId: 'typ_prop', access: 'undecided' }),
    holding({
      id: 'hld_pension',
      name: 'Workplace pension',
      typeId: 'typ_retire',
      access: 'locked',
      accessReason: 'a retirement account is locked until you’re eligible to withdraw',
      accessUntil: 'until you’re eligible to withdraw',
    }),
    holding({
      id: 'hld_topup',
      name: 'Top-up account',
      typeId: 'typ_retire',
      access: 'locked',
      accessReason: 'a retirement account is locked until you’re eligible to withdraw',
      accessUntil: 'until you’re eligible to withdraw',
    }),
    holding({
      id: 'hld_loan',
      name: 'Student loan',
      kind: 'liability',
      typeId: 'typ_loan',
      access: null,
    }),
    holding({
      id: 'hld_card',
      name: 'Travel card',
      kind: 'liability',
      typeId: 'typ_card',
      access: null,
    }),
  ],
  values: {
    hld_cash: [[day(3), 125_000, 'SGD', 125_000, 'web', null, 'val_cash']],
    hld_broker: [[day(1), 5_000_000, 'USD', 6_750_000, 'agent', 'Claude', 'val_broker']],
    hld_flat: [[day(3), 30_000_000, 'SGD', 30_000_000, 'web', null, 'val_flat']],
    hld_studio: [[day(10), 15_000_000, 'SGD', 15_000_000, 'web', null, 'val_studio']],
    hld_pension: [[day(3), 9_000_000, 'SGD', 9_000_000, 'web', null, 'val_pension']],
    hld_topup: [[day(3), 2_000_000, 'SGD', 2_000_000, 'web', null, 'val_topup']],
    hld_loan: [[day(3), 4_000_000, 'SGD', 4_000_000, 'web', null, 'val_loan']],
    hld_card: [[day(3), 500_000, 'SGD', 500_000, 'web', null, 'val_card']],
  },
};

async function mockLedger(page: Page) {
  await asSignedIn(page);
  await mockSnapshot(page, LEDGER);
}

test.beforeEach(async ({ page }) => {
  await mockLedger(page);
});

test('net worth with what it means: could use, locked with until, and owed', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 1, name: 'Net worth' })).toBeVisible();
  await expect(page.getByText('$583,750').first()).toBeVisible();

  const ledger = page.getByRole('region', { name: 'Position' });
  await expect(ledger).toBeVisible();
  await expect(ledger.getByText('You could use this month')).toBeVisible();
  await expect(ledger.getByText('$68,750')).toBeVisible();
  await expect(ledger.getByText('Locked away')).toBeVisible();
  await expect(ledger.getByText('$110,000')).toBeVisible();
  await expect(ledger.getByText(/until you’re eligible to withdraw/)).toBeVisible();
  await expect(ledger.getByText('Not decided yet')).toBeVisible();
  await expect(ledger.getByText('$450,000')).toBeVisible();
  await expect(ledger.getByText('You owe')).toBeVisible();
  await expect(ledger.getByText('−$45,000')).toBeVisible();
});

test('the holdings under the total, each opening its page', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 2, name: 'Holdings · 8' })).toBeVisible();

  const rows = page.locator('main section').nth(1).getByRole('link');
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(0)).toContainText('Everyday savings');
  await expect(rows.nth(0)).toContainText('Cash & savings');
  await expect(rows.nth(0)).toContainText('$1,250');

  await rows.nth(0).click();
  await expect(page).toHaveURL(/\/app\/holdings\/hld_cash$/);
});

test('undecided is marked, foreign shows the original, the agent’s mark stays quiet', async ({
  page,
}) => {
  await page.goto('/app/');

  const flat = page
    .locator('main section')
    .nth(1)
    .getByRole('link', { name: /Riverside flat/ });
  await expect(flat.getByText('Not decided')).toBeVisible();
  const studio = page
    .locator('main section')
    .nth(1)
    .getByRole('link', { name: /Seaside studio/ });
  await expect(studio.getByText('Not decided')).toBeVisible();

  const broker = page
    .locator('main section')
    .nth(1)
    .getByRole('link', { name: /Brokerage account/ });
  await expect(broker).toContainText('$50,000 USD');
  await expect(broker).toContainText('$67,500');
  await expect(broker).toHaveAttribute('data-agent-written', 'true');
  // The mark, not the name: Claude is named only when the value is opened.
  await expect(broker).not.toContainText('Claude');
  await expect(page.locator('[data-agent-written="true"]')).toHaveCount(1);
});

test('one figure one place, and no stray cents', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 2, name: 'Holdings · 8' })).toBeVisible();
  const figures = await page.locator('[data-figure]').allTextContents();
  expect(figures.length).toBeGreaterThan(0);
  expect(new Set(figures).size).toBe(figures.length);
  const main = await page.locator('main').textContent();
  expect(main).not.toMatch(/\.\d/);
});

test('opening Home sends session_started, accepted', async ({ page }) => {
  const events = recordEvents(page);
  const answers = recordEventAnswers(page);
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 1, name: 'Net worth' })).toBeVisible();
  await expect.poll(() => events).toStrictEqual(['session_started']);
  await expect.poll(() => answers).toStrictEqual([204]);
});

test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 2, name: 'Holdings · 8' })).toBeVisible();
  await expectSoundScreen(page, testInfo);
});

test.describe('empty', () => {
  test.beforeEach(async ({ page }) => {
    // The default sign-in, without the ledger: nothing tracked.
    await page.unroute('**/api/snapshot');
    await asSignedIn(page);
  });

  test('one primary action, and the agent below a rule', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.getByText('$0').first()).toBeVisible();
    await expect(page.getByText('Nothing here yet.')).toBeVisible();

    const add = page.getByRole('link', { name: 'Add what you have' });
    await expect(add).toBeVisible();
    await expect(page.getByText('Let your AI agent do this')).toBeVisible();
    const connect = page.getByRole('link', { name: 'Connect to agent' });
    await expect(connect).toHaveAttribute('href', '/app/agent/connect?entry=home');

    await add.click();
    await expect(page).toHaveURL(/\/app\/add$/);
  });

  test('with an agent connected, the starting prompt with add-it-yourself as the alternative', async ({
    page,
    context,
  }) => {
    await mockConnections(page, [
      {
        id: 'con_1',
        clientName: 'Claude',
        client: 'claude',
        registration: 'cimd',
        nameVerified: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        lastUsedAt: null,
      },
    ]);
    await page.goto('/app/');
    await expect(page.getByText('Claude is connected. Ask it to set things up:')).toBeVisible();
    await expect(page.getByText(/Help me set up NetNet/)).toBeVisible();

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy the prompt' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const pasted = await page.evaluate(() => navigator.clipboard.readText());
    expect(pasted).toContain('Help me set up NetNet');
    expect(pasted).not.toMatch(/\d/);

    await page.getByRole('link', { name: 'Or add it yourself' }).click();
    await expect(page).toHaveURL(/\/app\/add$/);
  });

  test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
    await page.goto('/app/');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await expectSoundScreen(page, testInfo);
  });
});
