/// <reference lib="dom" />
/**
 * The landing page at `/` (PRD G-D1, G-D4): §2.5's line first, both proofs and the trust points,
 * sign-up one tap away; `landing_view` fired once per load with no cookie and nothing stored in
 * the browser; noindex, robots.txt and link previews; usable at 390 and 1280px, nothing sideways
 * at 320px, axe clean, and light. At both widths, against the built app.
 */
import { withClient } from '@netnet/api/db/client';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
} from '@playwright/test';
import { createHash } from 'node:crypto';
import {
  VIEWPORTS,
  expectNoHorizontalScroll,
  expectNoSeriousAxeViolations,
  expectTapTargets,
  expectTextAtLeast,
  hitTarget,
  isPhone,
} from './support';

const LINE = 'You can’t get useful advice from an AI that doesn’t know where you stand.';

/** The page's HTML, CSS, fonts and script together stay under this (P4-T2). */
const MAX_PAGE_BYTES = 300 * 1024;

let made = 0;

/**
 * A browser of its own: its own address (x-forwarded-for, which only Vercel overwrites), so the
 * per-IP event limit and the visitor hash are this test's alone, and a user agent no other test
 * has.
 */
async function visitor(
  browser: Browser,
  options: { javaScriptEnabled?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page; ip: string; userAgent: string }> {
  made += 1;
  const id = `${process.pid}-${Date.now()}-${made}`;
  const ip = `198.51.100.${(process.pid + made) % 250}`;
  const userAgent = `Mozilla/5.0 (NetNet E2E ${id}) AppleWebKit/537.36 Chrome/150.0 Safari/537.36`;
  const context = await browser.newContext({
    ...options,
    userAgent,
    extraHTTPHeaders: { 'x-forwarded-for': ip },
  });
  return { context, page: await context.newPage(), ip, userAgent };
}

/** The `POST /api/events` requests the page sends while `during` runs and the page settles. */
async function eventsSent(page: Page, during: () => Promise<unknown>) {
  const sent: { body: unknown; cookie: string | undefined; status: Promise<number> }[] = [];
  const listener = (request: Request) => {
    if (new URL(request.url()).pathname !== '/api/events') return;
    sent.push({
      body: request.postDataJSON() as unknown,
      cookie: request.headers().cookie,
      status: request.response().then((response) => response?.status() ?? 0),
    });
  };
  page.on('request', listener);
  await during();
  await page.waitForLoadState('networkidle');
  page.off('request', listener);
  return sent;
}

test.describe('the landing page', () => {
  test('states §2.5’s line first, carries both proofs and the trust points, and promises nothing more', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('NetNet');
    const headings = page.getByRole('heading');
    await expect(headings.first()).toHaveText(LINE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LINE);

    for (const proof of ['A first picture in minutes.', 'Kept current, and readable by your AI.']) {
      await expect(page.getByRole('heading', { level: 2, name: proof })).toBeVisible();
    }
    await expect(page.getByText('Never added it up?')).toBeVisible();
    await expect(page.getByText('Already keep the numbers?')).toBeVisible();

    const trust = page.getByRole('region', { name: 'Your data stays yours.' });
    for (const point of [
      'Stored in Singapore',
      'Never sold',
      'Statements stay with you',
      'Every connection confirmed',
      'Every change on the record',
      'Leave whenever you like',
    ]) {
      await expect(trust.getByRole('heading', { level: 3, name: point })).toBeVisible();
    }
    await expect(trust).toContainText('erased within 30 days');
    await expect(trust).toContainText('never reaches us');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Free. And what’s free stays free.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Works with Claude.' })).toBeVisible();

    const text = (await page.locator('body').innerText()).replace(/[’']/g, "'");
    expect(text).not.toMatch(/don't know (what you're worth|your net worth)/i);
    expect(await page.content()).not.toMatch(/chatgpt|openai/i);
  });

  test('opens sign-up from its call to action, and sign-in quietly', async ({ page }) => {
    await page.goto('/');
    const start = page.getByRole('link', { name: 'Get started' });
    await expect(start).toHaveCount(2);
    for (const link of await start.all()) await expect(link).toHaveAttribute('href', '/app/signup');
    const signIn = page.getByRole('link', { name: 'Sign in' });
    for (const link of await signIn.all()) await expect(link).toHaveAttribute('href', '/app/login');

    await start.first().click();
    await expect(page).toHaveURL(/\/app\/signup$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeVisible();

    await page.goto('/');
    await signIn.first().click();
    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
  });

  test('fires landing_view once per load, sends and sets no cookie, and stores nothing', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await visitor(browser);
    // A cookie the browser already holds for the site must not ride along with the event.
    await context.addCookies([{ name: 'e2e_probe', value: '1', url: baseURL ?? '' }]);

    const first = await eventsSent(page, () => page.goto('/'));
    expect(first.map((e) => e.body)).toStrictEqual([{ name: 'landing_view', props: {} }]);
    expect(await first[0]?.status).toBe(204);
    expect(first[0]?.cookie).toBeUndefined();

    const again = await eventsSent(page, () => page.reload());
    expect(again.map((e) => e.body)).toStrictEqual([{ name: 'landing_view', props: {} }]);

    expect((await context.cookies()).map((c) => c.name)).toStrictEqual(['e2e_probe']);
    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length,
    }));
    expect(stored).toStrictEqual({ local: 0, session: 0, databases: 0, caches: 0 });
    await context.close();
  });

  test('records one visitor for one browser in a day, and another for another browser', async ({
    browser,
  }) => {
    test.skip(
      Boolean(process.env.E2E_BASE_URL) || !process.env.DATABASE_URL,
      'reads the local database the built app writes to (DATABASE_URL)',
    );
    const a = await visitor(browser);
    const b = await visitor(browser);
    await eventsSent(a.page, () => a.page.goto('/'));
    await eventsSent(a.page, () => a.page.reload());
    await eventsSent(b.page, () => b.page.goto('/'));

    const { rows } = await withClient(process.env.DATABASE_URL ?? '', async (client) => {
      const salt = await client.query<{ salt: Buffer }>(
        `select salt from core.visitor_salt where day = (now() at time zone 'utc')::date`,
      );
      const key = salt.rows[0]?.salt ?? Buffer.alloc(0);
      const hash = (ip: string, ua: string) =>
        createHash('sha256').update(key).update(ip).update('\0').update(ua).digest('hex');
      const ofA = hash(a.ip, a.userAgent).slice(0, 16);
      const ofB = hash(b.ip, b.userAgent).slice(0, 16);
      return client.query<{ visitor: string; views: number; users: number; segments: string[] }>(
        `select visitor, count(*)::int as views, count(user_id)::int as users,
                array_agg(distinct segment) as segments
           from analytics.event
          where name = 'landing_view' and visitor = any($1)
          group by visitor order by views desc`,
        [[ofA, ofB]],
      );
    });
    // Browser A's two loads share one visitor; browser B is another. No user, segment unknown.
    expect(rows.map((r) => [r.views, r.users, r.segments])).toStrictEqual([
      [2, 0, ['unknown']],
      [1, 0, ['unknown']],
    ]);
    for (const row of rows) expect(row.visitor).toMatch(/^[0-9a-f]{16}$/);
    await a.context.close();
    await b.context.close();
  });

  test('works without JavaScript, firing nothing', async ({ browser }) => {
    const { context, page } = await visitor(browser, { javaScriptEnabled: false });
    const sent = await eventsSent(page, () => page.goto('/'));
    expect(sent).toStrictEqual([]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LINE);
    await page.getByRole('link', { name: 'Get started' }).first().click();
    await expect(page).toHaveURL(/\/app\/signup$/);
    await context.close();
  });

  test('stays out of search until launch, and previews with the title, the line and an image', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect((await robots.text()).split('\n')).toEqual(
      expect.arrayContaining(['User-agent: *', 'Disallow: /']),
    );

    const meta = (selector: string) => page.locator(`meta[${selector}]`).getAttribute('content');
    expect(await meta('property="og:title"')).toBe('NetNet');
    expect(await meta('property="og:description"')).toBe(LINE);
    expect(await meta('name="twitter:card"')).toBe('summary_large_image');
    const image = (await meta('property="og:image"')) ?? '';
    expect(image).toMatch(/\/og\.png$/);
    expect(await meta('name="twitter:image"')).toBe(image);

    const png = await request.get(new URL(image, page.url()).pathname);
    expect(png.status()).toBe(200);
    const bytes = await png.body();
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toStrictEqual([1200, 630]);

    const icon = page.locator('link[rel="icon"]');
    expect((await request.get((await icon.getAttribute('href')) ?? '')).status()).toBe(200);
  });

  test('is usable at this width, axe clean, its targets big enough, and light', async ({
    page,
  }, testInfo) => {
    const weighed: Promise<[string, number]>[] = [];
    page.on('response', (response) => {
      const type = response.request().resourceType();
      if (!['document', 'stylesheet', 'font', 'script'].includes(type)) return;
      weighed.push(response.body().then((body) => [response.url(), body.length]));
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const weights = new Map(await Promise.all(weighed));
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeInViewport();

    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxeViolations(page);
    await expectTapTargets(page, hitTarget(testInfo));
    if (isPhone(testInfo)) await expectTextAtLeast(page, 11);

    const total = [...weights.values()].reduce((sum, bytes) => sum + bytes, 0);
    expect([...weights.keys()].some((url) => url.endsWith('.woff2'))).toBe(true);
    expect(total, 'HTML, CSS, fonts and script').toBeLessThan(MAX_PAGE_BYTES);
  });

  test('never scrolls sideways at the narrowest phone', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.narrow);
    await page.goto('/');
    await expectNoHorizontalScroll(page);
    await expectTextAtLeast(page, 11);
  });
});
