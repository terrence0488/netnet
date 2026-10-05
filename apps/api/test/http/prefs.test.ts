import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyNumber, anyString } from '../ledger/support';
import {
  errorOf,
  json,
  ledgerApp,
  onboarded,
  send,
  snapshotOf,
  typeIdOf,
  unknownId,
  type LedgerApp,
  type Person,
  type WriteBody,
} from './support';

/**
 * `PATCH /api/prefs` (architecture §7.2, PRD J4, J11): filters, exclusions, the baseline and the
 * sort. Its happy path, a validation error naming the fields, and not-found (a filter naming an
 * id that is not the person's).
 */
let db: TestDatabase;
let target: LedgerApp;
let p: Person;

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
  p = await onboarded(target);
}, 60_000);

afterAll(async () => {
  target?.restore();
  await db?.close();
});

describe('PATCH /api/prefs', () => {
  it('sets prefs, clears one with null, and the snapshot carries them', async () => {
    const cash = await typeIdOf(p, 'cash');
    const set = await json<WriteBody>(
      await p.patch('/api/prefs', {
        homeFilter: { show: 'assets', typeIds: [cash] },
        baseline: 'last_month',
        sort: 'value_desc',
      }),
    );
    expect(set).toStrictEqual({
      result: {
        homeFilter: { show: 'assets', typeIds: [cash] },
        baseline: 'last_month',
        sort: 'value_desc',
      },
      dataVersion: anyNumber,
      warnings: [],
    });

    const cleared = await json<WriteBody>(await p.patch('/api/prefs', { baseline: null }));
    expect(cleared.result).toStrictEqual({
      homeFilter: { show: 'assets', typeIds: [cash] },
      sort: 'value_desc',
    });
    const snapshot = await snapshotOf(p);
    expect(snapshot).toMatchObject({ dataVersion: cleared.dataVersion, prefs: cleared.result });
  });

  it('names each bad field', async () => {
    const cases: [unknown, string][] = [
      [{ sort: 'random' }, 'sort'],
      [{ baseline: 'yesterday' }, 'baseline'],
      [{ homeFilter: { show: 'some' } }, 'homeFilter.show'],
      [{ homeFilter: { typeIds: 'all' } }, 'homeFilter.typeIds'],
      [{ theme: 'dark' }, 'theme'],
      [[], 'body'],
    ];
    for (const [body, field] of cases) {
      const error = await errorOf(await p.patch('/api/prefs', body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
  });

  it('answers NOT_FOUND for a filter naming an id that is not the person’s', async () => {
    const error = await errorOf(
      await p.patch('/api/prefs', { insightsFilter: { hideHoldingIds: [unknownId('hld')] } }),
      404,
    );
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      fields: { 'insightsFilter.hideHoldingIds[0]': anyString },
    });
  });

  it('needs a session', async () => {
    const res = await send(target, null, 'PATCH', '/api/prefs', { json: { sort: 'name' } });
    expect(res.status).toBe(401);
  });
});
