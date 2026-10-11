/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectSoundScreen, recordEventAnswers, recordEvents } from './accounts';
import { asSignedIn, isPhone, mockConnections, mockSnapshot, snapshotEtag } from './support';

/**
 * Home (PRD J1, J4, the J5 handoff, J9): the whole picture — net worth against the baseline in
 * force, the trend and allocation, the position ledger, sort, filter and Don't Show, staleness
 * on every row and the stale count handed to the agent. All data is fictional.
 */
test.use({ timezoneId: 'UTC' });

const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
/** The UTC date and the end of last month, as the app's todayIn('UTC') reads them. */
const todayStr = () => new Date().toISOString().slice(0, 10);
const lastMonthEnd = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
};

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

/** The holdings section, wherever it sits among Home's sections. */
function holdingsRegion(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: /^Holdings ·/ }) });
}

/** Serves the agent guides the handoff reads the prefill-vs-Copy decision from. */
async function mockGuides(page: Page, guides: Record<string, Record<string, unknown>>) {
  await page.route('**/api/content/current', (route) =>
    route.fulfill({
      json: { agent: Object.fromEntries(Object.keys(guides).map((key) => [key, 1])) },
    }),
  );
  await page.route('**/api/content/agent/*', (route) => {
    const key = new URL(route.request().url()).pathname.split('/').pop()?.split('@')[0];
    const doc = key ? guides[key] : undefined;
    if (!doc) return route.fulfill({ status: 404 });
    return route.fulfill({ json: doc });
  });
}

const CLAUDE_GUIDE = {
  id: 'claude',
  name: 'Claude',
  listed: true,
  order: 1,
  prefillUrl: 'https://claude.ai/new?q={prompt}',
  platforms: {},
};

/** "Other agent": no prefill address, so the handoff copies. */
const OTHER_GUIDE = { id: 'other', name: 'Other agent', listed: true, order: 3, platforms: {} };

const CLAUDE_CONNECTION = {
  id: 'con_1',
  clientName: 'Claude',
  client: 'claude',
  registration: 'cimd',
  nameVerified: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  lastUsedAt: null,
};

const OTHER_CONNECTION = {
  id: 'con_2',
  clientName: 'Helperbot',
  client: 'other',
  registration: 'cimd',
  nameVerified: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  lastUsedAt: null,
};

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

test('with one value each, the trend waits as a placeholder', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('trend-chart-placeholder')).toBeVisible();
  await expect(page.getByText('Need more data')).toBeVisible();
  await expect(
    page.getByText('Update a holding next month, or add an earlier value, to see your trend.'),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Net worth range' })).toHaveCount(0);
});

test('the holdings under the total, each opening its page', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 2, name: 'Holdings · 8' })).toBeVisible();

  const rows = holdingsRegion(page).getByRole('link');
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

  const flat = holdingsRegion(page).getByRole('link', { name: /Riverside flat/ });
  await expect(flat.getByText('Not decided')).toBeVisible();
  const studio = holdingsRegion(page).getByRole('link', { name: /Seaside studio/ });
  await expect(studio.getByText('Not decided')).toBeVisible();

  const broker = holdingsRegion(page).getByRole('link', { name: /Brokerage account/ });
  await expect(broker).toContainText('$50,000 USD');
  await expect(broker).toContainText('$67,500');
  await expect(broker).toHaveAttribute('data-agent-written', 'true');
  // The mark, not the name: Claude is named only when the value is opened.
  await expect(broker).not.toContainText('Claude');
  await expect(page.locator('[data-agent-written="true"]')).toHaveCount(1);
});

test('totals show no cents, and each holding amount appears once in the list', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { level: 2, name: 'Holdings · 8' })).toBeVisible();
  const figures = await page.locator('[data-figure]').allTextContents();
  expect(figures.length).toBeGreaterThan(0);
  for (const figure of figures) expect(figure).not.toMatch(/\.\d/);
  const listed = await holdingsRegion(page).locator('[data-figure]').allTextContents();
  expect(listed).toHaveLength(8);
  expect(new Set(listed).size).toBe(8);
  // One value each, all fresh: no change figures, only the baseline control.
  await expect(page.getByText('Change vs last month')).toBeVisible();
  await expect(page.getByRole('button', { name: /vs Last month/ })).toBeVisible();
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
  // The holdings heading keeps its count on one line; the toolbar wraps below it instead.
  const heading = page.getByRole('heading', { level: 2, name: 'Holdings · 8' });
  const box = await heading.boundingBox();
  const lineHeight = await heading.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect(box?.height ?? 0).toBeLessThan(lineHeight * 1.5);
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
  }) => {
    await mockConnections(page, [CLAUDE_CONNECTION]);
    await mockGuides(page, { claude: CLAUDE_GUIDE });
    await page.goto('/app/');
    await expect(page.getByText('Claude is connected. Ask it to set things up:')).toBeVisible();
    await expect(page.getByText(/Help me set up NetNet/)).toBeVisible();

    // Claude's guide carries a prefill address, so the prompt opens in Claude.
    const prefill = page.getByRole('link', { name: 'Let Claude do it' });
    await expect(prefill).toBeVisible();
    const href = await prefill.getAttribute('href');
    const prompt = new URL(href ?? '').searchParams.get('q') ?? '';
    expect(prompt).toContain('Help me set up NetNet');
    expect(prompt).not.toMatch(/\d/);
    await expect(page.getByRole('button', { name: 'Copy the prompt' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Or add it yourself' }).click();
    await expect(page).toHaveURL(/\/app\/add$/);
  });

  test('where the client has no prefill address, the prompt copies instead', async ({
    page,
    context,
  }) => {
    await mockConnections(page, [OTHER_CONNECTION]);
    await mockGuides(page, { other: OTHER_GUIDE });
    await page.goto('/app/');
    await expect(page.getByText('Helperbot is connected. Ask it to set things up:')).toBeVisible();

    await expect(page.getByRole('link', { name: /Let .* do it/ })).toHaveCount(0);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy the prompt' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const pasted = await page.evaluate(() => navigator.clipboard.readText());
    expect(pasted).toContain('Help me set up NetNet');
    expect(pasted).not.toMatch(/\d/);
  });

  test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
    await page.goto('/app/');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await expectSoundScreen(page, testInfo);
  });
});

/**
 * Four holdings with history: Everyday savings rose $500 → $1,000 → $1,250 (last month's end,
 * then today), the brokerage and the flat are stale, the loan is owed. Net worth: $328,750; the
 * change since last month is +$250 (+0.1%). Every date is worked out from the run date, so the
 * baselines, the trend and the staleness read the same whenever the suite runs.
 */
function richLedger(prefs: Record<string, unknown> = {}) {
  const today = todayStr();
  return {
    dataVersion: 12,
    baseCurrency: 'SGD',
    packRef: [{ key: 'generic', version: 1 }],
    prefs,
    types: TYPES,
    tags: [
      { id: 'tag_rainy', name: 'Rainy day', sort: 0 },
      { id: 'tag_shared', name: 'Shared', sort: 1 },
    ],
    holdings: [
      holding({
        id: 'hld_cash',
        name: 'Everyday savings',
        typeId: 'typ_cash',
        tagIds: ['tag_rainy'],
      }),
      holding({
        id: 'hld_broker',
        name: 'Brokerage account',
        typeId: 'typ_listed',
        currency: 'USD',
        tagIds: ['tag_shared'],
      }),
      holding({ id: 'hld_flat', name: 'Riverside flat', typeId: 'typ_prop', access: 'undecided' }),
      holding({
        id: 'hld_loan',
        name: 'Student loan',
        kind: 'liability',
        typeId: 'typ_loan',
        access: null,
      }),
    ],
    values: {
      hld_cash: [
        [day(400), 50_000, 'SGD', 50_000, 'web', null, 'val_cash_old'],
        [lastMonthEnd(), 100_000, 'SGD', 100_000, 'web', null, 'val_cash_m'],
        [today, 125_000, 'SGD', 125_000, 'web', null, 'val_cash'],
      ],
      hld_broker: [[day(40), 5_000_000, 'USD', 6_750_000, 'web', null, 'val_broker']],
      hld_flat: [[day(400), 30_000_000, 'SGD', 30_000_000, 'web', null, 'val_flat']],
      hld_loan: [[today, 4_000_000, 'SGD', 4_000_000, 'web', null, 'val_loan']],
    },
  };
}

/**
 * The ledger with prefs that persist: PATCH /api/prefs answers like the API (a rising data
 * version) and the snapshot carries the saved prefs from then on, so choosing and reloading
 * reads back what was chosen. Returns the patches the page sent, in order.
 */
async function mockLedgerWithPrefs(page: Page, prefs: Record<string, unknown> = {}) {
  const saved: Record<string, unknown> = { ...prefs };
  let version = 12;
  const patches: unknown[] = [];
  const packRef = [{ key: 'generic', version: 1 }];
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: { ...richLedger(), prefs: { ...saved }, dataVersion: version },
      headers: { ETag: snapshotEtag(version, packRef) },
    }),
  );
  await page.route('**/api/prefs', (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    patches.push(patch);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete saved[key];
      else saved[key] = value;
    }
    version += 1;
    return route.fulfill({ json: { result: { ...saved }, dataVersion: version, warnings: [] } });
  });
  return patches;
}

async function mockRich(page: Page, prefs: Record<string, unknown> = {}) {
  await asSignedIn(page);
  return mockLedgerWithPrefs(page, prefs);
}

test.describe('complete', () => {
  let patches: unknown[];

  test.beforeEach(async ({ page }) => {
    patches = await mockRich(page);
  });

  test('net worth against the baseline in force, labelled everywhere it appears', async ({
    page,
  }) => {
    await page.goto('/app/');
    await expect(page.getByText('$328,750').first()).toBeVisible();
    await expect(page.getByText('+$250').first()).toBeVisible();
    await expect(page.getByText('+0.1%')).toBeVisible();
    await expect(page.getByRole('button', { name: /vs Last month/ })).toBeVisible();
    await expect(page.getByText('Change vs last month')).toBeVisible();

    const cash = holdingsRegion(page).getByRole('link', { name: /Everyday savings/ });
    await expect(cash).toContainText('+$250');
    await expect(cash).not.toContainText('+25%');
  });

  test('the baseline selector moves every change figure, and saves the choice', async ({
    page,
  }) => {
    await page.goto('/app/');
    await expect(page.getByText('+$250').first()).toBeVisible();

    await page.getByRole('button', { name: /vs Last month/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Compare with' });
    await expect(sheet.getByRole('button', { name: 'Last month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await sheet.getByRole('button', { name: 'Initial value' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: /vs Initial value/ })).toBeVisible();
    await expect(page.getByText('+$750').first()).toBeVisible();
    await expect(page.getByText('+0.2%')).toBeVisible();
    await expect(
      holdingsRegion(page).getByRole('link', { name: /Everyday savings/ }),
    ).toContainText('+$750');
    await expect.poll(() => patches).toStrictEqual([{ baseline: 'initial' }]);
  });

  test('sort by value either way, name, type, change or last updated', async ({ page }) => {
    await page.goto('/app/');
    const rows = holdingsRegion(page).getByRole('link');
    const names = () => rows.allTextContents();
    await expect(rows).toHaveCount(4);

    const sort = page.getByRole('button', { name: /Sort holdings/ });
    await sort.click();
    await page
      .getByRole('dialog', { name: 'Sort holdings' })
      .getByRole('button', {
        name: 'Highest value',
      })
      .click();
    await expect
      .poll(() => names().then((all) => all.map((text) => text.slice(0, 20))))
      .toStrictEqual([
        expect.stringContaining('Riverside flat'),
        expect.stringContaining('Brokerage account'),
        expect.stringContaining('Everyday savings'),
        expect.stringContaining('Student loan'),
      ]);

    await sort.click();
    await page
      .getByRole('dialog', { name: 'Sort holdings' })
      .getByRole('button', {
        name: 'Name, A to Z',
      })
      .click();
    await expect
      .poll(() => names().then((all) => all.map((text) => text.slice(0, 20))))
      .toStrictEqual([
        expect.stringContaining('Brokerage account'),
        expect.stringContaining('Everyday savings'),
        expect.stringContaining('Riverside flat'),
        expect.stringContaining('Student loan'),
      ]);

    // Sorted by percentage, the rows read the percentage instead of the money.
    await sort.click();
    await page
      .getByRole('dialog', { name: 'Sort holdings' })
      .getByRole('button', {
        name: 'Largest change, %',
      })
      .click();
    const first = rows.first();
    await expect(first).toContainText('Everyday savings');
    await expect(first).toContainText('+25%');
    await expect(first).not.toContainText('+$250');

    await sort.click();
    await page
      .getByRole('dialog', { name: 'Sort holdings' })
      .getByRole('button', {
        name: 'Lowest value',
      })
      .click();
    await expect
      .poll(() => names().then((all) => all.map((text) => text.slice(0, 20))))
      .toStrictEqual([
        expect.stringContaining('Student loan'),
        expect.stringContaining('Everyday savings'),
        expect.stringContaining('Brokerage account'),
        expect.stringContaining('Riverside flat'),
      ]);

    await sort.click();
    await page
      .getByRole('dialog', { name: 'Sort holdings' })
      .getByRole('button', {
        name: 'Type, A to Z',
      })
      .click();
    await expect(rows.first()).toContainText('Everyday savings');
    await expect(rows.last()).toContainText('Riverside flat');
  });

  test('opening a sheet focuses its title, not its Cancel button', async ({ page }) => {
    await page.goto('/app/');
    await page.getByRole('button', { name: /Filter Home/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter Home' });
    await expect(sheet).toBeVisible();
    // No header button takes the focus ring on open (iOS Safari focuses the first
    // control otherwise); keyboard users still meet it on Tab.
    await expect(page.locator(':focus')).toHaveText('Filter Home');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Reset');
    const ringed = await page.evaluate(
      () => document.activeElement?.matches(':focus-visible') ?? false,
    );
    expect(ringed).toBe(true);
  });

  test('filter drafts Show Only, chips and archived, applying together', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.getByText('$328,750').first()).toBeVisible();

    await page.getByRole('button', { name: /Filter Home/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter Home' });
    await expect(sheet.getByText('Hidden from Home only. Insights is unchanged.')).toBeVisible();
    // Drafting applies nothing until Apply: no banner, no save.
    await sheet.getByRole('button', { name: 'Assets', exact: true }).click();
    await expect(page.getByText('Assets only')).toHaveCount(0);
    await expect.poll(() => patches).toStrictEqual([]);
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Filtered: Assets only')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Filtered total' })).toBeVisible();
    await expect(page.getByText('$368,750').first()).toBeVisible();
    await expect(holdingsRegion(page).getByRole('link')).toHaveCount(3);
    await expect.poll(() => patches).toStrictEqual([{ homeFilter: { show: 'assets' } }]);

    // Cancel drops the draft.
    await page.getByRole('button', { name: /Filter Home/ }).click();
    const cancelled = page.getByRole('dialog', { name: 'Filter Home' });
    await cancelled.getByRole('button', { name: 'Liabilities', exact: true }).click();
    await cancelled.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await expect(page.getByText('Assets only')).toBeVisible();
    await expect.poll(() => patches).toStrictEqual([{ homeFilter: { show: 'assets' } }]);

    // Chips: shown-only and hidden never hold at once — the second press moves it across —
    // and Reset clears the draft.
    await page.getByRole('button', { name: /Filter Home/ }).click();
    const redrafted = page.getByRole('dialog', { name: 'Filter Home' });
    const chips = redrafted.getByRole('button', { name: 'Property' });
    await expect(chips).toHaveCount(2);
    await chips.first().click();
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    await chips.nth(1).click();
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await redrafted.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'false');
    await expect(redrafted.getByRole('button', { name: 'All', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await redrafted.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Assets only')).toHaveCount(0);
    await expect(holdingsRegion(page).getByRole('link')).toHaveCount(4);
    await expect
      .poll(() => patches)
      .toStrictEqual([{ homeFilter: { show: 'assets' } }, { homeFilter: null }]);
  });

  test('tag chips match any or all of the tags', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.getByText('$328,750').first()).toBeVisible();

    await page.getByRole('button', { name: /Filter Home/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter Home' });
    await sheet.getByRole('button', { name: 'Rainy day' }).first().click();
    await sheet.getByRole('button', { name: 'Shared' }).first().click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Rainy day OR Shared')).toBeVisible();
    await expect(holdingsRegion(page).getByRole('link')).toHaveCount(2);

    await page.getByRole('button', { name: /Filter Home/ }).click();
    const redrafted = page.getByRole('dialog', { name: 'Filter Home' });
    await redrafted.getByRole('button', { name: 'AND' }).first().click();
    await redrafted.getByRole('button', { name: 'Apply', exact: true }).click();
    // No holding carries both tags.
    await expect(page.getByText('Rainy day AND Shared')).toBeVisible();
    await expect(holdingsRegion(page).getByText('Nothing matches this filter.')).toBeVisible();
    await expect
      .poll(() => patches)
      .toStrictEqual([
        { homeFilter: { tagIds: ['tag_rainy', 'tag_shared'] } },
        { homeFilter: { tagIds: ['tag_rainy', 'tag_shared'], tagMode: 'all' } },
      ]);
  });

  test('the trend and the allocation, switchable between money and percent', async ({
    page,
  }, testInfo) => {
    await page.goto('/app/');
    await expect(page.getByRole('heading', { name: 'Trend' })).toBeVisible();
    await expect(page.getByTestId('trend-chart')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Allocation' })).toBeVisible();
    const allocation = page.getByTestId('allocation-chart');
    const segments = await allocation.getByTestId('allocation-chart-row').allTextContents();
    expect(segments).toHaveLength(3);
    expect(segments[0]).toContain('Property');
    expect(segments[0]).toMatch(/%/);

    await page.getByRole('button', { name: 'Show $' }).click();
    const money = await allocation.getByTestId('allocation-chart-row').allTextContents();
    expect(money[0]).toContain('$300K');
    await page.getByRole('button', { name: 'Show %' }).click();
    const back = await allocation.getByTestId('allocation-chart-row').allTextContents();
    expect(back[0]).toMatch(/%/);

    // The revised J4 keeps no By type or assets-vs-liabilities cards on Home.
    await expect(page.getByRole('heading', { name: 'By type' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Assets vs liabilities' })).toHaveCount(0);

    // A carousel on a phone, side by side on a computer.
    if (isPhone(testInfo)) {
      const dots = page.getByRole('button', { name: /Show (Trend|Allocation)/ });
      await expect(dots).toHaveCount(2);
      await page.getByRole('button', { name: 'Show Allocation' }).click();
      await expect(page.getByRole('button', { name: 'Show Allocation' })).toHaveAttribute(
        'aria-current',
        'true',
      );
    } else {
      await expect(page.getByRole('button', { name: /Show (Trend|Allocation)/ })).toHaveCount(0);
    }
  });

  test('on a computer, the holdings sit beside the position', async ({ page }, testInfo) => {
    if (isPhone(testInfo)) return;
    await page.goto('/app/');
    const sectionBox = async (name: string | RegExp) => {
      const section = page.locator('section').filter({ has: page.getByRole('heading', { name }) });
      const found = await section.boundingBox();
      if (!found) throw new Error(`no box for ${String(name)}`);
      return found;
    };
    // Trend and allocation share a row, and below them the holdings share one with
    // the position ledger — the list never stacks under the right column.
    const trend = await sectionBox('Trend');
    const allocation = await sectionBox('Allocation');
    expect(Math.abs(trend.y - allocation.y)).toBeLessThan(2);
    const holdings = await sectionBox(/^Holdings ·/);
    const position = await sectionBox('Position');
    expect(Math.abs(holdings.y - position.y)).toBeLessThan(2);
    expect(holdings.x).toBeLessThan(position.x);
  });

  test('the trend covers the range bar’s span', async ({ page }) => {
    await page.goto('/app/');
    const range = page.getByRole('group', { name: 'Net worth range' });
    await expect(range.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await range.getByRole('button', { name: '6M' }).click();
    await expect(range.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('trend-chart')).toBeVisible();
  });

  test('with one card, the trend stands full width', async ({ page }) => {
    await page.goto('/app/');
    await page.getByRole('button', { name: /Filter Home/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter Home' });
    await sheet.getByRole('button', { name: 'Liabilities', exact: true }).click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Allocation' })).toHaveCount(0);
    const hero = await page.getByRole('heading', { level: 1 }).locator('..').boundingBox();
    const trend = await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Trend' }) })
      .boundingBox();
    if (!hero || !trend) throw new Error('no box for the hero or the trend');
    expect(Math.abs(hero.width - trend.width)).toBeLessThan(2);
  });

  test('baseline, sort and filter choices persist across sessions', async ({ page }) => {
    await page.goto('/app/');
    await page.getByRole('button', { name: /vs Last month/ }).click();
    await page
      .getByRole('dialog', { name: 'Compare with' })
      .getByRole('button', {
        name: 'Initial value',
      })
      .click();
    await page.getByRole('button', { name: /Sort holdings/ }).click();
    await page
      .getByRole('dialog', { name: 'Sort holdings' })
      .getByRole('button', {
        name: 'Name, A to Z',
      })
      .click();
    await page.getByRole('button', { name: /Filter Home/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter Home' });
    await sheet.getByRole('button', { name: 'Assets', exact: true }).click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('Assets only')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: /vs Initial value/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sort holdings/ })).toContainText(
      'Sort: Name, A to Z',
    );
    await expect(page.getByText('Assets only')).toBeVisible();
    const rows = holdingsRegion(page).getByRole('link');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Brokerage account');
  });

  test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
    await page.goto('/app/');
    await expect(page.getByRole('heading', { level: 2, name: 'Holdings · 4' })).toBeVisible();
    await expectSoundScreen(page, testInfo);
  });
});

test.describe('archived', () => {
  // One active holding and one archived: the filter lists both only when asked.
  const ARCHIVED_LEDGER = {
    dataVersion: 3,
    baseCurrency: 'SGD',
    packRef: [{ key: 'generic', version: 1 }],
    prefs: {},
    types: TYPES,
    tags: [],
    holdings: [
      holding({ id: 'hld_cash', name: 'Everyday savings', typeId: 'typ_cash' }),
      holding({
        id: 'hld_old',
        name: 'Old account',
        typeId: 'typ_cash',
        archived: true,
        archivedAt: '2026-09-01T00:00:00.000Z',
      }),
    ],
    values: {
      hld_cash: [[day(3), 125_000, 'SGD', 125_000, 'web', null, 'val_cash']],
      hld_old: [[day(3), 500_000, 'SGD', 500_000, 'web', null, 'val_old']],
    },
  };

  test.beforeEach(async ({ page }) => {
    await asSignedIn(page);
    const saved: Record<string, unknown> = {};
    const packRef = [{ key: 'generic', version: 1 }];
    await page.route('**/api/snapshot', (route) =>
      route.fulfill({
        json: { ...ARCHIVED_LEDGER, prefs: { ...saved } },
        headers: { ETag: snapshotEtag(3, packRef) },
      }),
    );
    await page.route('**/api/prefs', (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const patch = route.request().postDataJSON() as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete saved[key];
        else saved[key] = value;
      }
      return route.fulfill({ json: { result: { ...saved }, dataVersion: 4, warnings: [] } });
    });
  });

  test('including archived lists archived holdings too', async ({ page }) => {
    const rows = holdingsRegion(page).locator('a[href^="/app/holdings/"]');
    await page.goto('/app/');
    await expect(page.getByText('$1,250').first()).toBeVisible();
    await expect(rows).toHaveCount(1);

    await page.getByRole('button', { name: /Filter Home/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filter Home' });
    await sheet.getByRole('button', { name: 'Yes', exact: true }).click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText('including archived')).toBeVisible();
    await expect(page.getByText('$6,250').first()).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText('Old account');
  });
});

test.describe('stale', () => {
  test.beforeEach(async ({ page }) => {
    await mockRich(page);
  });

  test('on a computer, the stale note sits directly beneath the position, however long the list', async ({
    page,
  }, testInfo) => {
    if (isPhone(testInfo)) return;
    await page.unroute('**/api/snapshot');
    const base = richLedger();
    const ids = Array.from({ length: 10 }, (_, i) => `hld_extra${i}`);
    await mockSnapshot(page, {
      ...base,
      holdings: [
        ...base.holdings,
        ...ids.map((id, i) => holding({ id, name: `Spare account ${i + 1}`, typeId: 'typ_cash' })),
      ],
      values: {
        ...base.values,
        ...Object.fromEntries(
          ids.map((id, i) => [
            id,
            [[day(3), 10_000 + i * 100, 'SGD', 10_000 + i * 100, 'web', null, `val_${id}`]],
          ]),
        ),
      },
    });
    await page.goto('/app/');
    const position = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Position' }) });
    const posBox = await position.boundingBox();
    const noteBox = await page.getByTestId('stale-note').boundingBox();
    if (!posBox || !noteBox) throw new Error('no boxes for the position and the stale note');
    expect(Math.abs(noteBox.x - posBox.x)).toBeLessThan(2);
    const gap = noteBox.y - (posBox.y + posBox.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(64);
  });

  test('rows carry staleness, and the stale count offers to connect an agent', async ({
    page,
  }, testInfo) => {
    await page.goto('/app/');
    const broker = holdingsRegion(page).getByRole('link', { name: /Brokerage account/ });
    await expect(broker.getByText('Stale')).toBeVisible();
    const flat = holdingsRegion(page).getByRole('link', { name: /Riverside flat/ });
    await expect(flat.getByText('Stale')).toBeVisible();
    const cash = holdingsRegion(page).getByRole('link', { name: /Everyday savings/ });
    await expect(cash.getByText('Stale')).toHaveCount(0);

    await expect(page.getByText('2 holdings are out of date.')).toBeVisible();
    const connect = page.getByRole('link', { name: 'Connect your agent to keep it current' });
    await expect(connect).toHaveAttribute('href', '/app/agent/connect?entry=home');
    await expectSoundScreen(page, testInfo);
  });

  test('with an agent, the stale count hands the update across in one tap', async ({ page }) => {
    await mockConnections(page, [CLAUDE_CONNECTION]);
    await mockGuides(page, { claude: CLAUDE_GUIDE });
    await page.goto('/app/');
    await expect(page.getByText('2 holdings are out of date.')).toBeVisible();

    const ask = page.getByRole('link', { name: 'Ask Claude to update them' });
    await expect(ask).toBeVisible();
    const prompt = new URL((await ask.getAttribute('href')) ?? '').searchParams.get('q') ?? '';
    expect(prompt).toContain('out of date');
    expect(prompt).not.toContain('Riverside flat');
    expect(prompt).not.toContain('$');
  });

  test('where the client has no prefill address, the update prompt copies instead', async ({
    page,
    context,
  }) => {
    await mockConnections(page, [OTHER_CONNECTION]);
    await mockGuides(page, { other: OTHER_GUIDE });
    await page.goto('/app/');
    await expect(page.getByText('2 holdings are out of date.')).toBeVisible();

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy a prompt for Helperbot' }).click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    const pasted = await page.evaluate(() => navigator.clipboard.readText());
    expect(pasted).toContain('out of date');
    expect(pasted).not.toContain('Riverside flat');
    expect(pasted).not.toContain('$');
  });
});

test.describe('archived', () => {
  const OLD = holding({
    id: 'hld_old',
    name: 'Old savings',
    typeId: 'typ_cash',
    archived: true,
    archivedAt: '2026-09-10T00:00:00.000Z',
  });
  const OLD_VALUES = [[day(3), 50_000, 'SGD', 50_000, 'web', null, 'val_old']];

  test('the list foot reaches Archived, and Unarchive brings one back', async ({ page }) => {
    await page.unroute('**/api/snapshot');
    await mockSnapshot(page, {
      ...LEDGER,
      holdings: [...LEDGER.holdings, OLD],
      values: { ...LEDGER.values, hld_old: OLD_VALUES },
    });
    let patch: unknown;
    await page.route('**/api/holdings/hld_old', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      patch = route.request().postDataJSON();
      await mockSnapshot(page, {
        ...LEDGER,
        dataVersion: 10,
        holdings: [...LEDGER.holdings, { ...OLD, archived: false }],
        values: { ...LEDGER.values, hld_old: OLD_VALUES },
      });
      return route.fulfill({
        json: { result: { ...OLD, archived: false }, dataVersion: 10, warnings: [] },
      });
    });

    await page.goto('/app/');
    const foot = page.getByRole('link', { name: '1 archived ›' });
    await expect(foot).toBeVisible();
    await foot.click();

    await expect(page).toHaveURL(/\/app\/archived$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Archived' })).toBeVisible();
    await expect(
      page.getByText('Archived holdings keep their history but leave every total.'),
    ).toBeVisible();
    await expect(page.getByText('Old savings')).toBeVisible();
    await expect(page.getByText('Cash & savings · 3 days ago')).toBeVisible();

    await page.getByRole('button', { name: 'Unarchive' }).click();
    await expect(page.getByText('Unarchived.')).toBeVisible();
    expect(patch).toStrictEqual({ archived: false });
    await expect(page.getByText('Nothing archived.')).toBeVisible();

    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(holdingsRegion(page).getByText('Old savings')).toBeVisible();
    await expect(page.getByRole('link', { name: /archived ›/ })).toHaveCount(0);
  });

  test('when everything is archived, the empty Home still reaches it', async ({ page }) => {
    await page.unroute('**/api/snapshot');
    await mockSnapshot(page, {
      ...LEDGER,
      holdings: [OLD],
      values: { hld_old: OLD_VALUES },
    });

    await page.goto('/app/');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    await page.getByRole('link', { name: '1 archived ›' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Archived' })).toBeVisible();
    await expect(page.getByText('Old savings')).toBeVisible();
  });
});
