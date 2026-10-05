import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyNumber, COUNTRY_V1, like } from '../ledger/support';
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
    expect(res.headers.get('ETag')).toBe(`"${String(body.dataVersion)}:qz@1:generic@1"`);
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

  it('answers 304 while its ETag is current, and 200 once a write changes it', async () => {
    const first = await p.get('/api/snapshot');
    const etag = first.headers.get('ETag')!;
    const { dataVersion } = await json<{ dataVersion: number }>(first);
    for (const tag of [etag, `W/${etag}`, `"0", ${etag}`, '*']) {
      const res = await p.get('/api/snapshot', { 'If-None-Match': tag });
      expect(res.status, tag).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('ETag')).toBe(etag);
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    }
    // The data version alone is not the ETag: it would miss a content publish.
    for (const tag of [String(dataVersion), `"${dataVersion}"`, 'v1', '']) {
      expect((await p.get('/api/snapshot', { 'If-None-Match': tag })).status, tag).toBe(200);
    }

    await json(await p.patch('/api/prefs', { sort: 'name' }));
    const res = await p.get('/api/snapshot', { 'If-None-Match': etag });
    const body = await json<{ dataVersion: number }>(res);
    expect(body.dataVersion).toBe(dataVersion + 1);
    expect(res.headers.get('ETag')).not.toBe(etag);
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
    await p.get('/api/snapshot', { 'If-None-Match': res.headers.get('ETag')! });
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

  // Last: it publishes a new version of the country's pack.
  it('answers 200 once a content publish changes the pack chain, with no write', async () => {
    const first = await p.get('/api/snapshot');
    const etag = first.headers.get('ETag')!;
    const { dataVersion } = await json<{ dataVersion: number }>(first);
    expect((await p.get('/api/snapshot', { 'If-None-Match': etag })).status).toBe(304);

    target.publish({ kind: 'pack', key: 'qz', version: 2 }, { ...COUNTRY_V1, version: 2 });
    const res = await p.get('/api/snapshot', { 'If-None-Match': etag });
    expect(await json(res)).toMatchObject({
      dataVersion,
      packRef: [
        { key: 'qz', version: 2 },
        { key: 'generic', version: 1 },
      ],
    });
    expect(res.headers.get('ETag')).toBe(`"${dataVersion}:qz@2:generic@1"`);
  });
});
