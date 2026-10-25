import { expect, test } from '@playwright/test';
import { asSignedIn } from './support';

test('the built app answers health, serves the web app at /app and its deep links', async ({
  page,
  request,
}) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toStrictEqual({ ok: true });

  // Signed out, the app asks the visitor to log in, and the API agrees nobody is.
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
  await expect(page).toHaveTitle('Log in · NetNet');
  expect((await request.get('/api/me')).status()).toBe(401);

  await asSignedIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Net worth' })).toBeVisible();
  await expect(page).toHaveTitle('Home · NetNet');

  await page.goto('/app/anything/deeper');
  await expect(page.getByRole('heading', { name: 'This page isn’t here.' })).toBeVisible();
});

test('the landing page is at /', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'You can’t get useful advice from an AI that doesn’t know where you stand.',
  );
});
