/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectSoundScreen } from './accounts';
import { asSignedIn, snapshotEtag } from './support';

/**
 * Insights (PRD J11): each month, quarter and year with its change and drivers, through
 * Insights-only filters and a Don't Show list that persist and never touch Home. All data is
 * fictional.
 */
test.use({ timezoneId: 'UTC' });

const todayStr = () => new Date().toISOString().slice(0, 10);
/** The first of the month `ago` months back, so the periods never shift with the run date. */
const monthStart = (ago: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - ago, 1))
    .toISOString()
    .slice(0, 10);
};
const monthDay = (ago: number, day: number) =>
  `${monthStart(ago).slice(0, 8)}${String(day).padStart(2, '0')}`;

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
    id: 'typ_loan',
    universal: 'loan',
    packTypeKey: null,
    customName: null,
    sort: 2,
    archived: false,
  },
];

const holding = (over: Record<string, unknown>) => ({
  kind: 'asset',
  currency: 'SGD',
  cadenceDays: null,
  archived: false,
  archivedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  rowVersion: 1,
  access: 'accessible',
  accessReason: null,
  accessUntil: null,
  accessBasis: null,
  tagIds: [],
  ...over,
});

/**
 * Thirteen months of history, deterministically: savings $500 → $1,000 → $1,500 → $1,800 (a
 * year ago, two months back, last month, today), a $10,000 brokerage holding from two months
 * back (stored at S$13,500), and a $400 loan from last month. Net worth: $14,900. Quarterly
 * reads five quarters, yearly two years, whatever day the suite runs.
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
        [monthStart(12), 50_000, 'SGD', 50_000, 'web', null, 'val_cash_old'],
        [monthDay(2, 9), 100_000, 'SGD', 100_000, 'web', null, 'val_cash_m2'],
        [monthDay(1, 9), 150_000, 'SGD', 150_000, 'web', null, 'val_cash_m1'],
        [today, 180_000, 'SGD', 180_000, 'web', null, 'val_cash'],
      ],
      hld_broker: [[monthDay(2, 14), 1_000_000, 'USD', 1_350_000, 'web', null, 'val_broker']],
      hld_loan: [[monthDay(1, 19), 40_000, 'SGD', 40_000, 'web', null, 'val_loan']],
    },
  };
}

/** One holding with one value today: a single period, nothing to compare it with. */
function smallLedger() {
  return {
    dataVersion: 2,
    baseCurrency: 'SGD',
    packRef: [{ key: 'generic', version: 1 }],
    prefs: {},
    types: TYPES,
    tags: [],
    holdings: [holding({ id: 'hld_cash', name: 'Everyday savings', typeId: 'typ_cash' })],
    values: { hld_cash: [[todayStr(), 100_000, 'SGD', 100_000, 'web', null, 'val_cash']] },
  };
}

/**
 * The ledger with prefs that persist: PATCH /api/prefs answers like the API and the snapshot
 * carries the saved prefs from then on. Returns the patches the page sent, in order.
 */
async function mockLedgerWithPrefs(
  page: Page,
  ledger: () => Record<string, unknown>,
  prefs: Record<string, unknown> = {},
) {
  const saved: Record<string, unknown> = { ...prefs };
  let version = 12;
  const patches: unknown[] = [];
  const packRef = [{ key: 'generic', version: 1 }];
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: { ...ledger(), prefs: { ...saved }, dataVersion: version },
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
  return mockLedgerWithPrefs(page, richLedger, prefs);
}

/** The `view` prop of every `insights_viewed` the page sends, in order. */
function recordInsightsViews(page: Page): string[] {
  const views: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    const { pathname } = new URL(request.url());
    if (pathname !== '/api/events') return;
    const body = request.postDataJSON() as { name: string; props?: { view?: string } };
    if (body.name === 'insights_viewed' && body.props?.view) views.push(body.props.view);
  });
  return views;
}

const monthLabel = (ago: number) =>
  new Date(`${monthStart(ago)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const monthShort = (ago: number) =>
  new Date(`${monthStart(ago)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
const quarterLabel = (date: string) => {
  const at = new Date(`${date}T00:00:00Z`);
  return `Q${Math.floor(at.getUTCMonth() / 3) + 1} ${at.getUTCFullYear()}`;
};

test.describe('rich history', () => {
  let patches: unknown[];

  test.beforeEach(async ({ page }) => {
    patches = await mockRich(page);
  });

  test('monthly rows newest-first, each opening onto its drivers', async ({ page }) => {
    await page.goto('/app/insights');
    const list = page.getByRole('region', { name: 'Month by month' });
    const rows = list.getByRole('button');
    await expect(rows).toHaveCount(13);

    const newest = rows.nth(0);
    await expect(newest).toContainText(monthLabel(0));
    await expect(newest).toContainText('so far');
    await expect(newest).toContainText('+$300');
    await expect(newest).toContainText('+2.1%');
    await expect(newest).toContainText('Carried');
    await expect(rows.nth(1)).toContainText('+$100');
    await expect(rows.nth(1)).toContainText('+0.7%');
    await expect(rows.nth(2)).toContainText('+$14K');
    await expect(rows.nth(2)).toContainText('+2800%');
    // The first period has nothing earlier to compare with: its end value, never a change.
    await expect(rows.nth(12)).toHaveText(`${monthLabel(12)}First month$500`);

    await newest.click();
    await expect(list.getByText('$14,900')).toBeVisible();
    await expect(list.getByText('+$300 · +2.1%')).toBeVisible();
    await expect(list.getByText(/– today/)).toBeVisible();
    await expect(list.getByRole('heading', { name: 'What drove it' })).toBeVisible();
    const drivers = list.getByRole('link');
    await expect(drivers).toHaveCount(1);
    await expect(drivers.nth(0)).toContainText('Everyday savings');
    await expect(drivers.nth(0)).toContainText('+$300');
    await expect(drivers.nth(0)).toHaveAttribute('href', '/app/holdings/hld_cash');
    await expect(list.getByText(/Carried: a holding counted here/)).toBeVisible();
    await newest.click();

    await rows.nth(2).click();
    const ranked = list.getByRole('link');
    await expect(ranked).toHaveCount(2);
    await expect(ranked.nth(0)).toContainText('Brokerage account');
    await expect(ranked.nth(0)).toContainText('+$13,500');
    await expect(ranked.nth(1)).toContainText('Everyday savings');
    await expect(ranked.nth(1)).toContainText('+$500');
    await rows.nth(2).click();

    // The first opens onto its end value, with nothing earlier and nothing that drove it.
    await rows.nth(12).click();
    await expect(list.getByText('No earlier month to compare with.')).toBeVisible();
    await expect(list.getByRole('heading', { name: 'What drove it' })).toHaveCount(0);
    await expect(list.getByRole('link')).toHaveCount(0);
  });

  test('the first period moves with the Don’t Show list, and still has no change', async ({
    page,
  }) => {
    await page.goto('/app/insights');
    await page.getByRole('button', { name: 'Insights filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Insights Filters' });
    await sheet.getByRole('button', { name: 'Everyday savings' }).click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();

    // Without the savings, the set opens two months back with the brokerage's S$13,500.
    const list = page.getByRole('region', { name: 'Month by month' });
    const rows = list.getByRole('button');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toHaveText(`${monthLabel(2)}First month$14K`);
    await expect(rows.nth(1)).toContainText('−$400');
    await rows.nth(2).click();
    await expect(list.getByText('$13,500')).toBeVisible();
    await expect(list.getByText('No earlier month to compare with.')).toBeVisible();
  });

  test('quarterly and yearly views with their own rows and summaries', async ({ page }) => {
    await page.goto('/app/insights');
    await expect(page.getByText('Averaging')).toContainText('over the last 12 months');

    await page.getByRole('button', { name: 'Quarterly', exact: true }).click();
    const quarters = page.getByRole('region', { name: 'Quarter by quarter' });
    await expect(quarters.getByRole('button')).toHaveCount(5);
    await expect(quarters.getByRole('button').nth(0)).toContainText(quarterLabel(todayStr()));
    await expect(page.getByText('Averaging')).toContainText('a quarter over the last 4 quarters');

    await page.getByRole('button', { name: 'Yearly', exact: true }).click();
    const years = page.getByRole('region', { name: 'Year by year' });
    const rows = years.getByRole('button');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(todayStr().slice(0, 4));
    await expect(rows.nth(0)).toContainText('+$14K');
    await expect(rows.nth(0)).toContainText('+2880%');
    await expect(rows.nth(1)).toContainText('First year');
    await expect(rows.nth(1)).not.toContainText('+');
    await expect(page.getByText('Averaging')).toContainText('over the last 1 year');
  });

  test('the average change, the charts, and the pagers over their window', async ({ page }) => {
    await page.goto('/app/insights');
    await expect(page.getByText('Averaging')).toContainText('+$1K');
    await expect(page.getByText('Averaging')).toContainText('(+233.6%)');

    await expect(page.getByRole('heading', { name: 'Monthly growth' })).toBeVisible();
    await expect(page.getByTestId('growth-chart')).toBeVisible();
    const pager = page.getByTestId('growth-pager');
    const first = monthShort(4);
    const last = monthShort(0);
    const year = monthStart(0).slice(0, 4);
    const sameYear = monthStart(4).slice(0, 4) === year;
    const window = sameYear
      ? `${first} – ${last} ${year}`
      : `${first} ${monthStart(4).slice(0, 4)} – ${last} ${year}`;
    await expect(pager).toContainText(window);
    await expect(pager.getByRole('button', { name: 'Later periods' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await pager.getByRole('button', { name: 'Earlier periods' }).click();
    await expect(pager).not.toContainText(window);
    await expect(pager.getByRole('button', { name: 'Later periods' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    await pager.getByRole('button', { name: 'Later periods' }).click();
    await expect(pager).toContainText(window);

    await expect(page.getByRole('heading', { name: 'Assets vs liabilities' })).toBeVisible();
    await expect(page.getByTestId('assets-liabilities-chart')).toBeVisible();
    const lines = page.getByTestId('assets-liabilities-chart-legend');
    await expect(lines).toContainText('Assets');
    await expect(lines).toContainText('Net worth');
    await expect(lines).toContainText('Liabilities');

    await expect(page.getByRole('heading', { name: 'Distribution' })).toBeVisible();
    await expect(page.getByTestId('distribution-chart')).toBeVisible();
    const legend = page.getByTestId('distribution-chart-legend');
    await expect(legend).toContainText('Cash & savings');
    await expect(legend).toContainText('Investments');
    await expect(legend).toContainText('Loan');
  });

  test('ranges cap the periods shown', async ({ page }) => {
    await page.goto('/app/insights');
    const list = page.getByRole('region', { name: 'Month by month' });
    await expect(list.getByRole('button')).toHaveCount(13);

    await page
      .getByRole('group', { name: 'Insights range' })
      .getByRole('button', { name: '6M' })
      .click();
    await expect(list.getByRole('button')).toHaveCount(6);
    await expect(page.getByText('Averaging')).toContainText('over the last 5 months');

    await page
      .getByRole('group', { name: 'Insights range' })
      .getByRole('button', { name: 'All' })
      .click();
    await expect(list.getByRole('button')).toHaveCount(13);
  });

  test('filters recompute every figure and persist across sessions', async ({ page }) => {
    await page.goto('/app/insights');
    await expect(
      page.getByRole('region', { name: 'Month by month' }).getByRole('button'),
    ).toHaveCount(13);

    await page.getByRole('button', { name: 'Insights filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Insights Filters' });
    await sheet.getByRole('button', { name: 'Cash & savings' }).first().click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();

    await expect
      .poll(() => patches)
      .toStrictEqual([{ insightsFilter: { typeIds: ['typ_cash'] }, insightsExclusions: null }]);
    await expect(page.getByText('Filtered: Cash & savings.')).toBeVisible();
    await expect(page.getByText('Every figure below covers the filtered set only.')).toBeVisible();

    // Two months ago over cash alone: the $1,000 end value, not the $14,500 with the brokerage.
    const list = page.getByRole('region', { name: 'Month by month' });
    await list.getByRole('button').nth(2).click();
    await expect(list.getByText('$1,000')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Filtered: Cash & savings.')).toBeVisible();
    await expect(list.getByRole('button').nth(2)).toContainText('+$500');
  });

  test('the Don’t Show list drops a holding without touching Home', async ({ page }) => {
    await page.goto('/app/insights');
    await page.getByRole('button', { name: 'Insights filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Insights Filters' });
    await sheet.getByRole('button', { name: 'Everyday savings' }).click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();

    await expect
      .poll(() => patches)
      .toStrictEqual([{ insightsFilter: null, insightsExclusions: { holdingIds: ['hld_cash'] } }]);
    await expect(page.getByText(/Hidden here: Everyday savings\./)).toBeVisible();
    await expect(page.getByText('Your net worth on Home is unchanged.')).toBeVisible();

    // Without the savings, nothing moved this month.
    const list = page.getByRole('region', { name: 'Month by month' });
    await expect(list.getByRole('button').nth(0)).toContainText('—');

    await page.goto('/app/');
    await expect(page.getByText('$14,900').first()).toBeVisible();

    await page.goto('/app/insights');
    await expect(page.getByText(/Hidden here: Everyday savings\./)).toBeVisible();
  });

  test('the Don’t Show list drops a type', async ({ page }) => {
    await page.goto('/app/insights');
    await page.getByRole('button', { name: 'Insights filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Insights Filters' });
    await sheet.getByRole('button', { name: 'Loan' }).last().click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();

    await expect
      .poll(() => patches)
      .toStrictEqual([{ insightsFilter: null, insightsExclusions: { typeIds: ['typ_loan'] } }]);
    await expect(page.getByText(/Hidden here: Loan\./)).toBeVisible();

    // Last month without the loan: $15,000, not $14,600.
    const list = page.getByRole('region', { name: 'Month by month' });
    await list.getByRole('button').nth(1).click();
    await expect(list.getByText('$15,000')).toBeVisible();
  });

  test('insights_viewed fires on every view open', async ({ page }) => {
    const views = recordInsightsViews(page);
    await page.goto('/app/insights');
    await expect(page.getByRole('region', { name: 'Month by month' })).toBeVisible();
    await page.getByRole('button', { name: 'Quarterly', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Quarter by quarter' })).toBeVisible();
    await page.getByRole('button', { name: 'Yearly', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Year by year' })).toBeVisible();
    await expect.poll(() => views).toStrictEqual(['monthly', 'quarterly', 'yearly']);
  });

  test('a sound screen at phone and computer widths', async ({ page }, testInfo) => {
    await page.goto('/app/insights');
    await expect(page.getByRole('region', { name: 'Month by month' })).toBeVisible();
    await expectSoundScreen(page, testInfo);
  });
});

test.describe('placeholders', () => {
  test.beforeEach(async ({ page }) => {
    await asSignedIn(page);
    await mockLedgerWithPrefs(page, smallLedger);
  });

  test('one period plus what a comparison needs, in every view', async ({ page }) => {
    await page.goto('/app/insights');

    const monthly =
      'A month-on-month comparison needs two months of values. It starts next month, or now if you add an earlier value.';
    await expect(page.getByText(monthly)).toBeVisible();
    await expect(page.getByText('Need more data')).toHaveCount(3);
    const months = page.getByRole('region', { name: 'Month by month' });
    const rows = months.getByRole('button');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toHaveText(`${monthLabel(0)}so farFirst month$1K`);
    // Controls that act on data are not shown on a placeholder.
    await expect(page.getByTestId('growth-pager')).toHaveCount(0);
    await expect(page.getByTestId('distribution-pager')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Insights range' })).toHaveCount(0);
    await expect(page.getByTestId('distribution-chart-legend')).toHaveCount(0);

    await page.getByRole('button', { name: 'Quarterly', exact: true }).click();
    await expect(
      page.getByText(
        'A quarter-on-quarter comparison needs two quarters of values. It starts next quarter, or now if you add an earlier value.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Quarter by quarter' }).getByRole('button'),
    ).toHaveCount(1);

    await page.getByRole('button', { name: 'Yearly', exact: true }).click();
    await expect(
      page.getByText(
        'A year-on-year comparison needs two years of values. It starts next year, or now if you add an earlier value.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Year by year' }).getByRole('button'),
    ).toHaveCount(1);
  });

  test('a sound screen with placeholders', async ({ page }, testInfo) => {
    await page.goto('/app/insights');
    await expect(page.getByText('Need more data').first()).toBeVisible();
    await expectSoundScreen(page, testInfo);
  });
});

test.describe('nothing to show', () => {
  test('filters that leave nothing say more data would not help', async ({ page }) => {
    await mockRich(page);
    await page.goto('/app/insights');
    await expect(page.getByRole('region', { name: 'Month by month' })).toBeVisible();

    // No holding carries both tags.
    await page.getByRole('button', { name: 'Insights filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Insights Filters' });
    await sheet.getByRole('button', { name: 'Rainy day' }).first().click();
    await sheet.getByRole('button', { name: 'Shared' }).first().click();
    await sheet.getByRole('button', { name: 'AND' }).first().click();
    await sheet.getByRole('button', { name: 'Apply', exact: true }).click();

    await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
    await expect(page.getByText('Nothing to show')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Month by month' })).toHaveCount(0);
  });

  test('nothing tracked yet', async ({ page }) => {
    await asSignedIn(page);
    await page.goto('/app/insights');
    await expect(page.getByText('Nothing tracked yet.')).toBeVisible();
    await expect(page.getByText('Need more data')).toHaveCount(3);
    await page.locator('main').getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/app\/?$/);
  });
});
