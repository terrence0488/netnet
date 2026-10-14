/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectSoundScreen } from './accounts';
import { EMPTY_SNAPSHOT, mockConnections, mockPacks, mockSnapshot, SIGNED_IN } from './support';

/**
 * Account → Export everything (P3-T4): the full bundle as JSON, one flat values table as CSV.
 * All data is fictional.
 */
test.use({ timezoneId: 'UTC' });

/** The live country list, as content has it — the Account screen reads it, never a fixture. */
const COUNTRIES = JSON.parse(
  readFileSync(new URL('../content/countries.json', import.meta.url), 'utf8'),
) as Record<string, { currency: string; pack?: string }>;

const BUNDLE = {
  exportedAt: '2026-08-01T10:00:00.000Z',
  baseCurrency: 'SGD',
  dataVersion: 3,
  types: [],
  tags: [{ id: 'tag_01K1G4KX00AAAAAAAAAAAAAAAA', name: 'rainy day', sort: 0 }],
  holdings: [],
  values: [],
};

const CSV =
  'holding_id,holding_name,kind,type,currency,date,amount,' +
  'base_amount,base_currency,fx_rate,fx_rate_date,fx_source,source,client,' +
  'access,access_reason,tags\n';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/me', (route) => route.fulfill({ json: SIGNED_IN }));
  await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
  await mockSnapshot(page, EMPTY_SNAPSHOT);
  await mockConnections(page, []);
  await mockPacks(page);
  await page.route('**/api/content/current', (route) =>
    route.fulfill({ json: { countries: { countries: 1 }, pack: { generic: 1 } } }),
  );
  await page.route('**/api/content/countries/*', (route) => route.fulfill({ json: COUNTRIES }));
  await page.route('**/api/export*', (route) => {
    const format = new URL(route.request().url()).searchParams.get('format');
    if (format === 'csv') {
      void route.fulfill({ body: CSV, headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    } else {
      void route.fulfill({ json: BUNDLE });
    }
  });
});

test('Account leads to Export, and the bundle downloads as JSON', async ({ page }, testInfo) => {
  await page.goto('/app/account');
  await expect(page.getByRole('heading', { name: 'Privacy and security' })).toBeVisible();
  await page.getByRole('link', { name: /Export everything/ }).click();
  await expect(page).toHaveURL(/\/app\/account\/export$/);
  await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('netnet-export.json');
  expect(JSON.parse(readFileSync(await file.path(), 'utf8'))).toStrictEqual(BUNDLE);

  await expectSoundScreen(page, testInfo);
});

test('the values table downloads as CSV instead, under its header', async ({ page }, testInfo) => {
  await page.goto('/app/account/export');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV instead' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('netnet-export.csv');
  const lines = readFileSync(await file.path(), 'utf8').split('\n');
  const header = lines[0] ?? '';
  expect(header).toBe(CSV.trimEnd());
  expect(header.split(',')).toHaveLength(17);

  await expectSoundScreen(page, testInfo);
});
