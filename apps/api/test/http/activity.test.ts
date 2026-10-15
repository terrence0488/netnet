import type { AuditEntry, Page, UndoResult } from '@netnet/contracts';
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
 * optionally one agent turn, and the two `POST …/undo` routes. An undone value fires
 * `value_undone` after the response.
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

/** An agent write through the Ledger, for a batch the person can undo over REST. */
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

describe('POST /api/activity/:id/undo', () => {
  it('undoes one entry and answers the write shape', async () => {
    const { holdingId, valueId } = await makeHolding('Rainy-day pot');
    await json(await p.patch(`/api/values/${valueId}`, { amount: '999.00' }));
    const update = (await activity()).items.find(
      (e) => e.entity === 'value' && e.entityId === valueId && e.action === 'update',
    )!;
    const undone = await json<WriteBody<UndoResult>>(
      await p.post(`/api/activity/${update.id}/undo`, {}),
    );
    expect(undone.result.undone).toEqual([
      { entryId: update.id, entity: 'value', entityId: valueId },
    ]);
    expect(undone.result.undoIds).toHaveLength(1);
    expect(undone.warnings).toEqual([]);
    const values = await json<{ items: { id: string; amountMinor: number }[] }>(
      await p.get(`/api/holdings/${holdingId}/values`),
    );
    expect(values.items.find((v) => v.id === valueId)?.amountMinor).toBe(10000);
  });

  it('undoes a whole agent turn', async () => {
    const { holdingId } = await makeHolding('Turn pot');
    const batchId = await agentWrites(holdingId);
    const undone = await json<WriteBody<UndoResult>>(
      await p.post(`/api/activity/batches/${batchId}/undo`, {}),
    );
    expect(undone.result.undone).toHaveLength(1);
    const values = await json<{ items: { date: string }[] }>(
      await p.get(`/api/holdings/${holdingId}/values`),
    );
    expect(values.items.map((v) => v.date)).not.toContain('2026-07-20');
  });

  it('answers UNDO_CONFLICT with the blockers, and NOT_FOUND for unknown ids', async () => {
    const { valueId } = await makeHolding('Conflict pot');
    await json(await p.patch(`/api/values/${valueId}`, { amount: '200.00' }));
    const first = (await activity()).items.find(
      (e) => e.entity === 'value' && e.entityId === valueId && e.action === 'update',
    )!;
    await json(await p.patch(`/api/values/${valueId}`, { amount: '300.00' }));
    const second = (await activity()).items.find(
      (e) => e.entity === 'value' && e.entityId === valueId && e.action === 'update',
    )!;
    const failed = await errorOf(await p.post(`/api/activity/${first.id}/undo`, {}), 409);
    expect(failed.code).toBe('UNDO_CONFLICT');
    expect(failed.blockers).toEqual([{ entry_id: second.id, action: 'update', at: second.at }]);

    expect(
      (await errorOf(await p.post(`/api/activity/${unknownId('aud')}/undo`, {}), 404)).code,
    ).toBe('NOT_FOUND');
    expect(
      (await errorOf(await p.post(`/api/activity/batches/${unknownId('bat')}/undo`, {}), 404)).code,
    ).toBe('NOT_FOUND');
    expect((await errorOf(await p.post('/api/activity/nope/undo', {}), 400)).fields).toHaveProperty(
      'id',
    );
  });

  it('fires value_undone after the response, with the person’s segment', async () => {
    const { valueId } = await makeHolding('Event pot');
    await json(await p.patch('/api/me', { segment: 'accumulating' }));
    await json(await p.patch(`/api/values/${valueId}`, { amount: '250.00' }));
    const update = (await activity()).items.find(
      (e) => e.entity === 'value' && e.entityId === valueId && e.action === 'update',
    )!;
    await target.settle();
    await db.owner.query('truncate analytics.event');
    const res = await p.post(`/api/activity/${update.id}/undo`, {});
    expect(res.status, await res.clone().text()).toBe(200);
    await target.settle();
    const { rows } = await db.owner.query<{
      name: string;
      segment: string;
      props: Record<string, unknown>;
    }>('select name, segment, props from analytics.event order by id');
    expect(rows).toStrictEqual([{ name: 'value_undone', segment: 'accumulating', props: {} }]);
  });
});
