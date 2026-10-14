/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectSoundScreen, recordProblems } from './accounts';
import { EMPTY_SNAPSHOT, mockConnections, mockPacks, SIGNED_IN, snapshotEtag } from './support';

/**
 * The Activity screen (PRD J7), at 390 and 1280px: the log newest first grouped by agent turn,
 * each entry with old → new, who did it and when; undo of one entry and of a whole turn; a
 * conflict naming the newer change with the offer to undo it first; the empty state; cursor
 * paging with limit ≤ 100; totals refetching after an undo; axe; the events (none of its own).
 * All data is fictional.
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
    undoes: null,
    undoneBy: null,
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

interface UndoAnswer {
  status: number;
  json: unknown;
}

interface ActivityScript {
  /** Pages of the log; the handler serves the next once the screen passes its cursor. */
  pages: Record<string, unknown>[][];
  /** Answers a POST …/undo, newest-first conflicts included. */
  onUndo?: (kind: 'entry' | 'batch', id: string) => UndoAnswer;
  /** The ledger at a snapshot version: version 1 is empty unless this says otherwise. */
  snapshotFor?: (version: number) => Record<string, unknown>;
}

/**
 * The app as a signed-in person sees it, with the log scripted: the requested page limits, the
 * client events, the snapshot reads (totals refetching), and the undo posts, all captured. The
 * log and the snapshot's version can move after an undo, as the server's would.
 */
async function asActivity(page: Page, script: ActivityScript) {
  let log = script.pages;
  let dataVersion = 1;
  const limits: number[] = [];
  const events: string[] = [];
  const counts = { snapshots: 0, undos: 0 };

  await page.route('**/api/me', (route) => route.fulfill({ json: SIGNED_IN }));
  await page.route('**/api/events', (route) => {
    events.push((route.request().postDataJSON() as { name: string }).name);
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/snapshot', (route) => {
    counts.snapshots += 1;
    const snapshot = script.snapshotFor?.(dataVersion) ?? { ...EMPTY_SNAPSHOT, dataVersion };
    return route.fulfill({
      json: snapshot,
      headers: { ETag: snapshotEtag(dataVersion, [{ key: 'generic', version: 1 }]) },
    });
  });
  await page.route('**/api/content/current', (route) => route.fulfill({ json: {} }));
  await mockConnections(page, []);
  await mockPacks(page);
  await page.route('**/api/activity**', (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === 'GET' && url.pathname === '/api/activity') {
      const limit = Number(url.searchParams.get('limit'));
      limits.push(limit);
      const cursor = url.searchParams.get('cursor');
      const index = cursor === null ? 0 : Number(cursor);
      const items = log[index] ?? [];
      const next = index + 1 < log.length ? index + 1 : null;
      return route.fulfill({
        json: { items, nextCursor: next === null ? null : String(next) },
      });
    }
    const undo = url.pathname.match(/^\/api\/activity\/(.+)\/undo$/);
    if (method === 'POST' && undo?.[1]) {
      counts.undos += 1;
      const target = undo[1];
      const batch = target.match(/^batches\/(.+)$/);
      const answer = script.onUndo?.(batch ? 'batch' : 'entry', batch?.[1] ?? target) ?? {
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: 'Gone.' } },
      };
      return route.fulfill({ status: answer.status, json: answer.json });
    }
    return route.fallback();
  });
  return {
    limits,
    events,
    counts,
    setLog: (pages: Record<string, unknown>[][]) => {
      log = pages;
    },
    setVersion: (version: number) => {
      dataVersion = version;
    },
  };
}

function undone(entryId: string, summary: string, at = '2026-10-12T14:00:00.000Z') {
  return entry({
    id: `aud_undo_${entryId}`,
    at,
    action: 'update',
    undoes: entryId,
    summary: `Undid ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`,
  });
}

function undoOk(ids: string[], dataVersion: number): UndoAnswer {
  return {
    status: 200,
    json: {
      result: {
        undone: ids.map((entryId) => ({ entryId, entity: 'value', entityId: 'val_1' })),
        undoIds: ids.map((entryId) => `aud_undo_${entryId}`),
      },
      dataVersion,
      warnings: [],
    },
  };
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

  // One turn, one control; each entry its own Undo; newest first.
  await expect(page.getByRole('heading', { level: 2, name: 'Claude' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo these 2 changes' })).toBeVisible();
  const body = await page.locator('main').innerText();
  expect(body.indexOf('Updated the value for 2026-10-11')).toBeLessThan(
    body.indexOf('Added “Brokerage account”'),
  );
  expect(body.indexOf('Added “Brokerage account”')).toBeLessThan(body.indexOf('Added “Cash”'));
  await expect(page.getByRole('button', { name: 'Undo: Added “Cash”' })).toBeVisible();

  // Old → new, who did it and when.
  expect(body).toContain('→');
  expect(body).toContain('SGD');
  expect(body).toContain('You');
  expect(body).toMatch(/2026/);

  // The next page reads the revocation with its agent and time.
  await page.getByRole('button', { name: 'Show older changes' }).click();
  await expect(page.getByText('Agent disconnected')).toBeVisible();
  expect(state.limits.length).toBeGreaterThan(0);
  for (const limit of state.limits) {
    expect(limit).toBeGreaterThanOrEqual(1);
    expect(limit).toBeLessThanOrEqual(100);
  }
  // The flow fires no client event of its own.
  expect(state.events.filter((name) => name !== 'session_started')).toStrictEqual([]);
  await expectSoundScreen(page, testInfo);
  expect(problems).toStrictEqual([]);
});

test('undoing one entry logs the undo and recomputes the totals', async ({ page }) => {
  const restored = {
    ...EMPTY_SNAPSHOT,
    dataVersion: 2,
    types: [
      {
        id: 'typ_cash',
        universal: 'cash',
        packTypeKey: null,
        customName: null,
        sort: 0,
        archived: false,
      },
    ],
    holdings: [
      {
        id: 'hld_0',
        name: 'Cash',
        kind: 'asset',
        typeId: 'typ_cash',
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
      },
    ],
    values: { hld_0: [['2026-10-11', 100_000, 'SGD', 100_000, 'web', null, 'val_1']] },
  };
  const state = await asActivity(page, {
    pages: [[TURN_NEW, { ...WEB_ENTRY }]],
    snapshotFor: (version) =>
      version >= 2 ? restored : { ...EMPTY_SNAPSHOT, dataVersion: version },
    onUndo: (kind, id) => {
      if (kind === 'entry' && id === 'aud_1') {
        state.setVersion(2);
        state.setLog([
          [undone('aud_1', 'Added “Cash”'), TURN_NEW, { ...WEB_ENTRY, undoneBy: 'aud_undo_aud_1' }],
        ]);
        return undoOk(['aud_1'], 2);
      }
      return { status: 404, json: { error: { code: 'NOT_FOUND', message: 'Gone.' } } };
    },
  });
  const problems = recordProblems(page);
  await page.goto('/app/');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  expect(state.counts.snapshots).toBe(1);

  await page.goto('/app/activity');
  await page.getByRole('button', { name: 'Undo: Added “Cash”' }).click();
  await expect(page.getByText('Undone.')).toBeVisible();
  // The undo is itself visible at the top; the entry stands marked, with no Undo left.
  await expect(page.getByText('Undid added “Cash”')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo: Added “Cash”' })).toHaveCount(0);
  expect(state.counts.undos).toBe(1);

  // The returned dataVersion moved the snapshot on: Home refetches and recomputes.
  await page.getByRole('link', { name: 'Home' }).filter({ visible: true }).first().click();
  await expect.poll(() => state.counts.snapshots).toBeGreaterThan(1);
  await expect(page.getByText('Cash').first()).toBeVisible();
  expect(problems).toStrictEqual([]);
});

test('undoing a turn reverts every change together', async ({ page }) => {
  const state = await asActivity(page, {
    pages: [[TURN_NEW, TURN_OLD, WEB_ENTRY]],
    onUndo: (kind, id) => {
      if (kind === 'batch' && id === 'bat_1') {
        state.setVersion(2);
        state.setLog([
          [
            undone('aud_3', 'Updated the value for 2026-10-11'),
            { ...TURN_NEW, undoneBy: 'aud_undo_aud_3' },
            { ...TURN_OLD, undoneBy: 'aud_undo_aud_2' },
            WEB_ENTRY,
          ],
        ]);
        return undoOk(['aud_3', 'aud_2'], 2);
      }
      return { status: 404, json: { error: { code: 'NOT_FOUND', message: 'Gone.' } } };
    },
  });
  const problems = recordProblems(page);
  await page.goto('/app/activity');

  await page.getByRole('button', { name: 'Undo these 2 changes' }).click();
  await expect(page.getByText('Undone 2 changes.')).toBeVisible();
  await expect(page.getByText(/Undid updated the value/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo these 2 changes' })).toHaveCount(0);
  expect(problems).toStrictEqual([]);
});

test('a conflict names the newer change, undoes it first, then retries', async ({ page }) => {
  let undoneNew = false;
  const state = await asActivity(page, {
    pages: [[TURN_NEW, TURN_OLD]],
    onUndo: (kind, id) => {
      if (kind === 'entry' && id === 'aud_3') {
        undoneNew = true;
        state.setVersion(2);
        state.setLog([
          [
            undone('aud_3', 'Updated the value for 2026-10-11'),
            { ...TURN_NEW, undoneBy: 'aud_undo_aud_3' },
            TURN_OLD,
          ],
        ]);
        return undoOk(['aud_3'], 2);
      }
      if (kind === 'entry' && id === 'aud_2') {
        if (!undoneNew) {
          return {
            status: 409,
            json: {
              error: {
                code: 'UNDO_CONFLICT',
                message: 'Blocked.',
                blockers: [{ entry_id: 'aud_3', action: 'update', at: '2026-10-12T13:14:00.000Z' }],
              },
            },
          };
        }
        state.setVersion(3);
        return undoOk(['aud_2'], 3);
      }
      return { status: 404, json: { error: { code: 'NOT_FOUND', message: 'Gone.' } } };
    },
  });
  // The refused undo answers 409, which the browser logs as a failed load: expected here.
  const problems = recordProblems(page, [/\/api\/activity/]);
  await page.goto('/app/activity');

  await page.getByRole('button', { name: 'Undo: Added “Brokerage account”' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Updated the value for 2026-10-11');
  await expect(alert).toContainText('Undo that first');
  await expect(alert).not.toContainText('aud_3');
  await expect(page.getByText('UNDO_CONFLICT')).toHaveCount(0);

  await page.getByRole('button', { name: /Undo “Updated the value.*first/ }).click();
  await expect(page.getByText('Undone. Try the earlier change again.')).toBeVisible();
  await expect(alert).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo: Added “Brokerage account”' }).click();
  await expect(page.getByText('Undone.')).toBeVisible();
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
