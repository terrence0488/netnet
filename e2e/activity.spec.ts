/// <reference lib="dom" />
import { UNIVERSALS, type Pack, type Universal } from '@netnet/contracts';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  recordProblems,
  signedUp,
} from './accounts';
import { EMPTY_SNAPSHOT, mockConnections, mockPacks, SIGNED_IN, snapshotEtag } from './support';

/**
 * The Activity screen (PRD J7), at 390 and 1280px: the log newest first grouped by agent turn,
 * each entry with old → new, who did it and when; a record only, with no Undo and nothing that
 * changes data; a former undo entry read as the change it made; types by their labels in the
 * person's pack chain, and a value's date as the screen's other dates; the empty state; cursor
 * paging with limit ≤ 100; axe; the events (none of its own). All data is fictional. Labels are
 * read from the packs, never written here.
 */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

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
  /** The snapshot's pack chain: generic alone unless given. */
  packRef?: { key: string; version: number }[];
}

/** A pack as `content/packs` holds it, as `mockPacks` serves it. */
function packFile(key: string): Pack {
  return JSON.parse(
    readFileSync(new URL(`../content/packs/${key}.json`, import.meta.url), 'utf8'),
  ) as Pack;
}

/** A universal type's label in a chain: the first pack that labels it. */
function labelIn(chain: readonly Pack[], u: Universal): string {
  const label = chain.map((pack) => pack.labels[u]).find((found) => found !== undefined);
  if (label === undefined) throw new Error(`The chain has no label for ${u}.`);
  return label;
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
  const packRef = script.packRef ?? [{ key: 'generic', version: 1 }];
  await page.route('**/api/snapshot', (route) =>
    route.fulfill({
      json: { ...EMPTY_SNAPSHOT, dataVersion: 1, packRef },
      headers: { ETag: snapshotEtag(1, packRef) },
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
  expect(body.indexOf('Updated the value for Oct 11, 2026')).toBeLessThan(
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

  const rows = page.locator('main').getByText('Updated the value for Oct 11, 2026');
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

test('types read by their labels in the chain, and a value’s date as the other dates', async ({
  page,
}, testInfo) => {
  const country = packFile('sg');
  const chain = [country, packFile('generic')];
  const packType = country.types[0];
  if (!packType) throw new Error('The country pack has no type of its own.');
  const typeSide = (over: Record<string, unknown>) => ({
    id: 'typ_1',
    universal: packType.u,
    packTypeKey: packType.key,
    customName: null,
    sort: 12,
    archived: false,
    ...over,
  });
  const packTypeRename = entry({
    id: 'aud_7',
    at: '2026-10-12T15:00:00.000Z',
    entity: 'type',
    entityId: 'typ_1',
    before: typeSide({}),
    after: typeSide({ customName: 'My car' }),
    summary: 'Renamed type to "My car"',
  });
  const plainRename = entry({
    id: 'aud_6',
    at: '2026-10-12T14:30:00.000Z',
    entity: 'type',
    entityId: 'typ_2',
    before: typeSide({ id: 'typ_2', universal: 'listed', packTypeKey: null }),
    after: typeSide({ id: 'typ_2', universal: 'listed', packTypeKey: null, customName: 'Shares' }),
    summary: 'Renamed type to "Shares"',
  });
  const recorded = entry({
    id: 'aud_5',
    at: '2026-10-12T14:00:00.000Z',
    action: 'create',
    after: { ...money(120_000), date: '2026-05-20' },
    summary: 'Recorded a value for 2026-05-20',
  });
  await asActivity(page, {
    pages: [[packTypeRename, plainRename, recorded]],
    packRef: [
      { key: country.id, version: 1 },
      { key: 'generic', version: 1 },
    ],
  });
  const problems = recordProblems(page);
  await page.goto('/app/activity');

  // Both sides of a rename by the chain's labels, as every other screen names the type.
  await expect(page.getByText('Renamed type to "My car"')).toBeVisible();
  await expect(page.getByText(`“${packType.label}” → “My car”`)).toBeVisible();
  await expect(page.getByText(`“${labelIn(chain, 'listed')}” → “Shares”`)).toBeVisible();
  // The value's date as the screen's other dates read, never as the agent's YYYY-MM-DD.
  await expect(page.getByText('Recorded a value for May 20, 2026')).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body).not.toContain('2026-05-20');
  expect(body).not.toContain(packType.key);
  expect(body).not.toContain('“listed”');
  await expectSoundScreen(page, testInfo);
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

/**
 * Against the built app and its database: a new account's log names every type by its label in
 * the live packs, and after a country move older entries read with the new chain's labels.
 */
test.describe('a real account’s log', () => {
  onlyAgainstTheLocalApp();

  /** The live version of a pack, as the server reads it. */
  async function livePack(page: Page, key: string): Promise<Pack> {
    const current = (await (await page.request.get('/api/content/current')).json()) as Record<
      string,
      Record<string, number>
    >;
    const version = current['pack']?.[key];
    expect(version, `a live ${key} pack`).toBeDefined();
    return (await (await page.request.get(`/api/content/pack/${key}@${version}`)).json()) as Pack;
  }

  /** The type entries the screen shows, sorted. */
  async function typeEntries(page: Page): Promise<string[]> {
    await page.goto('/app/activity');
    await expect(page.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible();
    await expect(page.getByText(/^Added type /).first()).toBeVisible();
    const lines = (await page.locator('main').innerText()).split('\n');
    return lines.filter((line) => /^(Added|Removed|Renamed) type/.test(line)).sort();
  }

  test('names each type by its label, and follows a move to another country', async ({
    page,
  }, testInfo) => {
    const person = newPerson(testInfo);
    await arriveAs(page, person, 'SG');
    await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
    const problems = recordProblems(page);
    const generic = await livePack(page, 'generic');
    const sg = await livePack(page, 'sg');
    const gb = await livePack(page, 'gb');
    const keys = [...UNIVERSALS, ...sg.types.map((t) => t.key), ...gb.types.map((t) => t.key)];
    const showsNoKey = (entries: string[]) => {
      for (const line of entries) {
        expect(
          keys.some((key) => line.includes(`"${key}"`)),
          line,
        ).toBe(false);
      }
    };
    const added = (label: string) => `Added type "${label}"`;

    // A type the person makes, and a holding with a value, so the move adds types beside theirs.
    const headers = { 'x-forwarded-for': person.ip };
    const made = await page.request.post('/api/types', {
      headers,
      data: { name: 'Art', universal: 'other' },
    });
    expect(made.status(), 'POST /api/types').toBe(200);
    const holding = await page.request.post('/api/holdings', {
      headers,
      data: {
        name: 'Wallet',
        kind: 'asset',
        universal: 'cash',
        currency: 'SGD',
        opening: { amount: '100', date: '2026-05-20' },
        via: 'form',
      },
    });
    expect(holding.status(), 'POST /api/holdings').toBe(200);

    const sgChain = [sg, generic];
    const before = await typeEntries(page);
    expect(before).toStrictEqual(
      [
        ...UNIVERSALS.map((u) => added(labelIn(sgChain, u))),
        ...sg.types.map((t) => added(t.label)),
        added('Art'),
      ].sort(),
    );
    showsNoKey(before);
    await expect(page.getByText('Recorded a value for May 20, 2026')).toBeVisible();

    // The move: the new pack's types are added, and every entry reads with the new chain.
    const moved = await page.request.patch('/api/me', { headers, data: { country: 'GB' } });
    expect(moved.status(), 'PATCH /api/me').toBe(200);
    const gbChain = [gb, generic];
    const after = await typeEntries(page);
    expect(after).toStrictEqual(
      [
        ...UNIVERSALS.map((u) => added(labelIn(gbChain, u))),
        // The first country's own types: the new chain has no such key, so their universal type.
        ...sg.types.map((t) => added(labelIn(gbChain, t.u))),
        added('Art'),
        ...gb.types.map((t) => added(t.label)),
      ].sort(),
    );
    showsNoKey(after);
    expect(problems).toStrictEqual([]);
  });
});
