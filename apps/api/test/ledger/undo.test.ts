import type { AuditEntry } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  agentActor,
  anyString,
  appError,
  auditRows,
  dataVersion,
  ledgerSuite,
  rowCounts,
  type LedgerSuite,
} from './support';

/**
 * Undo (architecture §6.8, PRD J7): one entry restores `before` exactly, and only while the
 * entity is still at its `after`; a batch goes newest first and all or nothing. Every undo is
 * itself an entry, linked by `undoes`/`undone_by`, so it can be undone too.
 */
let db: TestDatabase;
let suite: LedgerSuite;

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** A user with a tagged holding and two values. */
async function fixture() {
  suite.clock.set(FIXED_NOW);
  const userId = await suite.newUser('USD');
  const connection = await suite.connect(userId);
  const tag = await suite.as(userId).write((l) => l.upsertTag({ name: 'Joint' }));
  const holding = await suite.as(userId).write((l) =>
    l.createHolding({
      name: 'Spending money',
      kind: 'asset',
      universal: 'cash',
      currency: 'USD',
      tagIds: [tag.result.id],
      opening: { amount: '100', date: '2026-07-01' },
    }),
  );
  const holdingId = holding.result.id;
  await suite
    .as(userId)
    .write((l) => l.recordValues([{ holdingId, amount: '120', date: '2026-07-15' }]));
  const values = (await suite.as(userId).read((l) => l.getHolding(holdingId))).values.items;
  return { userId, connection, tagId: tag.result.id, holdingId, values };
}

/** The user's entries, newest first. */
async function entriesOf(userId: string): Promise<AuditEntry[]> {
  return (await suite.as(userId).read((l) => l.activity({ limit: 100 }))).items;
}

/** The newest entry for an entity, optionally of one action. */
async function entryOf(
  userId: string,
  entity: string,
  entityId: string,
  action?: string,
): Promise<AuditEntry> {
  const found = (await entriesOf(userId)).find(
    (e) =>
      e.entity === entity &&
      e.entityId === entityId &&
      (action === undefined || e.action === action),
  );
  if (!found) throw new Error(`No ${action ?? 'entry'} for ${entity} ${entityId}`);
  return found;
}

describe('undo of one entry', () => {
  it('restores an updated value exactly, linked and with its version back', async () => {
    const { userId, values } = await fixture();
    const original = values.find((v) => v.date === '2026-07-15')!;
    await suite.as(userId).write((l) => l.updateValue(original.id, { amount: '999' }));
    const update = await entryOf(userId, 'value', original.id, 'update');
    const version = await dataVersion(suite, userId);

    const undone = await suite.as(userId).write((l) => l.undo({ entryId: update.id }));
    expect(undone.dataVersion).toBe((version ?? 0) + 1);
    expect(undone.result.undone).toEqual([
      { entryId: update.id, entity: 'value', entityId: original.id },
    ]);
    expect(undone.result.undoIds).toHaveLength(1);
    expect(undone.events).toEqual([{ name: 'value_undone', props: {} }]);

    const restored = await suite.as(userId).read((l) => l.getHolding(original.holdingId));
    expect(restored.values.items.find((v) => v.id === original.id)).toEqual(original);
    const items = await entriesOf(userId);
    const undoEntry = items.find((e) => e.entity === 'value' && e.entityId === original.id)!;
    expect(undoEntry.undoes).toBe(update.id);
    expect(undoEntry.before).toEqual(update.after);
    expect(undoEntry.after).toEqual(update.before);
    expect(items.find((e) => e.id === update.id)?.undoneBy).toBe(undoEntry.id);
  });

  it('deletes a created value, and re-inserts a deleted one exactly', async () => {
    const { userId, holdingId, values } = await fixture();
    const original = values.find((v) => v.date === '2026-07-15')!;
    const create = await entryOf(userId, 'value', original.id, 'create');

    await suite.as(userId).write((l) => l.undo({ entryId: create.id }));
    expect(
      (await suite.as(userId).read((l) => l.getHolding(holdingId))).values.items.map((v) => v.id),
    ).not.toContain(original.id);

    const del = await entryOf(userId, 'value', original.id, 'delete');
    expect(del.undoes).toBe(create.id);
    await suite.as(userId).write((l) => l.undo({ entryId: del.id }));
    expect(
      (await suite.as(userId).read((l) => l.getHolding(holdingId))).values.items.find(
        (v) => v.id === original.id,
      ),
    ).toEqual(original);
  });

  it('restores an updated holding with its tags, and deletes a created one with its values', async () => {
    const { userId, holdingId, tagId } = await fixture();
    const before = (await suite.as(userId).read((l) => l.getHolding(holdingId))).values.items;
    expect(before).toHaveLength(2);
    await suite
      .as(userId)
      .write((l) => l.updateHolding(holdingId, { name: 'Everyday money', tagIds: [] }));
    const update = await entryOf(userId, 'holding', holdingId, 'update');
    await suite.as(userId).write((l) => l.undo({ entryId: update.id }));
    const restored = await suite.as(userId).read((l) => l.getHolding(holdingId));
    expect([restored.name, restored.tagIds, restored.rowVersion]).toEqual([
      'Spending money',
      [tagId],
      1,
    ]);

    const create = await entryOf(userId, 'holding', holdingId, 'create');
    await suite.as(userId).write((l) => l.undo({ entryId: create.id }));
    await expect(suite.as(userId).read((l) => l.getHolding(holdingId))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // The undo kept the values it took, so it undoes too: the holding comes back whole.
    const del = await entryOf(userId, 'holding', holdingId, 'delete');
    expect((del.before as { values: unknown[] }).values).toHaveLength(2);
    await suite.as(userId).write((l) => l.undo({ entryId: del.id }));
    const back = await suite.as(userId).read((l) => l.getHolding(holdingId));
    expect([back.name, back.values.items.length]).toEqual(['Spending money', 2]);
  });

  it('restores a deleted holding with its values and tags', async () => {
    const { userId, holdingId, tagId } = await fixture();
    const before = await suite.as(userId).read((l) => l.getHolding(holdingId));
    await suite.as(userId).write((l) => l.deleteHolding(holdingId));
    const del = await entryOf(userId, 'holding', holdingId, 'delete');
    await suite.as(userId).write((l) => l.undo({ entryId: del.id }));
    expect(await suite.as(userId).read((l) => l.getHolding(holdingId))).toEqual(before);
    expect((await suite.as(userId).read((l) => l.listHoldings({}))).items[0]?.tagIds).toEqual([
      tagId,
    ]);
  });

  it('restores types, tags and prefs', async () => {
    const { userId, tagId } = await fixture();
    const type = await suite
      .as(userId)
      .write((l) => l.upsertType({ name: 'Rainy day', universal: 'cash' }));
    const typeId = type.result.id;
    await suite.as(userId).write((l) => l.upsertType({ id: typeId, name: 'Rainy-day fund' }));
    const rename = await entryOf(userId, 'type', typeId, 'update');
    await suite.as(userId).write((l) => l.undo({ entryId: rename.id }));
    expect((await suite.as(userId).read((l) => l.activity({ limit: 100 }))).items[0]?.summary).toBe(
      'Undid Renamed type to "Rainy-day fund"',
    );

    await suite.as(userId).write((l) => l.deleteTag(tagId));
    const del = await entryOf(userId, 'tag', tagId, 'delete');
    await suite.as(userId).write((l) => l.undo({ entryId: del.id }));
    expect((await suite.as(userId).read((l) => l.listHoldings({}))).items[0]?.tagIds).not.toContain(
      tagId,
    );

    await suite.as(userId).write((l) => l.setPrefs({ baseline: 'year_start' }));
    const pref = await entryOf(userId, 'prefs', 'baseline', 'create');
    await suite.as(userId).write((l) => l.undo({ entryId: pref.id }));
    expect((await suite.as(userId).read((l) => l.snapshot())).prefs).toEqual({});
  });

  it('restores the default currency from a currency change', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }));
    const change = await entryOf(userId, 'ledger', userId, 'update');
    await suite.as(userId).write((l) => l.undo({ entryId: change.id }));
    expect((await suite.as(userId).read((l) => l.snapshot())).baseCurrency).toBe('USD');
  });

  it('lets an agent’s undo join the agent’s batch', async () => {
    const { userId, connection, values } = await fixture();
    const original = values.find((v) => v.date === '2026-07-15')!;
    const create = await entryOf(userId, 'value', original.id, 'create');
    await suite.as(userId, agentActor(connection)).write((l) => l.undo({ entryId: create.id }));
    const undoEntry = (await entriesOf(userId)).find(
      (e) => e.entity === 'value' && e.entityId === original.id,
    )!;
    expect(undoEntry).toMatchObject({
      actor: 'agent',
      clientName: 'Fictional agent',
      connectionId: connection,
      batchId: anyString,
    });
  });

  it('answers NOT_FOUND for an unknown entry, and refuses what cannot be undone', async () => {
    const { userId } = await fixture();
    const missing = await appError(
      suite.as(userId).write((l) => l.undo({ entryId: 'aud_01K1G4KX00ZZZZZZZZZZZZZZZZ' })),
    );
    expect(missing.code).toBe('NOT_FOUND');
    const init = await entryOf(userId, 'ledger', userId, 'create');
    const refused = await appError(suite.as(userId).write((l) => l.undo({ entryId: init.id })));
    expect(refused.code).toBe('VALIDATION_FAILED');
  });
});

describe('UNDO_CONFLICT', () => {
  it('names the later change to undo first, writes nothing, and the remedy path works', async () => {
    const { userId, values } = await fixture();
    const original = values.find((v) => v.date === '2026-07-15')!;
    await suite.as(userId).write((l) => l.updateValue(original.id, { amount: '200' }));
    const first = await entryOf(userId, 'value', original.id, 'update');
    suite.clock.advance(1000);
    await suite.as(userId).write((l) => l.updateValue(original.id, { amount: '300' }));
    const items = await entriesOf(userId);
    const second = items.find((e) => e.entity === 'value' && e.entityId === original.id)!;
    expect(second.id).not.toBe(first.id);

    const counts = await rowCounts(suite, userId);
    const version = await dataVersion(suite, userId);
    const failed = await appError(suite.as(userId).write((l) => l.undo({ entryId: first.id })));
    expect(failed.code).toBe('UNDO_CONFLICT');
    expect(failed.details).toEqual({
      blockers: [{ entry_id: second.id, action: 'update', at: second.at }],
    });
    expect(failed.message).toContain(second.id);
    expect(await rowCounts(suite, userId)).toEqual(counts);
    expect(await dataVersion(suite, userId)).toBe(version);

    await suite.as(userId).write((l) => l.undo({ entryId: second.id }));
    await suite.as(userId).write((l) => l.undo({ entryId: first.id }));
    const restored = await suite.as(userId).read((l) => l.getHolding(original.holdingId));
    expect(restored.values.items.find((v) => v.id === original.id)).toEqual(original);
  });

  it('names the value that took a deleted value’s date', async () => {
    const { userId, holdingId, values } = await fixture();
    const original = values.find((v) => v.date === '2026-07-15')!;
    await suite.as(userId).write((l) => l.deleteValue(original.id));
    const del = await entryOf(userId, 'value', original.id, 'delete');
    await suite
      .as(userId)
      .write((l) => l.recordValues([{ holdingId, amount: '500', date: '2026-07-15' }]));
    const [taken] = (
      await suite.as(userId).read((l) => l.getHolding(holdingId))
    ).values.items.filter((v) => v.date === '2026-07-15');
    const occupant = await entryOf(userId, 'value', taken!.id, 'create');

    const failed = await appError(suite.as(userId).write((l) => l.undo({ entryId: del.id })));
    expect(failed.code).toBe('UNDO_CONFLICT');
    expect(failed.details?.blockers).toEqual([
      { entry_id: occupant.id, action: 'create', at: occupant.at },
    ]);

    await suite.as(userId).write((l) => l.undo({ entryId: occupant.id }));
    await suite.as(userId).write((l) => l.undo({ entryId: del.id }));
    expect(
      (await suite.as(userId).read((l) => l.getHolding(holdingId))).values.items.find(
        (v) => v.id === original.id,
      ),
    ).toEqual(original);
  });

  it('names the holdings that took a type before its creation is undone', async () => {
    const { userId, holdingId } = await fixture();
    const type = await suite
      .as(userId)
      .write((l) => l.upsertType({ name: 'Rainy day', universal: 'cash' }));
    const typeId = type.result.id;
    const create = await entryOf(userId, 'type', typeId, 'create');
    await suite.as(userId).write((l) => l.updateHolding(holdingId, { typeId }));
    const move = await entryOf(userId, 'holding', holdingId, 'update');

    const failed = await appError(suite.as(userId).write((l) => l.undo({ entryId: create.id })));
    expect(failed.code).toBe('UNDO_CONFLICT');
    expect(failed.details?.blockers).toEqual([
      { entry_id: move.id, action: 'update', at: move.at },
    ]);

    await suite.as(userId).write((l) => l.undo({ entryId: move.id }));
    await suite.as(userId).write((l) => l.undo({ entryId: create.id }));
    expect((await auditRows(suite, userId)).at(-1)).toMatchObject({
      entity: 'type',
      action: 'delete',
    });
  });

  it('names the tag that took a deleted tag’s name', async () => {
    const { userId, tagId } = await fixture();
    await suite.as(userId).write((l) => l.deleteTag(tagId));
    const del = await entryOf(userId, 'tag', tagId, 'delete');
    const retaken = await suite.as(userId).write((l) => l.upsertTag({ name: 'joint' }));
    const occupant = await entryOf(userId, 'tag', retaken.result.id, 'create');

    const failed = await appError(suite.as(userId).write((l) => l.undo({ entryId: del.id })));
    expect(failed.code).toBe('UNDO_CONFLICT');
    expect(failed.details?.blockers).toEqual([
      { entry_id: occupant.id, action: 'create', at: occupant.at },
    ]);
  });
});

describe('undo of a batch', () => {
  /** An agent turn with two entries: a value and a rename. */
  async function agentTurn() {
    const { userId, connection, holdingId } = await fixture();
    const agent = suite.as(userId, agentActor(connection));
    await agent.write((l) => l.recordValues([{ holdingId, amount: '130', date: '2026-07-20' }]));
    const valueId = (await suite.as(userId).read((l) => l.getHolding(holdingId))).values.items.find(
      (v) => v.date === '2026-07-20',
    )!.id;
    suite.clock.advance(1000);
    await agent.write((l) => l.updateHolding(holdingId, { name: 'Agent’s rename' }));
    const batchId = (await entryOf(userId, 'holding', holdingId, 'update')).batchId!;
    expect((await entryOf(userId, 'value', valueId, 'create')).batchId).toBe(batchId);
    return { userId, holdingId, valueId, batchId };
  }

  it('reverts every entry newest first, in one version bump', async () => {
    const { userId, holdingId, valueId, batchId } = await agentTurn();
    const version = await dataVersion(suite, userId);
    const undone = await suite.as(userId).write((l) => l.undo({ batchId }));
    expect(undone.dataVersion).toBe((version ?? 0) + 1);
    expect(undone.result.undone.map((u) => [u.entity, u.entityId])).toEqual([
      ['holding', holdingId],
      ['value', valueId],
    ]);
    expect(undone.result.undoIds).toHaveLength(2);
    const holding = await suite.as(userId).read((l) => l.getHolding(holdingId));
    expect(holding.name).toBe('Spending money');
    expect(holding.values.items.map((v) => v.id)).not.toContain(valueId);
    const items = await entriesOf(userId);
    expect(
      items
        .filter((e) => e.batchId === batchId && e.undoes === null)
        .every((e) => e.undoneBy !== null),
    ).toBe(true);
  });

  it('is all or nothing: a conflict anywhere writes nothing', async () => {
    const { userId, holdingId, batchId } = await agentTurn();
    await suite.as(userId).write((l) => l.updateHolding(holdingId, { name: 'Person’s rename' }));
    const counts = await rowCounts(suite, userId);
    const version = await dataVersion(suite, userId);
    const failed = await appError(suite.as(userId).write((l) => l.undo({ batchId })));
    expect(failed.code).toBe('UNDO_CONFLICT');
    expect(await rowCounts(suite, userId)).toEqual(counts);
    expect(await dataVersion(suite, userId)).toBe(version);
    expect(
      (await entriesOf(userId)).filter((e) => e.batchId === batchId && e.undoneBy !== null),
    ).toHaveLength(0);
  });

  it('skips entries already undone, and answers NOT_FOUND for an unknown batch', async () => {
    const { userId, batchId } = await agentTurn();
    await suite.as(userId).write((l) => l.undo({ batchId }));
    const version = await dataVersion(suite, userId);
    const again = await suite.as(userId).write((l) => l.undo({ batchId }));
    expect(again.result).toEqual({ undone: [], undoIds: [] });
    expect(again.dataVersion).toBe(version);
    const missing = await appError(
      suite.as(userId).write((l) => l.undo({ batchId: 'bat_01K1G4KX00ZZZZZZZZZZZZZZZZ' })),
    );
    expect(missing.code).toBe('NOT_FOUND');
  });
});

describe('undo chains and events', () => {
  it('undoes an undo, and the first entry is live again', async () => {
    const { userId, values } = await fixture();
    const original = values.find((v) => v.date === '2026-07-15')!;
    await suite.as(userId).write((l) => l.updateValue(original.id, { amount: '999' }));
    const update = await entryOf(userId, 'value', original.id, 'update');
    const first = await suite.as(userId).write((l) => l.undo({ entryId: update.id }));
    const items = await entriesOf(userId);
    expect(items.find((e) => e.id === update.id)?.undoneBy).toBe(first.result.undoIds[0]);

    await suite.as(userId).write((l) => l.undo({ entryId: first.result.undoIds[0]! }));
    const changed = await suite.as(userId).read((l) => l.getHolding(original.holdingId));
    expect(changed.values.items.find((v) => v.id === original.id)?.amountMinor).toBe(
      (update.after as { amountMinor: number }).amountMinor,
    );
    const relinked = await entriesOf(userId);
    expect(relinked.find((e) => e.id === update.id)?.undoneBy).toBeNull();
    expect(relinked.find((e) => e.id === first.result.undoIds[0])?.undoneBy).not.toBeNull();
  });

  it('fires value_undone and keeps the undone entry’s agent source on the trail', async () => {
    const { userId, connection, holdingId } = await fixture();
    await suite
      .as(userId, agentActor(connection))
      .write((l) => l.recordValues([{ holdingId, amount: '130', date: '2026-07-20' }]));
    const valueId = (await suite.as(userId).read((l) => l.getHolding(holdingId))).values.items.find(
      (v) => v.date === '2026-07-20',
    )!.id;
    const create = await entryOf(userId, 'value', valueId, 'create');
    const undone = await suite.as(userId).write((l) => l.undo({ entryId: create.id }));
    expect(undone.events).toEqual([{ name: 'value_undone', props: {} }]);
    const items = await entriesOf(userId);
    expect(items.find((e) => e.id === create.id)).toMatchObject({
      after: { source: 'agent' },
      undoneBy: undone.result.undoIds[0],
    });
  });

  it('serialises one user’s concurrent undos: both land, each with its version', async () => {
    const { userId, values } = await fixture();
    const [a, b] = values;
    await suite.as(userId).write((l) => l.updateValue(a!.id, { amount: '201' }));
    await suite.as(userId).write((l) => l.updateValue(b!.id, { amount: '202' }));
    const first = await entryOf(userId, 'value', a!.id, 'update');
    const second = await entryOf(userId, 'value', b!.id, 'update');
    const version = await dataVersion(suite, userId);
    const [one, two] = await Promise.all([
      suite.as(userId).write((l) => l.undo({ entryId: first.id })),
      suite.as(userId).write((l) => l.undo({ entryId: second.id })),
    ]);
    expect([one.dataVersion, two.dataVersion].sort()).toEqual([version! + 1, version! + 2]);
    const items = await entriesOf(userId);
    expect(items.find((e) => e.id === first.id)?.undoneBy).not.toBeNull();
    expect(items.find((e) => e.id === second.id)?.undoneBy).not.toBeNull();
  });
});
