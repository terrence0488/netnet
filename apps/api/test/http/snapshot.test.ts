import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyNumber, like } from '../ledger/support';
import {
  errorOf,
  json,
  ledgerApp,
  newPerson,
  onboarded,
  send,
  typeIdOf,
  type LedgerApp,
  type Person,
  type WriteBody,
} from './support';

/**
 * `GET /api/snapshot` (architecture §7.2): the whole position in one call, values compact per
 * holding; `304` while the data version the web app holds is current; the size and value count
 * logged for §7.2's revisit trigger. It takes no input, so there is no validation case.
 */
let db: TestDatabase;
let target: LedgerApp;
let p: Person;
let holdingId: string;
let valueIds: string[];

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
  p = await onboarded(target);
  const made = await json<WriteBody<{ id: string }>>(
    await p.post('/api/holdings', {
      name: 'Travel money',
      kind: 'asset',
      typeId: await typeIdOf(p, 'cash'),
      currency: 'GBP',
      opening: { amount: '300', date: '2026-07-01' },
      via: 'form',
    }),
  );
  holdingId = made.result.id;
  const later = await json<WriteBody<{ id: string }>>(
    await p.post(`/api/holdings/${holdingId}/values`, { amount: '450', date: '2026-07-31' }),
  );
  const { rows } = await db.owner.query<{ id: string }>(
    'select id from ledger.value where holding_id = $1 order by date',
    [holdingId],
  );
  valueIds = rows.map((r) => r.id);
  expect(valueIds.at(-1)).toBe(later.result.id);
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  target?.restore();
  await db?.close();
});

describe('GET /api/snapshot', () => {
  it('answers the whole position, values compact per holding, oldest first', async () => {
    const res = await p.get('/api/snapshot');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await json(res);
    expect(Object.keys(body)).toStrictEqual([
      'dataVersion',
      'baseCurrency',
      'packRef',
      'prefs',
      'types',
      'tags',
      'holdings',
      'values',
    ]);
    expect(res.headers.get('ETag')).toBe(`"${String(body.dataVersion)}"`);
    expect(body).toMatchObject({
      baseCurrency: 'EUR',
      packRef: [
        { key: 'qz', version: 1 },
        { key: 'generic', version: 1 },
      ],
      holdings: [like({ id: holdingId, name: 'Travel money', currency: 'GBP' })],
    });
    // GBP 1 = EUR 0.8 / 0.75 in the suite's fake rates.
    expect(body.values).toStrictEqual({
      [holdingId]: [
        ['2026-07-01', 30000, 'GBP', 32000, 'web', null, valueIds[0]],
        ['2026-07-31', 45000, 'GBP', 48000, 'web', null, valueIds[1]],
      ],
    });
  });

  it('answers 304 while the data version is current, and 200 once it is not', async () => {
    const { dataVersion } = await json<{ dataVersion: number }>(await p.get('/api/snapshot'));
    for (const tag of [
      String(dataVersion),
      `"${dataVersion}"`,
      `W/"${dataVersion}"`,
      `"0", "${dataVersion}"`,
      '*',
    ]) {
      const res = await p.get('/api/snapshot', { 'If-None-Match': tag });
      expect(res.status, tag).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('ETag')).toBe(`"${dataVersion}"`);
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    }
    for (const tag of [String(dataVersion - 1), 'v1', '']) {
      expect((await p.get('/api/snapshot', { 'If-None-Match': tag })).status, tag).toBe(200);
    }

    await json(await p.patch('/api/prefs', { sort: 'name' }));
    const res = await p.get('/api/snapshot', { 'If-None-Match': String(dataVersion) });
    const body = await json<{ dataVersion: number }>(res);
    expect(body.dataVersion).toBe(dataVersion + 1);
  });

  it('logs its size, raw and gzipped, and its value count, after the response', async () => {
    await target.settle();
    const lines: Record<string, unknown>[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(JSON.parse(String(line)) as Record<string, unknown>);
    });
    const res = await p.get('/api/snapshot');
    const text = await res.text();
    await target.settle();
    const logged = lines.filter((l) => l.event === 'snapshot_sent');
    expect(logged).toStrictEqual([
      {
        event: 'snapshot_sent',
        requestId: res.headers.get('X-Request-Id'),
        userId: p.userId,
        bytes: Buffer.byteLength(text),
        gzipBytes: anyNumber,
        valueCount: 2,
      },
    ]);
    expect(logged[0]?.gzipBytes).toBeLessThan(Buffer.byteLength(text));

    lines.length = 0;
    const { dataVersion } = JSON.parse(text) as { dataVersion: number };
    await p.get('/api/snapshot', { 'If-None-Match': String(dataVersion) });
    await target.settle();
    expect(lines.filter((l) => l.event === 'snapshot_sent')).toStrictEqual([]);
  });

  it('answers NOT_FOUND before the ledger exists', async () => {
    const fresh = await newPerson(target);
    expect(await errorOf(await fresh.get('/api/snapshot'), 404)).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await fresh.get('/api/snapshot', { 'If-None-Match': '*' })).status).toBe(404);
  });

  it('needs a session', async () => {
    const res = await send(target, null, 'GET', '/api/snapshot');
    expect(await errorOf(res, 401)).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('reads with the person’s country: a country without a pack has generic only', async () => {
    const other = await onboarded(target, 'US');
    expect(await json(await other.get('/api/snapshot'))).toMatchObject({
      baseCurrency: 'USD',
      packRef: [{ key: 'generic', version: 1 }],
    });
  });
});
