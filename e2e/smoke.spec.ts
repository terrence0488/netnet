import { expect, test } from '@playwright/test';

test('the built app answers health, serves the web app at /app and its deep links', async ({
  page,
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toStrictEqual({ ok: true });

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'NetNet' })).toBeVisible();

  await page.goto('/app/anything/deeper');
  await expect(page.getByRole('heading', { name: 'NetNet' })).toBeVisible();
});

test('the landing placeholder is at /', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NetNet' })).toBeVisible();
});
