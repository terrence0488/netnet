/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import {
  VIEWPORTS,
  expectNoHorizontalScroll,
  expectNoSeriousAxeViolations,
  isPhone,
  token,
} from './support';

/** The gallery shows every base component; these checks hold in both themes. */
const SPECIMENS = [
  'Buttons',
  'Fields',
  'Figures',
  'Rules',
  'Sheet and toast',
  'Waiting',
  'Wordmark',
  'Error',
];

/** The page's ground in each theme, as tokens.ts authors it. */
const PAPER = { light: 'rgb(242, 234, 219)', dark: 'rgb(27, 23, 18)' };

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every component renders in the ${colorScheme} theme, with nothing serious for axe`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/app/gallery');
    for (const name of SPECIMENS) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      PAPER[colorScheme],
    );
    expect(await token(page, '--paper')).toBe(colorScheme === 'light' ? '#f2eadb' : '#1b1712');
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
    await testInfo.attach(`gallery-${colorScheme}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.getByRole('button', { name: 'Show a toast' }).click();
    await expect(page.getByText('Value saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Open the sheet' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add a value' });
    await expect(sheet).toBeVisible();
    await expectNoSeriousAxeViolations(page, 'dialog');
    await testInfo.attach(`gallery-${colorScheme}-sheet`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

test('every component also renders at 320px without sideways scroll', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto('/app/gallery');
  await expect(page.getByRole('region', { name: 'Error' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('an unavailable button stays solid, and a tap on it does nothing', async ({ page }) => {
  await page.goto('/app/gallery');
  const save = page.getByTestId('unavailable');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(save).not.toHaveAttribute('disabled');
  expect(await save.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');
  // force: Playwright will not tap an aria-disabled control by itself; a person can.
  await save.click({ force: true });
  await page.getByRole('button', { name: 'Add what you have' }).click();
  await expect(page.getByText('Primary pressed.')).toBeVisible();
  await expect(page.getByText('This should never show.')).toHaveCount(0);
});

test('an amount is checked against its currency’s minor unit as it is typed', async ({ page }) => {
  await page.goto('/app/gallery');
  const fields = page.getByRole('region', { name: 'Fields' });
  await expect(fields.getByText('Use a whole number: JPY has no smaller unit.')).toBeVisible();

  const sgd = fields.getByRole('textbox', { name: 'Amount in SGD' });
  await expect(sgd).not.toHaveAttribute('aria-invalid');
  await sgd.fill('12,5');
  await expect(sgd).toHaveAttribute('aria-invalid', 'true');
  await expect(sgd).toHaveAccessibleDescription('Use digits and one decimal point, like 1250.50.');
  await sgd.fill('12.345');
  await expect(sgd).toHaveAccessibleDescription('Use at most 2 decimal places.');
  await sgd.fill('12.34');
  await expect(sgd).not.toHaveAttribute('aria-invalid');
});

test('money shows cents only when there are cents, and no change figure for no change', async ({
  page,
}) => {
  await page.goto('/app/gallery');
  const figures = page.getByRole('region', { name: 'Figures' });
  await expect(figures.getByText('$797,993', { exact: true })).toBeVisible();
  await expect(figures.getByText('$28,100.53', { exact: true })).toBeVisible();
  await expect(figures.getByText('+$59,000', { exact: true })).toBeVisible();
  await expect(figures.getByText('−$1,200', { exact: true })).toBeVisible();
  await expect(page.getByTestId('unchanged')).toBeEmpty();
});

test('the sheet rises from the bottom on a phone and is a centred dialog on a computer', async ({
  page,
}, testInfo) => {
  await page.goto('/app/gallery');
  const open = page.getByRole('button', { name: 'Open the sheet' });
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Add a value' });
  await expect(sheet).toBeVisible();
  // Let the entry transition settle before measuring.
  await expect
    .poll(() => sheet.evaluate((el) => getComputedStyle(el).transform))
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  // The page's own width: a classic scrollbar's gutter stays reserved beside it.
  const width = await page.evaluate(() => document.body.getBoundingClientRect().width);
  if (!box || !viewport) throw new Error('The sheet has no box.');
  if (isPhone(testInfo)) {
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
    expect(Math.round(box.width)).toBe(Math.min(Math.round(width), 520));
  } else {
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.round(box.width)).toBe(460);
    expect(box.y).toBeGreaterThan(0);
  }

  // Save is unavailable until there is an amount; it stays solid, and a tap on it does nothing.
  const save = sheet.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await save.click({ force: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('textbox', { name: 'Amount in SGD' }).fill('250');
  await expect(save).not.toHaveAttribute('aria-disabled');
  await save.click();
  await expect(sheet).toBeHidden();
  await expect(open).toBeFocused();

  // A tap on the backdrop closes it, as Escape does.
  await open.click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(sheet).toBeHidden();
});

test('a toast offers its one follow-up, and choosing it dismisses the toast', async ({ page }) => {
  await page.goto('/app/gallery');
  await page.getByRole('button', { name: 'Show a toast' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'Value saved.' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Value saved.')).toHaveCount(0);
  await expect(page.getByText('Undone.')).toBeVisible();
});
