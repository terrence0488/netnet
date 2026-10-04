import type { ContentDoc, Pack } from '@netnet/contracts';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readContent } from '../../../../scripts/content-check';
import { CONTENT_ADMIN_ROLE } from '../../src/db/bootstrap';
import { createDatabase } from '../../src/db/client';
import {
  bodyHash,
  ContentRejected,
  publishContent,
  rollbackContent,
} from '../../src/content/publish';
import { createContentStore, databaseContent } from '../../src/content/store';
import { createTestDatabase, sqlState, type TestDatabase } from '../isolation/harness';

/**
 * Publishing (architecture §6.5): all or nothing, a version only for a changed body, rollback
 * audited, run as `netnet_app` (what `content:publish` uses) and as `netnet_content_admin` (the
 * future portal's role). Reads go through the store over the same tables.
 */
let db: TestDatabase;
const META = { author: 'Fictional Author', sourceCommit: 'a'.repeat(40) };

/** The repository's real content, deep-copied so a test can edit it. */
function content(): ContentDoc[] {
  const { docs, errors } = readContent();
  expect(errors).toStrictEqual([]);
  return structuredClone(docs);
}

function withPack(docs: ContentDoc[], id: string, edit: (pack: Pack) => void): ContentDoc[] {
  return docs.map((doc) => {
    if (doc.kind !== 'pack' || (doc.body as Pack).id !== id) return doc;
    const body = structuredClone(doc.body as Pack);
    edit(body);
    return { ...doc, body };
  });
}

async function table(name: 'content_doc' | 'content_current' | 'content_audit') {
  const order = name === 'content_audit' ? 'id' : 'kind, key';
  const columns = {
    content_doc: 'kind, key, version, sha256, author, source_commit',
    content_current: 'kind, key, version, updated_by',
    content_audit: 'kind, key, from_version, to_version, actor',
  }[name];
  const { rows } = await db.owner.query(`select ${columns} from core.${name} order by ${order}`);
  return rows as Record<string, unknown>[];
}

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.owner.query(
    'truncate core.content_current, core.content_audit, core.content_doc restart identity',
  );
});

describe('publishContent', () => {
  it('writes version 1 of every document, makes each live, and audits each move', async () => {
    const docs = content();
    const outcomes = await publishContent(db.appDb, docs, META);
    expect(outcomes).toHaveLength(docs.length);
    expect(outcomes.every((o) => o.change === 'new' && o.version === 1 && o.from === null)).toBe(
      true,
    );
    const stored = await table('content_doc');
    expect(stored).toHaveLength(docs.length);
    expect(stored).toContainEqual({
      kind: 'pack',
      key: 'sg',
      version: 1,
      sha256: bodyHash(docs.find((d) => d.doc === 'packs/sg.json')?.body),
      author: META.author,
      source_commit: META.sourceCommit,
    });
    expect(stored).toContainEqual(expect.objectContaining({ kind: 'countries', key: 'countries' }));
    expect(stored).toContainEqual(expect.objectContaining({ kind: 'agent', key: 'other' }));
    expect(await table('content_current')).toHaveLength(docs.length);
    const audit = await table('content_audit');
    expect(audit).toHaveLength(docs.length);
    expect(audit).toContainEqual({
      kind: 'pack',
      key: 'generic',
      from_version: null,
      to_version: 1,
      actor: META.author,
    });
  });

  it('makes no new version, move or audit entry for an unchanged document', async () => {
    await publishContent(db.appDb, content(), META);
    const before = { docs: await table('content_doc'), audit: await table('content_audit') };
    // Key order and layout do not make a body different.
    const reordered = content().map((doc) => ({
      ...doc,
      body: Object.fromEntries(Object.entries(doc.body as object).reverse()),
    }));
    const outcomes = await publishContent(db.appDb, reordered, {
      ...META,
      sourceCommit: 'b'.repeat(40),
    });
    expect(outcomes.every((o) => o.change === 'unchanged' && o.version === 1)).toBe(true);
    expect(await table('content_doc')).toStrictEqual(before.docs);
    expect(await table('content_audit')).toStrictEqual(before.audit);
  });

  it('versions only the document that changed', async () => {
    await publishContent(db.appDb, content(), META);
    const edited = withPack(content(), 'sg', (p) => {
      p.cadenceDays = { ...p.cadenceDays, cash: 14 };
    });
    const outcomes = await publishContent(db.appDb, edited, { ...META, author: 'Second Author' });
    expect(outcomes.filter((o) => o.change !== 'unchanged')).toStrictEqual([
      { kind: 'pack', key: 'sg', version: 2, from: 1, change: 'new' },
    ]);
    expect((await table('content_current')).find((r) => r.key === 'sg')).toMatchObject({
      version: 2,
      updated_by: 'Second Author',
    });
    expect((await table('content_audit')).at(-1)).toStrictEqual({
      kind: 'pack',
      key: 'sg',
      from_version: 1,
      to_version: 2,
      actor: 'Second Author',
    });
  });

  it('rejects the whole publish when one document fails, and writes nothing', async () => {
    await publishContent(db.appDb, content(), META);
    const before = {
      docs: await table('content_doc'),
      current: await table('content_current'),
      audit: await table('content_audit'),
    };
    // A good change to SG and a broken MY: neither is published.
    const docs = withPack(
      withPack(content(), 'sg', (p) => {
        p.cadenceDays = { ...p.cadenceDays, cash: 14 };
      }),
      'my',
      (p) => {
        p.currency = 'XXX';
      },
    );
    const error = await publishContent(db.appDb, docs, META).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContentRejected);
    expect((error as ContentRejected).errors).toContainEqual(
      expect.objectContaining({ doc: 'packs/my.json', path: 'currency' }),
    );
    expect(await table('content_doc')).toStrictEqual(before.docs);
    expect(await table('content_current')).toStrictEqual(before.current);
    expect(await table('content_audit')).toStrictEqual(before.audit);
  });

  it('rejects two documents with one key', async () => {
    const docs = content();
    const countries = docs.find((d) => d.kind === 'countries');
    if (!countries) throw new Error('no countries');
    await expect(
      publishContent(db.appDb, [...docs, { ...countries, doc: 'copy.json' }], META),
    ).rejects.toThrow(ContentRejected);
    expect(await table('content_doc')).toStrictEqual([]);
  });

  it('works as netnet_content_admin, the portal’s role, which can read no user data', async () => {
    // Every connection starts as the content admin, as the portal's would.
    const admin = new Pool({
      connectionString: ownerUrl(),
      options: `-c role=${CONTENT_ADMIN_ROLE}`,
      max: 1,
    });
    try {
      const outcomes = await publishContent(createDatabase(admin), content(), META);
      expect(outcomes.every((o) => o.change === 'new')).toBe(true);
      expect(await sqlState(admin.query('select * from core.profile'))).toBe('42501');
      expect(await sqlState(admin.query('select * from ledger.holding'))).toBe('42501');
      expect(await sqlState(admin.query('select * from analytics.event'))).toBe('42501');
      expect(await sqlState(admin.query('delete from core.content_doc'))).toBe('42501');
    } finally {
      await admin.end();
    }
  });
});

describe('rollbackContent', () => {
  async function twoVersions() {
    await publishContent(db.appDb, content(), META);
    await publishContent(
      db.appDb,
      withPack(content(), 'sg', (p) => {
        p.cadenceDays = { ...p.cadenceDays, cash: 14 };
      }),
      META,
    );
  }

  it('points what is live back at an earlier version, audited, with no new version', async () => {
    await twoVersions();
    const docs = await table('content_doc');
    expect(
      await rollbackContent(db.appDb, { kind: 'pack', key: 'sg', version: 1 }, 'Rolls Back'),
    ).toStrictEqual({
      from: 2,
    });
    expect(await table('content_doc')).toStrictEqual(docs);
    expect((await table('content_current')).find((r) => r.key === 'sg')).toMatchObject({
      version: 1,
      updated_by: 'Rolls Back',
    });
    expect((await table('content_audit')).at(-1)).toStrictEqual({
      kind: 'pack',
      key: 'sg',
      from_version: 2,
      to_version: 1,
      actor: 'Rolls Back',
    });
  });

  it('then republishing the newer content reuses its version', async () => {
    await twoVersions();
    await rollbackContent(db.appDb, { kind: 'pack', key: 'sg', version: 1 }, 'Rolls Back');
    const outcomes = await publishContent(
      db.appDb,
      withPack(content(), 'sg', (p) => {
        p.cadenceDays = { ...p.cadenceDays, cash: 14 };
      }),
      META,
    );
    expect(outcomes.find((o) => o.key === 'sg')).toStrictEqual({
      kind: 'pack',
      key: 'sg',
      version: 2,
      from: 1,
      change: 'reused',
    });
    expect((await table('content_doc')).filter((r) => r.key === 'sg')).toHaveLength(2);
  });

  it('does nothing when the version is already live', async () => {
    await twoVersions();
    const audit = await table('content_audit');
    expect(
      await rollbackContent(db.appDb, { kind: 'pack', key: 'sg', version: 2 }, 'X'),
    ).toStrictEqual({
      from: 2,
    });
    expect(await table('content_audit')).toStrictEqual(audit);
  });

  it('refuses a version that does not exist, or a document never published', async () => {
    await twoVersions();
    await expect(
      rollbackContent(db.appDb, { kind: 'pack', key: 'sg', version: 9 }, 'X'),
    ).rejects.toThrow('pack/sg has no version 9.');
    await expect(
      rollbackContent(db.appDb, { kind: 'pack', key: 'zz', version: 1 }, 'X'),
    ).rejects.toThrow('has no version 1');
  });
});

describe('the store over the database', () => {
  it('reads what is live and each version, and builds the pack chain', async () => {
    await publishContent(db.appDb, content(), META);
    await publishContent(
      db.appDb,
      withPack(content(), 'sg', (p) => {
        p.cadenceDays = { ...p.cadenceDays, cash: 14 };
      }),
      META,
    );
    const store = createContentStore({ source: databaseContent(() => db.appDb) });
    const versions = await store.currentVersions();
    expect(versions.pack).toStrictEqual({ generic: 1, gb: 1, my: 1, sg: 2 });
    expect(versions.countries).toStrictEqual({ countries: 1 });
    expect(Object.keys(versions.agent ?? {}).sort()).toStrictEqual(['chatgpt', 'claude', 'other']);
    expect(((await store.getCurrent('pack', 'sg')).body as Pack).cadenceDays.cash).toBe(14);
    expect(((await store.getVersion('pack', 'sg', 1)).body as Pack).cadenceDays.cash).not.toBe(14);
    expect((await store.getPackChain('SG')).map((p) => p.id)).toStrictEqual(['sg', 'generic']);
    expect((await store.getPackChain('MY')).map((p) => p.id)).toStrictEqual(['my', 'generic']);
    expect((await store.getPackChain('FR')).map((p) => p.id)).toStrictEqual(['generic']);
  });
});

/** The superuser's URL for this test's database (the owner's view). */
function ownerUrl(): string {
  const url = db.owner.options.connectionString;
  if (!url) throw new Error('The owner pool has no connection string.');
  return url;
}
