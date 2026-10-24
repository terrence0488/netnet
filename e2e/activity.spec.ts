/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectSoundScreen, recordProblems } from './accounts';
import { EMPTY_SNAPSHOT, mockConnections, mockPacks, SIGNED_IN, snapshotEtag } from './support';

/**
 * The Activity screen (PRD J7), at 390 and 1280px: the log newest first grouped by agent turn,
 * each entry with old → new, who did it and when; a record only, with no Undo and nothing that
 * changes data; a former undo entry read as the change it made; the empty state; cursor paging
 * with limit ≤ 100; axe; the events (none of its own). All data is fictional.
 */
test.use({ timezoneId: 'UTC' });

const money = (amountMinor: number, currency = 'SGD') => ({ amountMinor, currency });

function entry(over: Record<string, unknown>) {
  return {
    at: '2026-10-12T13:14:00.000Z',
    actor: 'user',
    clientName: null,
    connectionId: null,
    batchId: null,
    action: 'update',
    entity: 'value',
    entityId: 'val_1',
    before: null,
    after: null,
    ...over,
  };
}

const TURN_NEW = entry({
  id: 'aud_3',
  at: '2026-10-12T13:14:00.000Z',
  actor: 'agent',
  clientName: 'Claude',
  connectionId: 'con_1',
  batchId: 'bat_1',
  before: money(5_000_000),
  after: money(6_750_000),
  summary: 'Updated the value for 2026-10-11',
});

const TURN_OLD = entry({
  id: 'aud_2',
  at: '2026-10-12T13:13:00.000Z',
  actor: 'agent',
  clientName: 'Claude',
  connectionId: 'con_1',
  batchId: 'bat_1',
  action: 'create',
  entity: 'holding',
  entityId: 'hld_1',
  after: { name: 'Brokerage account' },
  summary: 'Added “Brokerage account”',
});

const WEB_ENTRY = entry({
  id: 'aud_1',
  at: '2026-10-11T09:00:00.000Z',
  summary: 'Added “Cash”',
  action: 'create',
  entity: 'holding',
  entityId: 'hld_0',
  before: null,
  after: { name: 'Cash' },
});

const REVOCATION = entry({
  id: 'aud_0',
  at: '2026-10-10T18:30:00.000Z',
  entity: 'connection',
  action: 'create',
  entityId: 'con_0',
  clientName: 'Claude',
  after: { clientName: 'Claude' },
  summary: 'Agent disconnected',
});

interface ActivityScript {
  /** Pages of the log; the handler serves the next once the screen passes its cursor. */
  pages: Record<string, unknown>[][];
}

/**
 * The app as a signed-in person sees it, with the log scripted: the requested page limits, the
 * client events, and every request that would change data, all captured.
 */
async function asActivity(page: Page, script: ActivityScript) {
  const limits: number[] = [];
  const events: string[] = [];
  const writes: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith('/api/') &&
      url.pathname !== '/api/events' &&
      request.method() !== 'GET'
    ) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  await page.route('**/api/me', (route) => route.fulfill({ json: SIGNED_IN }));
  await page.route('**/api/events', (route) => {
    events.push((route.request().postDataJSON() as { name: string }).name);
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: { ...EMPTY_SNAPSHOT, dataVersion: 1 },
      headers: { ETag: snapshotEtag(1, [{ key: 'generic', version: 1 }]) },
    }),
  );
  await page.route('**/api/content/current', (route) => route.fulfill({ json: {} }));
  await mockConnections(page, []);
  await mockPacks(page);
  await page.route('**/api/activity**', (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.pathname === '/api/activity') {
      const limit = Number(url.searchParams.get('limit'));
      limits.push(limit);
      const cursor = url.searchParams.get('cursor');
      const index = cursor === null ? 0 : Number(cursor);
      const items = script.pages[index] ?? [];
      const next = index + 1 < script.pages.length ? index + 1 : null;
      return route.fulfill({
        json: { items, nextCursor: next === null ? null : String(next) },
      });
    }
    return route.fallback();
  });
  return { limits, events, writes };
}

test('the log newest first, grouped by turn, with old → new, who and when', async ({
  page,
}, testInfo) => {
  const state = await asActivity(page, { pages: [[TURN_NEW, TURN_OLD, WEB_ENTRY], [REVOCATION]] });
  const problems = recordProblems(page);
  await page.goto('/app/');

  // The screen is one tap away, on a phone and on a computer.
  await page.getByRole('link', { name: 'Activity' }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/activity$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible();

  // One turn reads as one group, newest first.
  await expect(page.getByRole('heading', { level: 2, name: 'Claude' })).toBeVisible();
  await expect(page.getByText('2 changes at once')).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body.indexOf('Updated the value for 2026-10-11')).toBeLessThan(
    body.indexOf('Added “Brokerage account”'),
  );
  expect(body.indexOf('Added “Brokerage account”')).toBeLessThan(body.indexOf('Added “Cash”'));

  // Old → new, who did it and when.
  expect(body).toContain('→');
  expect(body).toContain('SGD');
  expect(body).toContain('You');
  expect(body).toMatch(/2026/);

  // A record only: no Undo, and the one control left pages through the log.
  expect(body).not.toMatch(/undo/i);
  await expect(page.getByRole('button', { name: /undo/i })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button')).toHaveText(['Show older changes']);

  // The next page reads the revocation with its agent and time.
  await page.getByRole('button', { name: 'Show older changes' }).click();
  await expect(page.getByText('Agent disconnected')).toBeVisible();
  expect(state.limits.length).toBeGreaterThan(0);
  for (const limit of state.limits) {
    expect(limit).toBeGreaterThanOrEqual(1);
    expect(limit).toBeLessThanOrEqual(100);
  }
  // Nothing on it changed data, and the flow fires no client event of its own.
  expect(state.writes).toStrictEqual([]);
  expect(state.events.filter((name) => name !== 'session_started')).toStrictEqual([]);
  await expectSoundScreen(page, testInfo);
  expect(problems).toStrictEqual([]);
});

test('a former undo entry reads as the change it made, old → new', async ({ page }) => {
  // What the retired undo wrote reads like any change: here, a value put back from 67,500 to
  // 50,000, after the agent turn it followed.
  const formerUndo = entry({
    id: 'aud_4',
    at: '2026-10-12T14:00:00.000Z',
    before: money(6_750_000),
    after: money(5_000_000),
    summary: 'Updated the value for 2026-10-11',
  });
  const state = await asActivity(page, { pages: [[formerUndo, TURN_NEW, TURN_OLD]] });
  const problems = recordProblems(page);
  await page.goto('/app/activity');

  const rows = page.locator('main').getByText('Updated the value for 2026-10-11');
  await expect(rows).toHaveCount(2);
  const body = await page.locator('main').innerText();
  // Newest first: the change it made, 67,500 → 50,000, above the turn it followed.
  const back = body.search(/67,500\S* → \S*50,000/);
  expect(back).toBeGreaterThan(-1);
  expect(back).toBeLessThan(body.indexOf('Claude'));
  expect(body).toMatch(/50,000\S* → \S*67,500/);
  expect(body).not.toMatch(/undo/i);
  await expect(page.getByRole('button', { name: /undo/i })).toHaveCount(0);
  expect(state.writes).toStrictEqual([]);
  expect(problems).toStrictEqual([]);
});

test('the empty log says so, with the way back', async ({ page }, testInfo) => {
  await asActivity(page, { pages: [[]] });
  const problems = recordProblems(page);
  await page.goto('/app/activity');

  await expect(page.getByRole('heading', { name: 'Nothing has changed yet.' })).toBeVisible();
  await expectSoundScreen(page, testInfo);

  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  expect(problems).toStrictEqual([]);
});
