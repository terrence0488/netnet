import type { AuditEntry, Page } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openLedger } from '../../src/ledger/ledger';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  errorOf,
  json,
  ledgerApp,
  onboarded,
  typeIdOf,
  unknownId,
  type LedgerApp,
  type Person,
  type WriteBody,
} from './support';

/**
 * The activity log over REST (architecture §7.2, PRD J7): `GET /api/activity` newest first,
 * optionally one agent turn. It is read only: the routes that once reverted an entry or a turn
 * answer NOT_FOUND like any unknown route.
 */
let db: TestDatabase;
let target: LedgerApp;
let p: Person;
let cashType: string;

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
  p = await onboarded(target);
  cashType = await typeIdOf(p, 'cash');
}, 60_000);

afterAll(async () => {
  target?.restore();
  await db?.close();
});

async function activity(query = ''): Promise<Page<AuditEntry>> {
  return json<Page<AuditEntry>>(await p.get(`/api/activity${query}`));
}

async function makeHolding(name: string): Promise<{ holdingId: string; valueId: string }> {
  const holding = await json<WriteBody<{ id: string }>>(
    await p.post('/api/holdings', {
      name,
      kind: 'asset',
      typeId: cashType,
      currency: 'EUR',
      opening: { amount: '100.00', date: '2026-07-01' },
      via: 'form',
    }),
  );
  const holdingId = holding.result.id;
  const values = await json<{ items: { id: string }[] }>(
    await p.get(`/api/holdings/${holdingId}/values`),
  );
  return { holdingId, valueId: values.items[0]!.id };
}

let connections = 0;

/** An agent write through the Ledger, for a batch the person can read over REST. */
async function agentWrites(holdingId: string): Promise<string> {
  connections += 1;
  const connectionId = `con_01K1G4KX00TEST${String(connections).padStart(12, '0')}`;
  await db.owner.query(
    `insert into core.agent_connection (id, user_id, client_id, client_name, registration, client, created_at)
     values ($1, $2, 'https://agent.example/metadata', 'Fictional agent', 'cimd', 'other', now())`,
    [connectionId, p.userId],
  );
  const profile = await target.deps.profile(p.userId);
  const options = target.deps.options(profile);
  const write = await target.deps.withUser(
    p.userId,
    { kind: 'agent', connectionId, clientName: 'Fictional agent' },
    (tx) =>
      openLedger(tx, options).recordValues([{ holdingId, amount: '130.00', date: '2026-07-20' }]),
    { write: true },
  );
  return write.result[0]!.value.batchId!;
}

describe('GET /api/activity', () => {
  it('lists the person’s changes newest first, paged', async () => {
    const { holdingId } = await makeHolding('Holiday fund');
    await json(await p.patch(`/api/holdings/${holdingId}`, { name: 'Holiday money' }));
    const first = await activity('?limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    expect(first.items[0]?.summary).toBe('Updated "Holiday money"');
    expect(Object.keys(first.items[0] ?? {}).sort()).toStrictEqual(
      [
        'id',
        'at',
        'actor',
        'clientName',
        'connectionId',
        'batchId',
        'action',
        'entity',
        'entityId',
        'before',
        'after',
        'summary',
      ].sort(),
    );
    const rest = await activity(`?limit=100&cursor=${first.nextCursor}`);
    expect(rest.nextCursor).toBeNull();
    expect([...first.items, ...rest.items].map((e) => e.id)).toEqual(
      (await activity('?limit=100')).items.map((e) => e.id),
    );
  });

  it('filters to one agent turn, and refuses a bad limit or batch', async () => {
    const { holdingId } = await makeHolding('Travel buffer');
    const batchId = await agentWrites(holdingId);
    const turn = await activity(`?batchId=${batchId}`);
    expect(turn.nextCursor).toBeNull();
    expect(turn.items.length).toBeGreaterThan(0);
    expect(new Set(turn.items.map((e) => e.batchId))).toEqual(new Set([batchId]));
    expect((await activity(`?batchId=${unknownId('bat')}`)).items).toEqual([]);
    expect((await errorOf(await p.get('/api/activity?limit=101'), 400)).code).toBe(
      'VALIDATION_FAILED',
    );
    expect((await errorOf(await p.get('/api/activity?batchId=nope'), 400)).fields).toHaveProperty(
      'batchId',
    );
  });
});

describe('undo', () => {
  it('is gone: both former routes answer NOT_FOUND like any unknown route, and change nothing', async () => {
    const { holdingId, valueId } = await makeHolding('Rainy-day pot');
    await json(await p.patch(`/api/values/${valueId}`, { amount: '999.00' }));
    const update = (await activity()).items.find(
      (e) => e.entity === 'value' && e.entityId === valueId && e.action === 'update',
    )!;
    const batchId = await agentWrites(holdingId);
    const before = await activity('?limit=100');
    for (const path of [
      `/api/activity/${update.id}/undo`,
      `/api/activity/batches/${batchId}/undo`,
    ]) {
      expect(await errorOf(await p.post(path, {}), 404)).toStrictEqual({
        code: 'NOT_FOUND',
        message: `Nothing is at POST ${path}.`,
      });
    }
    expect(await activity('?limit=100')).toStrictEqual(before);
    const values = await json<{ items: { id: string; amountMinor: number }[] }>(
      await p.get(`/api/holdings/${holdingId}/values`),
    );
    expect(values.items.find((v) => v.id === valueId)?.amountMinor).toBe(99_900);
    expect(values.items.map((v) => v.amountMinor)).toContain(13_000);
  });
});
