import type { AuditEntry } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordConnectionRevoke } from '../../src/ledger/connections';
import type { Ledger } from '../../src/ledger/ledger';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  agentActor,
  anyString,
  appError,
  auditRows,
  ledgerSuite,
  USER,
  type LedgerSuite,
} from './support';

/**
 * The activity log (architecture §6.8, PRD J7): every change newest first, each with its actor,
 * client, old → new and time, one agent turn filterable by its batch. Revocations read as
 * "Agent disconnected".
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

/** A user with a holding (with a value), an agent-written value, and a revocation on record. */
async function fixture() {
  suite.clock.set(FIXED_NOW);
  const userId = await suite.newUser('USD');
  const connection = await suite.connect(userId);
  const holding = await suite.as(userId).write((l) =>
    l.createHolding({
      name: 'Spending money',
      kind: 'asset',
      universal: 'cash',
      currency: 'USD',
      opening: { amount: '100', date: '2026-07-01' },
    }),
  );
  const holdingId = holding.result.id;
  await suite
    .as(userId, agentActor(connection))
    .write((l) => l.recordValues([{ holdingId, amount: '120', date: '2026-07-15' }]));
  const at = FIXED_NOW.toISOString();
  const snapshot = (revokedAt: string | null) => ({
    id: connection,
    client: 'other',
    clientName: 'Fictional agent',
    registration: 'cimd',
    createdAt: at,
    revokedAt,
  });
  await suite.db.withUser(
    userId,
    USER,
    (tx) => recordConnectionRevoke(tx, connection, snapshot(null), snapshot(at)),
    { write: true },
  );
  return { userId, connection, holdingId };
}

async function entriesOf(userId: string): Promise<AuditEntry[]> {
  return (await suite.as(userId).read((l) => l.activity({ limit: 100 }))).items;
}

describe('activity', () => {
  it('lists every change newest first, with actor, client, old → new and time', async () => {
    const { userId, connection, holdingId } = await fixture();
    const items = await entriesOf(userId);
    const rows = await auditRows(suite, userId);
    expect(items.map((e) => e.id)).toEqual(rows.map((r) => r.id).reverse());

    const revoke = items.find((e) => e.entity === 'connection')!;
    expect(revoke).toMatchObject({
      actor: 'user',
      action: 'connection.revoke',
      entity: 'connection',
      entityId: connection,
      batchId: null,
    });
    expect(revoke.before).toMatchObject({ clientName: 'Fictional agent', revokedAt: null });
    expect(revoke.after).toMatchObject({
      clientName: 'Fictional agent',
      revokedAt: FIXED_NOW.toISOString(),
    });

    const agentValue = items.find((e) => e.entity === 'value' && e.actor === 'agent')!;
    expect(agentValue).toMatchObject({
      action: 'create',
      entityId: anyString,
      clientName: 'Fictional agent',
      connectionId: connection,
      batchId: anyString,
      at: FIXED_NOW.toISOString(),
    });
    expect(agentValue.before).toBeNull();
    expect(agentValue.after).toMatchObject({ holdingId, date: '2026-07-15', source: 'agent' });

    const webHolding = items.find((e) => e.entity === 'holding')!;
    expect(webHolding).toMatchObject({
      actor: 'user',
      action: 'create',
      clientName: null,
      connectionId: null,
      batchId: null,
    });
    expect(webHolding.after).toMatchObject({ id: holdingId, name: 'Spending money' });
  });

  it('pages with the cursor, in order across pages', async () => {
    const { userId } = await fixture();
    const first = await suite.as(userId).read((l) => l.activity({ limit: 3 }));
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await suite
      .as(userId)
      .read((l) => l.activity({ limit: 100, cursor: first.nextCursor! }));
    expect(second.nextCursor).toBeNull();
    const walked = [...first.items, ...second.items];
    expect(walked.map((e) => e.id)).toEqual((await entriesOf(userId)).map((e) => e.id));
    expect(walked).toHaveLength((await auditRows(suite, userId)).length);
  });

  it('filters to one agent turn by its batch', async () => {
    const { userId, connection, holdingId } = await fixture();
    suite.clock.advance(60_000);
    await suite
      .as(userId, agentActor(connection))
      .write((l) => l.recordValues([{ holdingId, amount: '130', date: '2026-07-20' }]));
    suite.clock.advance(121_000);
    await suite
      .as(userId, agentActor(connection))
      .write((l) => l.recordValues([{ holdingId, amount: '140', date: '2026-07-21' }]));
    const batches = [
      ...new Set((await entriesOf(userId)).map((e) => e.batchId).filter((b) => b !== null)),
    ];
    expect(batches).toHaveLength(2);
    for (const batchId of batches) {
      const page = await suite.as(userId).read((l) => l.activity({ batchId }));
      expect(page.nextCursor).toBeNull();
      expect(page.items.length).toBeGreaterThan(0);
      expect(new Set(page.items.map((e) => e.batchId))).toEqual(new Set([batchId]));
    }
    const unknown = await suite.as(userId).read((l) => l.activity({ batchId: 'bat_01KZZZ' }));
    expect(unknown).toEqual({ items: [], nextCursor: null });
  });

  it('reads a revocation as "Agent disconnected" with the agent and the time', async () => {
    const { userId } = await fixture();
    const revoke = (await entriesOf(userId)).find((e) => e.entity === 'connection')!;
    expect(revoke.summary).toBe('Agent disconnected');
    expect(revoke.clientName).toBe('Fictional agent');
    expect(revoke.at).toBe(FIXED_NOW.toISOString());
  });

  it('summarises web edits and deletes', async () => {
    const { userId, holdingId } = await fixture();
    await suite.as(userId).write((l) => l.updateHolding(holdingId, { name: 'Everyday money' }));
    const tag = await suite.as(userId).write((l) => l.upsertTag({ name: 'Joint' }));
    await suite.as(userId).write((l) => l.deleteTag(tag.result.id));
    const items = await entriesOf(userId);
    expect(items.find((e) => e.action === 'delete' && e.entity === 'tag')?.summary).toBe(
      'Removed tag "Joint"',
    );
    expect(items.find((e) => e.action === 'update' && e.entity === 'holding')?.summary).toBe(
      'Updated "Everyday money"',
    );
    expect(items.find((e) => e.action === 'create' && e.entity === 'holding')?.summary).toBe(
      'Added "Spending money"',
    );
  });

  it('reads a former undo entry as the change it made, old → new', async () => {
    const { userId, holdingId } = await fixture();
    await suite.as(userId).write((l) => l.updateHolding(holdingId, { name: 'Everyday money' }));
    const update = (await entriesOf(userId)).find(
      (e) => e.action === 'update' && e.entity === 'holding',
    )!;
    // What the retired undo wrote: the inverse change, as an ordinary row once its link columns
    // are gone (migration 0009).
    const formerUndo = 'aud_01K1G4KX00FRMERENTRY000000';
    await suite.rows(
      `insert into ledger.audit (user_id, id, at, actor, action, entity, entity_id, before, after)
       values ($1, $2, $3, 'user', 'update', 'holding', $4, $5, $6)`,
      [
        userId,
        formerUndo,
        new Date(FIXED_NOW.getTime() + 60_000),
        holdingId,
        JSON.stringify(update.after),
        JSON.stringify(update.before),
      ],
    );
    const [newest, ...rest] = await entriesOf(userId);
    expect(newest).toMatchObject({
      id: formerUndo,
      actor: 'user',
      action: 'update',
      entity: 'holding',
      entityId: holdingId,
      summary: 'Updated "Spending money"',
    });
    expect(newest?.before).toMatchObject({ name: 'Everyday money' });
    expect(newest?.after).toMatchObject({ name: 'Spending money' });
    expect(rest.find((e) => e.id === update.id)?.summary).toBe('Updated "Everyday money"');
  });

  it('reads the ledger’s creation and a currency change', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }));
    const items = await entriesOf(userId);
    expect(items.find((e) => e.entity === 'ledger' && e.action === 'create')?.summary).toBe(
      'Started tracking in USD',
    );
    const change = items.find((e) => e.entity === 'ledger' && e.action === 'update')!;
    expect(change.summary).toBe('Changed the default currency USD → EUR');
    expect([change.before, change.after]).toEqual([
      { baseCurrency: 'USD' },
      { baseCurrency: 'EUR' },
    ]);
  });

  it('refuses a bad cursor and a limit over 100', async () => {
    const { userId } = await fixture();
    const read = (l: Ledger) => l.activity({ cursor: 'not-a-cursor', limit: 100 });
    expect((await appError(suite.as(userId).read(read))).code).toBe('VALIDATION_FAILED');
    const over = (l: Ledger) => l.activity({ limit: 101 });
    expect((await appError(suite.as(userId).read(over))).code).toBe('VALIDATION_FAILED');
  });
});
