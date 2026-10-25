import { UNIVERSALS, type AuditEntry, type VersionedPack } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordConnectionRevoke } from '../../src/ledger/connections';
import { openLedger, type Ledger, type LedgerContent } from '../../src/ledger/ledger';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  agentActor,
  anyString,
  appError,
  auditRows,
  COUNTRY_V1,
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

/**
 * Type entries name the type as every other screen does (PRD J7, J2): by `typeLabel` over the
 * person's current pack chain, so a pack type reads by its label and an older entry follows a
 * country move. The fictional chain is "qz" then generic: qz labels cash "Current account" and
 * adds the pack type `auto_loan` ("Auto loan"); generic labels the rest "Label <universal>".
 */
describe('type entries', () => {
  /** What the ledger starts with in qz, oldest first: one type per universal, then qz's own. */
  const STARTING_QZ = [
    ...UNIVERSALS.map((u) => `Added type "${u === 'cash' ? 'Current account' : `Label ${u}`}"`),
    'Added type "Auto loan"',
  ];

  /** The type entries' summaries, oldest first, as the chain of `country` reads them. */
  async function typeSummaries(userId: string, country: string | null = 'qz'): Promise<string[]> {
    const page = await suite.as(userId, USER, country).read((l) => l.activity({ limit: 100 }));
    return page.items
      .filter((e) => e.entity === 'type')
      .map((e) => e.summary)
      .reverse();
  }

  async function packTypeId(userId: string, key: string): Promise<string> {
    const [row] = await suite.rows<{ id: string }>(
      'select id from ledger.user_type where user_id = $1 and pack_type_key = $2',
      [userId, key],
    );
    if (!row) throw new Error(`No ${key} type for ${userId}`);
    return row.id;
  }

  let stored = 0;

  /** A type entry as an older or damaged row might hold it, written straight to the table. */
  async function storeTypeEntry(
    userId: string,
    action: 'create' | 'update' | 'delete',
    before: unknown,
    after: unknown,
  ): Promise<void> {
    stored += 1;
    await suite.rows(
      `insert into ledger.audit (user_id, id, at, actor, action, entity, entity_id, before, after)
       values ($1, $2, $3, 'user', $4, 'type', 'typ_01K1G4KX00STRD000000000000', $5, $6)`,
      [
        userId,
        `aud_01K1G4KX00STRD${String(stored).padStart(12, '0')}`,
        new Date(FIXED_NOW.getTime() + stored * 1000),
        action,
        before === undefined ? null : JSON.stringify(before),
        after === undefined ? null : JSON.stringify(after),
      ],
    );
  }

  it('names each type a new ledger starts with by its label, never by a key', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    const summaries = await typeSummaries(userId);
    expect(summaries).toStrictEqual(STARTING_QZ);
    const keys = [...UNIVERSALS, 'auto_loan'];
    for (const summary of summaries) {
      expect(keys.some((key) => summary.includes(`"${key}"`))).toBe(false);
    }
  });

  it('reads a pack type by its label when added and removed, and by the name it is given', async () => {
    suite.clock.set(FIXED_NOW);
    const renamed = await suite.newUser('USD');
    const renamedId = await packTypeId(renamed, 'auto_loan');
    await suite.as(renamed).write((l) => l.upsertType({ id: renamedId, name: 'Car repayments' }));
    expect((await typeSummaries(renamed)).slice(-1)).toStrictEqual([
      'Renamed type to "Car repayments"',
    ]);

    const removed = await suite.newUser('USD');
    const removedId = await packTypeId(removed, 'auto_loan');
    await suite.as(removed).write((l) => l.deleteType(removedId));
    expect((await typeSummaries(removed)).slice(-1)).toStrictEqual(['Removed type "Auto loan"']);
  });

  it('reads a type the person made by their name through its rename and removal', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    const made = await suite
      .as(userId)
      .write((l) => l.upsertType({ universal: 'other', name: 'Art' }));
    await suite.as(userId).write((l) => l.upsertType({ id: made.result.id, name: 'Paintings' }));
    await suite.as(userId).write((l) => l.deleteType(made.result.id));
    expect((await typeSummaries(userId)).slice(STARTING_QZ.length)).toStrictEqual([
      'Added type "Art"',
      'Renamed type to "Paintings"',
      'Removed type "Paintings"',
    ]);
  });

  it('reads a universal-only type by its universal type’s label in the chain', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    const listed = await suite.typeId(userId, 'listed');
    const cash = await suite.typeId(userId, 'cash');
    await suite.as(userId).write((l) => l.deleteType(cash));
    await suite.as(userId).write((l) => l.upsertType({ id: listed, name: 'Shares' }));
    // A snapshot without the keys a plain type leaves empty reads the same.
    await storeTypeEntry(userId, 'create', null, { universal: 'crypto' });
    const summaries = await typeSummaries(userId);
    expect(summaries.slice(0, 2)).toStrictEqual([
      'Added type "Current account"',
      'Added type "Label listed"',
    ]);
    expect(summaries.slice(STARTING_QZ.length)).toStrictEqual([
      'Removed type "Current account"',
      'Renamed type to "Shares"',
      'Added type "Label crypto"',
    ]);
  });

  it('reads a pack key the current chain lacks as its universal type’s label', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    const autoLoan = await packTypeId(userId, 'auto_loan');
    await suite.as(userId).write((l) => l.deleteType(autoLoan));
    // A pack type no pack has any more.
    const old = { universal: 'loan', packTypeKey: 'retired_key', customName: null };
    await storeTypeEntry(userId, 'create', null, old);
    await storeTypeEntry(userId, 'update', old, { ...old, customName: 'Old loan' });
    await storeTypeEntry(userId, 'delete', old, null);

    // Through generic alone, which has no `auto_loan` either.
    const generic = await typeSummaries(userId, null);
    expect(generic[0]).toBe('Added type "Cash and savings"');
    expect(generic.slice(UNIVERSALS.length)).toStrictEqual([
      'Added type "Label loan"',
      'Removed type "Label loan"',
      'Added type "Label loan"',
      'Renamed type to "Old loan"',
      'Removed type "Label loan"',
    ]);
    expect((await typeSummaries(userId)).slice(STARTING_QZ.length)).toStrictEqual([
      'Removed type "Auto loan"',
      'Added type "Label loan"',
      'Renamed type to "Old loan"',
      'Removed type "Label loan"',
    ]);
  });

  it('reads a snapshot that is not a type as "a type", and never throws', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    const unreadable: unknown[] = [
      undefined,
      'a string',
      ['an', 'array'],
      {},
      { packTypeKey: null, customName: 'No universal type' },
      { universal: 'not_a_universal', packTypeKey: null, customName: 'Named' },
      { universal: 'cash', packTypeKey: 7, customName: null },
      { universal: 'cash', packTypeKey: null, customName: { not: 'text' } },
    ];
    for (const side of unreadable) {
      await storeTypeEntry(userId, 'create', null, side);
      await storeTypeEntry(userId, 'update', side, side);
      await storeTypeEntry(userId, 'delete', side, null);
    }
    expect((await typeSummaries(userId)).slice(STARTING_QZ.length)).toStrictEqual(
      unreadable.flatMap(() => [
        'Added type "a type"',
        'Renamed type to "a type"',
        'Removed type "a type"',
      ]),
    );
  });

  it('reads older entries with the labels of the country moved to', async () => {
    suite.clock.set(FIXED_NOW);
    // Another imaginary country: its own cash label, and a pack type of its own.
    const QY_V1: VersionedPack = {
      ...COUNTRY_V1,
      id: 'qy',
      labels: { cash: 'Cash in hand' },
      types: [{ key: 'car_plan', u: 'loan', label: 'Car plan' }],
    };
    suite.content.publish(QY_V1);
    const userId = await suite.newUser('USD');
    await suite
      .as(userId)
      .write((l) =>
        l.createHolding({ name: 'Wallet', kind: 'asset', universal: 'cash', currency: 'USD' }),
      );
    await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'USD', pack: suite.content.ref('qy') }));

    const summaries = await typeSummaries(userId, 'qy');
    expect(summaries).toStrictEqual([
      ...UNIVERSALS.map((u) => `Added type "${u === 'cash' ? 'Cash in hand' : `Label ${u}`}"`),
      // qz's own type: qy's chain has no `auto_loan`, so it reads as a loan.
      'Added type "Label loan"',
      'Added type "Car plan"',
    ]);
  });

  it('reads the pack chain once for a page', async () => {
    suite.clock.set(FIXED_NOW);
    const userId = await suite.newUser('USD');
    const live = suite.content.forCountry('qz');
    let reads = 0;
    const content: LedgerContent = {
      ...live,
      chain: () => {
        reads += 1;
        return live.chain();
      },
    };
    const withUser = db.withUserOn(db.app, suite.clock.now);
    const page = await withUser(userId, USER, (tx) =>
      openLedger(tx, suite.options('qz', { content })).activity({ limit: 100 }),
    );
    expect(page.items.filter((e) => e.entity === 'type')).toHaveLength(STARTING_QZ.length);
    expect(reads).toBe(1);
  });
});
