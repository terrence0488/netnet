/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import {
  VIEWPORTS,
  asSignedIn,
  expectNoHorizontalScroll,
  expectNoSeriousAxeViolations,
  expectTapTargets,
  expectTextAtLeast,
  hitTarget,
  isPhone,
  scrollY,
} from './support';

/**
 * The shell's screens: the tabs, the gallery (long, every component) and an unknown address. They
 * are a signed-in person's, so every test here is signed in.
 */
const SCREENS = ['/app/', '/app/agent', '/app/account', '/app/gallery', '/app/no/such/screen'];

test.beforeEach(({ page }) => asSignedIn(page));

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Tabs' });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main' });

/**
 * The content column, and the room either side of it within the shell. The shell is measured
 * rather than the viewport: a classic scrollbar's gutter is reserved (scrollbar-gutter: stable),
 * and documentElement.clientWidth does not report it.
 */
async function mainBox(page: Page) {
  await expect(page.getByRole('main')).toBeVisible();
  return page.evaluate(() => {
    const shell = document.querySelector('[data-chrome]')?.getBoundingClientRect();
    const main = document.querySelector('main')?.getBoundingClientRect();
    if (!shell || !main) throw new Error('No shell or main column on the page.');
    return {
      x: Math.round(main.x),
      width: Math.round(main.width),
      left: Math.round(main.left - shell.left),
      right: Math.round(shell.right - main.right),
    };
  });
}

test.describe('on a phone', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'phone layout');

  test('bottom tabs and no sidebar, with no sideways scroll at 320 and 390px', async ({ page }) => {
    for (const viewport of [VIEWPORTS.narrow, VIEWPORTS.phone]) {
      await page.setViewportSize(viewport);
      for (const path of SCREENS) {
        await page.goto(path);
        await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
        await expect(tabs(page)).toBeVisible();
        await expect(sidebar(page)).toBeHidden();
        await expectNoHorizontalScroll(page);
        await expectTextAtLeast(page, 11);
      }
    }
  });

  test('the tab bar sits on the bottom edge and marks the current tab', async ({ page }) => {
    await page.goto('/app/agent');
    const bar = await tabs(page).boundingBox();
    expect(bar && Math.round(bar.y + bar.height)).toBe(VIEWPORTS.phone.height);
    await expect(tabs(page).getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await tabs(page).getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Net worth' })).toBeVisible();
    await expect(tabs(page).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('on a computer', () => {
  test.skip(({ hasTouch }) => hasTouch, 'computer layout');

  test('the sidebar replaces the tabs from 900px', async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 800 });
    await page.goto('/app/');
    await expect(tabs(page)).toBeVisible();
    await expect(sidebar(page)).toBeHidden();

    await page.setViewportSize({ width: 900, height: 800 });
    await expect(sidebar(page)).toBeVisible();
    await expect(tabs(page)).toBeHidden();

    await page.setViewportSize(VIEWPORTS.computer);
    await expect(sidebar(page).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await sidebar(page).getByRole('link', { name: 'Agent' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Agent' })).toBeVisible();
    await expect(page).toHaveTitle('Agent · NetNet');
    await expectNoHorizontalScroll(page);
  });

  test('the measure grows on wide screens, then stays capped and centred', async ({ page }) => {
    const sidebarWidth = 232;
    for (const [width, measure] of [
      [1600, 1340],
      [1920, 1440],
      [2560, 1440],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/app/');
      const main = await mainBox(page);
      expect(main.width, `the measure at ${width}px`).toBe(measure);
      expect(
        Math.abs(main.left - sidebarWidth - main.right),
        `centred beside the sidebar at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

test('the content column’s width depends on the viewport, never on the screen', async ({
  page,
}) => {
  for (const viewport of [
    VIEWPORTS.narrow,
    VIEWPORTS.phone,
    VIEWPORTS.computer,
    { width: 1600, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const boxes = [];
    for (const path of SCREENS) {
      await page.goto(path);
      boxes.push(await mainBox(page));
    }
    const [first] = boxes;
    for (const box of boxes) expect(box, `at ${viewport.width}px`).toStrictEqual(first);
  }
});

test('a route without chrome is one centred column, with neither nav', async ({ page }) => {
  for (const viewport of [VIEWPORTS.phone, VIEWPORTS.computer]) {
    await page.setViewportSize(viewport);
    await page.goto('/app/gallery/no-chrome');
    await expect(page.getByRole('heading', { level: 1, name: 'Gallery' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    const main = await mainBox(page);
    expect(Math.abs(main.left - main.right), `centred at ${viewport.width}px`).toBeLessThanOrEqual(
      1,
    );
    expect(main.width).toBeLessThanOrEqual(480);
    await expectNoHorizontalScroll(page);
  }
});

test('every control is at least the hit target, and none overlap', async ({ page }, testInfo) => {
  const min = hitTarget(testInfo);
  expect(
    await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches),
    'the pointer the project emulates',
  ).toBe(!isPhone(testInfo));
  for (const path of SCREENS) {
    await page.goto(path);
    await expectTapTargets(page, min);
  }
  await page.goto('/app/gallery');
  await page.getByRole('button', { name: 'Open the sheet' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a value' })).toBeVisible();
  await expectTapTargets(page, min);
});

test('no screen logs an error or throws', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  for (const path of [...SCREENS, '/app/gallery/no-chrome']) {
    await page.goto(path);
    await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
  }
  expect(problems).toStrictEqual([]);
});

test('axe finds nothing serious on the shell, in both themes', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const path of ['/app/', '/app/agent', '/app/account', '/app/no/such/screen']) {
      await page.goto(path);
      await expectNoSeriousAxeViolations(page);
    }
  }
});

test('only a route change scrolls to the top', async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 390, height: 560 });
  await page.goto('/app/gallery');
  await page.getByRole('button', { name: 'Show a toast' }).scrollIntoViewIfNeeded();
  const y = await scrollY(page);
  expect(y, 'the controls sit below the first screenful').toBeGreaterThan(0);

  // Updating the screen in place leaves the reader where they were.
  await page.getByRole('button', { name: 'Show a toast' }).click();
  await expect(page.getByText('Value saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Open the sheet' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Open the sheet' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await scrollY(page)).toBe(y);

  // Going to another screen starts at the top, and so does coming back.
  await page.getByRole('link', { name: 'Agent' }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Agent' })).toBeVisible();
  expect(await scrollY(page)).toBe(0);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Gallery' })).toBeVisible();
  expect(await scrollY(page)).toBe(0);
});

test('reduced motion: nothing moves', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/gallery');
  const button = page.getByRole('button', { name: 'Add what you have' });
  expect(await button.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(
    /^0s(, 0s)*$/,
  );
  expect(
    await page
      .getByRole('status')
      .filter({ hasText: 'Loading' })
      .locator('span')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: 'Open the sheet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a value' });
  expect(await sheet.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(
    /^0s(, 0s)*$/,
  );
});

test('the web app is installable: its manifest, icons and fonts are served under /app', async ({
  page,
  request,
}) => {
  await page.goto('/app/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/app/manifest.webmanifest');
  const response = await request.get(href ?? '');
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as {
    scope: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({ scope: '/app/', start_url: '/app/', display: 'standalone' });
  expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(
    expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
  );
  for (const icon of manifest.icons) {
    const file = await request.get(new URL(icon.src, response.url()).href);
    expect(file.status(), icon.src).toBe(200);
  }
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((face) => `${face.family.replace(/"/g, '')}: ${face.status}`);
  });
  expect(faces).toEqual(expect.arrayContaining(['Unbounded: loaded', 'Space Grotesk: loaded']));
});

test('Account lists one column, Your agent and Log out last, at phone and computer widths', async ({
  page,
}) => {
  for (const viewport of [VIEWPORTS.phone, VIEWPORTS.computer]) {
    await page.setViewportSize(viewport);
    await page.goto('/app/account');
    const settings = page.getByRole('heading', { name: 'Settings' });
    const agent = page.getByRole('heading', { name: 'Your agent' });
    const logOut = page.getByRole('button', { name: 'Log out' });
    await expect(settings).toBeVisible();
    await expect(agent).toBeVisible();
    await expect(logOut).toBeVisible();
    const [settingsBox, agentBox, logOutBox] = await Promise.all([
      settings.boundingBox(),
      agent.boundingBox(),
      logOut.boundingBox(),
    ]);
    if (!settingsBox || !agentBox || !logOutBox) {
      throw new Error('Account sections are not all visible.');
    }
    expect(
      agentBox.y,
      `Your agent sits below Settings at ${viewport.width}px`,
    ).toBeGreaterThanOrEqual(settingsBox.y + settingsBox.height);
    expect(
      logOutBox.y,
      `Log out sits below Your agent at ${viewport.width}px`,
    ).toBeGreaterThanOrEqual(agentBox.y + agentBox.height);
  }
});
