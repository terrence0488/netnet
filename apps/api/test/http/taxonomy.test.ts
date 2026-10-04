import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyNumber, anyString, like } from '../ledger/support';
import {
  errorOf,
  json,
  ledgerApp,
  onboarded,
  snapshotOf,
  typeIdOf,
  unknownId,
  type LedgerApp,
  type Person,
  type WriteBody,
} from './support';

/**
 * Types and tags (architecture §7.2, PRD J2): `POST /api/types`, `PATCH` and `DELETE
 * /api/types/:id?moveTo=`, and the same for tags with `?mergeInto=`. Each route's happy path, a
 * validation error naming the fields, and not-found.
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

interface TypeBody {
  id: string;
  universal: string;
  packTypeKey: string | null;
  customName: string | null;
}

interface TagBody {
  id: string;
  name: string;
}

let names = 0;

async function newType(universal = 'equity'): Promise<TypeBody> {
  names += 1;
  const res = await p.post('/api/types', { name: `Side venture ${names}`, universal });
  return (await json<WriteBody<TypeBody>>(res)).result;
}

async function newTag(): Promise<TagBody> {
  names += 1;
  return (await json<WriteBody<TagBody>>(await p.post('/api/tags', { name: `Goal ${names}` })))
    .result;
}

async function holdingOf(typeId: string, tagIds: string[] = []): Promise<string> {
  names += 1;
  const res = await p.post('/api/holdings', {
    name: `Stake ${names}`,
    kind: 'asset',
    typeId,
    currency: 'EUR',
    tagIds,
    via: 'form',
    allowDuplicate: true,
  });
  return (await json<WriteBody<{ id: string }>>(res)).result.id;
}

async function holdingIn(id: string) {
  const snapshot = await snapshotOf(p);
  return (snapshot.holdings as { id: string; typeId: string; tagIds: string[] }[]).find(
    (h) => h.id === id,
  );
}

describe('POST /api/types', () => {
  it('makes a type of a universal type, with the name given', async () => {
    const res = await p.post('/api/types', { name: 'Garage business', universal: 'equity' });
    const body = await json<WriteBody<TypeBody>>(res);
    expect(body.result).toMatchObject({
      universal: 'equity',
      packTypeKey: null,
      customName: 'Garage business',
    });
    expect((await snapshotOf(p)).types).toContainEqual(like({ id: body.result.id }));
  });

  it('names each bad field, and refuses an id', async () => {
    const cases: [unknown, string][] = [
      [{}, 'name'],
      [{ name: 'X' }, 'universal'],
      [{ name: 'X', universal: 'yacht' }, 'universal'],
      [{ name: 'X', universal: 'cash', id: unknownId('typ') }, 'id'],
      [{ name: 'x'.repeat(121), universal: 'cash' }, 'name'],
    ];
    for (const [body, field] of cases) {
      const error = await errorOf(await p.post('/api/types', body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
  });
});

describe('PATCH /api/types/:id', () => {
  it('renames a type', async () => {
    const type = await newType();
    const body = await json<WriteBody<TypeBody>>(
      await p.patch(`/api/types/${type.id}`, { name: 'Renamed venture' }),
    );
    expect(body.result).toMatchObject({ id: type.id, customName: 'Renamed venture' });
  });

  it('names each bad field, and a malformed id', async () => {
    const type = await newType();
    const cases: [unknown, string][] = [
      [{}, 'name'],
      [{ name: '' }, 'name'],
      [{ name: 'X', universal: 'cash' }, 'universal'],
      [{ name: 'X', id: unknownId('typ') }, 'id'],
    ];
    for (const [body, field] of cases) {
      const error = await errorOf(await p.patch(`/api/types/${type.id}`, body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
    expect(await errorOf(await p.patch('/api/types/cash', { name: 'X' }), 400)).toMatchObject({
      fields: { id: anyString },
    });
  });

  it('answers NOT_FOUND for a type that is not there', async () => {
    expect(
      await errorOf(await p.patch(`/api/types/${unknownId('typ')}`, { name: 'X' }), 404),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('DELETE /api/types/:id', () => {
  it('deletes an unused type, and merges a used one with moveTo', async () => {
    const unused = await newType();
    expect(await json(await p.delete(`/api/types/${unused.id}`))).toMatchObject({ result: null });

    const used = await newType();
    const holding = await holdingOf(used.id);
    const error = await errorOf(await p.delete(`/api/types/${used.id}`), 400);
    expect(error.fields).toStrictEqual({ moveTo: anyString });

    const into = await typeIdOf(p, 'equity');
    const merged = await json<WriteBody<null>>(
      await p.delete(`/api/types/${used.id}?moveTo=${into}`),
    );
    expect(merged).toMatchObject({ result: null, warnings: [] });
    expect((await holdingIn(holding))?.typeId).toBe(into);
  });

  it('names a malformed id or moveTo, and answers NOT_FOUND for either not there', async () => {
    const type = await newType();
    expect(await errorOf(await p.delete('/api/types/typ_1'), 400)).toMatchObject({
      fields: { id: anyString },
    });
    expect(await errorOf(await p.delete(`/api/types/${type.id}?moveTo=cash`), 400)).toMatchObject({
      fields: { moveTo: anyString },
    });
    expect(await errorOf(await p.delete(`/api/types/${unknownId('typ')}`), 404)).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      await errorOf(await p.delete(`/api/types/${type.id}?moveTo=${unknownId('typ')}`), 404),
    ).toMatchObject({ code: 'NOT_FOUND', fields: { moveTo: anyString } });
  });
});

describe('POST /api/tags', () => {
  it('makes a tag', async () => {
    const body = await json<WriteBody<TagBody>>(await p.post('/api/tags', { name: 'Long haul' }));
    expect(body.result).toMatchObject({ name: 'Long haul' });
    expect((await snapshotOf(p)).tags).toContainEqual(like({ id: body.result.id }));
  });

  it('names each bad field, a taken name, and refuses an id', async () => {
    const tag = await newTag();
    const cases: [unknown, string][] = [
      [{}, 'name'],
      [{ name: '  ' }, 'name'],
      [{ name: tag.name.toUpperCase() }, 'name'],
      [{ name: 'Fresh', id: tag.id }, 'id'],
      [{ name: 'Fresh', colour: 'red' }, 'colour'],
    ];
    for (const [body, field] of cases) {
      const error = await errorOf(await p.post('/api/tags', body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
  });
});

describe('PATCH /api/tags/:id', () => {
  it('renames a tag', async () => {
    const tag = await newTag();
    const body = await json<WriteBody<TagBody>>(
      await p.patch(`/api/tags/${tag.id}`, { name: 'Renamed goal' }),
    );
    expect(body.result).toStrictEqual({
      id: tag.id,
      name: 'Renamed goal',
      sort: anyNumber,
    });
  });

  it('names each bad field, and a malformed id', async () => {
    const tag = await newTag();
    for (const [body, field] of [
      [{}, 'name'],
      [{ name: 'X', id: tag.id }, 'id'],
    ] as const) {
      const error = await errorOf(await p.patch(`/api/tags/${tag.id}`, body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
    expect(
      await errorOf(await p.patch(`/api/tags/${unknownId('typ')}`, { name: 'X' }), 400),
    ).toMatchObject({ fields: { id: anyString } });
  });

  it('answers NOT_FOUND for a tag that is not there', async () => {
    expect(
      await errorOf(await p.patch(`/api/tags/${unknownId('tag')}`, { name: 'X' }), 404),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('DELETE /api/tags/:id', () => {
  it('deletes a tag from its holdings, or merges it with mergeInto', async () => {
    const cash = await typeIdOf(p, 'cash');
    const dropped = await newTag();
    const first = await holdingOf(cash, [dropped.id]);
    expect(await json(await p.delete(`/api/tags/${dropped.id}`))).toMatchObject({ result: null });
    expect((await holdingIn(first))?.tagIds).toStrictEqual([]);

    const from = await newTag();
    const into = await newTag();
    const second = await holdingOf(cash, [from.id]);
    await json(await p.delete(`/api/tags/${from.id}?mergeInto=${into.id}`));
    expect((await holdingIn(second))?.tagIds).toStrictEqual([into.id]);
  });

  it('names a malformed id or mergeInto, and answers NOT_FOUND for either not there', async () => {
    const tag = await newTag();
    expect(await errorOf(await p.delete('/api/tags/long-term'), 400)).toMatchObject({
      fields: { id: anyString },
    });
    expect(await errorOf(await p.delete(`/api/tags/${tag.id}?mergeInto=x`), 400)).toMatchObject({
      fields: { mergeInto: anyString },
    });
    expect(await errorOf(await p.delete(`/api/tags/${unknownId('tag')}`), 404)).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      await errorOf(await p.delete(`/api/tags/${tag.id}?mergeInto=${unknownId('tag')}`), 404),
    ).toMatchObject({ code: 'NOT_FOUND', fields: { mergeInto: anyString } });
  });
});
