import type {
  McpCreateHoldingOutput,
  McpDeleteHoldingOutput,
  McpDeleteTagOutput,
  McpDeleteTypeOutput,
  McpDeleteValueOutput,
  McpGetHoldingOutput,
  McpGetTaxonomyOutput,
  McpRecordValuesOutput,
  McpUpdateHoldingOutput,
  McpUpdateValueOutput,
  McpUpsertTagOutput,
  McpUpsertTypeOutput,
} from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  errOf,
  mcpTestApp,
  okOf,
  onboarded,
  type ConnectedAgent,
  type McpTestApp,
} from './support';

/**
 * The ten write tools (architecture §7.4): a happy path, a validation error and not-found each,
 * and the behaviours that make a write a write — duplicates, atomic batches, moves and merges.
 */

let db: TestDatabase;
let target: McpTestApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = await mcpTestApp(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

interface Seeded {
  agent: ConnectedAgent;
  cashType: string;
  listedType: string;
}

/** An onboarded person, their agent, and two type ids. */
async function seeded(): Promise<Seeded> {
  const userId = await onboarded(target);
  const agent = await connectAgent(target, userId, { client: 'claude', clientName: 'Claude' });
  const taxonomy = okOf<McpGetTaxonomyOutput>(await callTool(target, agent.token, 'get_taxonomy'));
  const plain = (universal: string) =>
    taxonomy.types.find((t) => t.universal_type === universal && t.pack_type_key === null)!.id;
  return { agent, cashType: plain('cash'), listedType: plain('listed') };
}

async function createHolding(
  agent: ConnectedAgent,
  args: Record<string, unknown>,
): Promise<McpCreateHoldingOutput> {
  return okOf<McpCreateHoldingOutput>(await callTool(target, agent.token, 'create_holding', args));
}

async function valuesOf(agent: ConnectedAgent, holdingId: string): Promise<number[]> {
  const holding = okOf<McpGetHoldingOutput>(
    await callTool(target, agent.token, 'get_holding', { holding_id: holdingId }),
  );
  return holding.values.items.map((v) => v.amount);
}

describe('create_holding', () => {
  it('creates with tags, an access answer and a first value', async () => {
    const { agent, cashType } = await seeded();
    const tag = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' }),
    ).result;
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      tag_ids: [tag.id],
      access_answer: 'now',
      opening_value: { amount: '1200.00', date: '2026-07-01' },
    });
    expect(created.result.id).toMatch(/^hld_/);
    expect(created.result.tag_ids).toStrictEqual([tag.id]);
    expect(created.data_version).toBeGreaterThan(0);
    expect(await valuesOf(agent, created.result.id)).toStrictEqual([1200]);
  });

  it('answers a likely duplicate, unless allowed', async () => {
    const { agent, cashType } = await seeded();
    const args = {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
    } as const;
    await createHolding(agent, { ...args });
    const error = errOf(
      await callTool(target, agent.token, 'create_holding', { ...args }),
      'LIKELY_DUPLICATE',
    );
    expect(error.candidates).toHaveLength(1);
    const created = await createHolding(agent, { ...args, allow_duplicate: true });
    expect(created.result.id).toMatch(/^hld_/);
  });

  it('rejects a bad amount, and both type namings', async () => {
    const { agent, cashType } = await seeded();
    const badAmount = errOf(
      await callTool(target, agent.token, 'create_holding', {
        name: 'Everyday pot',
        kind: 'asset',
        type_id: cashType,
        currency: 'EUR',
        opening_value: { amount: 'twelve' },
      }),
      'VALIDATION_FAILED',
    );
    expect(badAmount.fields).toHaveProperty('opening_value.amount');
    const both = errOf(
      await callTool(target, agent.token, 'create_holding', {
        name: 'Everyday pot',
        kind: 'asset',
        type_id: cashType,
        universal_type: 'cash',
        currency: 'EUR',
      }),
      'VALIDATION_FAILED',
    );
    expect(both.fields).toHaveProperty('type_id');
  });

  it('names an unknown type', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'create_holding', {
        name: 'Everyday pot',
        kind: 'asset',
        type_id: 'typ_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
        currency: 'EUR',
      }),
      'NOT_FOUND',
    );
    expect(error.fields).toHaveProperty('type_id');
  });
});

describe('update_holding', () => {
  it('renames and archives', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
    });
    const updated = okOf<McpUpdateHoldingOutput>(
      await callTool(target, agent.token, 'update_holding', {
        holding_id: created.result.id,
        name: 'Spending pot',
        archived: true,
      }),
    );
    expect(updated.result.name).toBe('Spending pot');
    expect(updated.result.archived).toBe(true);
    expect(updated.data_version).toBeGreaterThan(created.data_version);
  });

  it('rejects a bad access answer', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
    });
    const error = errOf(
      await callTool(target, agent.token, 'update_holding', {
        holding_id: created.result.id,
        access_answer: 'bogus',
      }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('access_answer');
  });

  it('names an unknown holding', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'update_holding', {
        holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
        name: 'Elsewhere',
      }),
      'NOT_FOUND',
    );
  });
});

describe('delete_holding', () => {
  it('deletes, and it stays gone', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      opening_value: { amount: '1200.00' },
    });
    const deleted = okOf<McpDeleteHoldingOutput>(
      await callTool(target, agent.token, 'delete_holding', { holding_id: created.result.id }),
    );
    expect(deleted.result).toBeNull();
    errOf(
      await callTool(target, agent.token, 'get_holding', { holding_id: created.result.id }),
      'NOT_FOUND',
    );
  });

  it('names an unknown holding', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'delete_holding', {
        holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
      }),
      'NOT_FOUND',
    );
  });
});

describe('record_values', () => {
  it('records across holdings in one call', async () => {
    const { agent, cashType } = await seeded();
    const first = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
    });
    const second = await createHolding(agent, {
      name: 'Old tin',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
    });
    const recorded = okOf<McpRecordValuesOutput>(
      await callTool(target, agent.token, 'record_values', {
        values: [
          { holding_id: first.result.id, amount: '1250.00', date: '2026-07-28' },
          { holding_id: second.result.id, amount: '55.00', date: '2026-07-28' },
        ],
      }),
    );
    expect(recorded.results).toHaveLength(2);
    expect(recorded.results[0]?.value.amount).toBe(1250);
    expect(recorded.results[0]?.replaced).toBe(false);
    expect(await valuesOf(agent, second.result.id)).toStrictEqual([55]);
  });

  it('takes 200 values, and refuses 201', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
    });
    const values = Array.from({ length: 200 }, (_, i) => ({
      holding_id: created.result.id,
      amount: `${1000 + i}.00`,
      date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    const recorded = okOf<McpRecordValuesOutput>(
      await callTool(target, agent.token, 'record_values', { values }),
    );
    expect(recorded.results).toHaveLength(200);
    const error = errOf(
      await callTool(target, agent.token, 'record_values', { values: [...values, values[0]] }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('values');
  });

  it('writes nothing when one item is bad', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      opening_value: { amount: '1200.00', date: '2026-07-01' },
    });
    errOf(
      await callTool(target, agent.token, 'record_values', {
        values: [
          { holding_id: created.result.id, amount: '1250.00', date: '2026-07-28' },
          { holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ', amount: '10.00' },
        ],
      }),
      'NOT_FOUND',
    );
    expect(await valuesOf(agent, created.result.id)).toStrictEqual([1200]);
  });

  it('names an unknown holding', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'record_values', {
        values: [{ holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ', amount: '10.00' }],
      }),
      'NOT_FOUND',
    );
    expect(error.fields).toHaveProperty('values[0].holding_id');
  });
});

describe('update_value', () => {
  it('changes the amount, and the latest follows', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      opening_value: { amount: '1200.00', date: '2026-07-01' },
    });
    const holding = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: created.result.id }),
    );
    const valueId = holding.values.items[0]?.id ?? '';
    const updated = okOf<McpUpdateValueOutput>(
      await callTool(target, agent.token, 'update_value', { value_id: valueId, amount: '1300.00' }),
    );
    expect(updated.result.amount).toBe(1300);
    expect(await valuesOf(agent, created.result.id)).toStrictEqual([1300]);
  });

  it('rejects a bad amount', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      opening_value: { amount: '1200.00' },
    });
    const holding = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: created.result.id }),
    );
    const error = errOf(
      await callTool(target, agent.token, 'update_value', {
        value_id: holding.values.items[0]?.id,
        amount: 'twelve',
      }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('amount');
  });

  it('names an unknown value', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'update_value', {
        value_id: 'val_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
        amount: '10.00',
      }),
      'NOT_FOUND',
    );
  });
});

describe('delete_value', () => {
  it('deletes, and the previous value becomes latest', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      opening_value: { amount: '1200.00', date: '2026-07-01' },
    });
    await callTool(target, agent.token, 'record_values', {
      values: [{ holding_id: created.result.id, amount: '1250.00', date: '2026-07-28' }],
    });
    const holding = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: created.result.id }),
    );
    const deleted = okOf<McpDeleteValueOutput>(
      await callTool(target, agent.token, 'delete_value', {
        value_id: holding.values.items[0]?.id,
      }),
    );
    expect(deleted.result).toBeNull();
    expect(await valuesOf(agent, created.result.id)).toStrictEqual([1200]);
  });

  it('names an unknown value', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'delete_value', {
        value_id: 'val_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
      }),
      'NOT_FOUND',
    );
  });
});

describe('upsert_type', () => {
  it('creates a custom type of a universal type', async () => {
    const { agent } = await seeded();
    const upserted = okOf<McpUpsertTypeOutput>(
      await callTool(target, agent.token, 'upsert_type', {
        name: 'Notice account',
        universal_type: 'cash',
      }),
    );
    expect(upserted.result.label).toBe('Notice account');
    expect(upserted.result.custom_name).toBe('Notice account');
    expect(upserted.result.meaning).toBe('Meaning of cash.');
  });

  it('renames a type', async () => {
    const { agent, cashType } = await seeded();
    const upserted = okOf<McpUpsertTypeOutput>(
      await callTool(target, agent.token, 'upsert_type', { type_id: cashType, name: 'Day to day' }),
    );
    expect(upserted.result.custom_name).toBe('Day to day');
    expect(upserted.result.label).toBe('Day to day');
  });

  it('needs a universal type for a new type', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'upsert_type', { name: 'Notice account' }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('universal_type');
  });

  it('names an unknown type', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'upsert_type', {
        type_id: 'typ_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
        name: 'Elsewhere',
      }),
      'NOT_FOUND',
    );
  });
});

describe('delete_type', () => {
  it('deletes an unused type', async () => {
    const { agent } = await seeded();
    const upserted = okOf<McpUpsertTypeOutput>(
      await callTool(target, agent.token, 'upsert_type', {
        name: 'Notice account',
        universal_type: 'cash',
      }),
    );
    const deleted = okOf<McpDeleteTypeOutput>(
      await callTool(target, agent.token, 'delete_type', { type_id: upserted.result.id }),
    );
    expect(deleted.result).toBeNull();
    const taxonomy = okOf<McpGetTaxonomyOutput>(
      await callTool(target, agent.token, 'get_taxonomy'),
    );
    expect(taxonomy.types.some((t) => t.id === upserted.result.id)).toBe(false);
  });

  it('refuses a used type without a move, and moves with one', async () => {
    const { agent, cashType } = await seeded();
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
    });
    const notice = okOf<McpUpsertTypeOutput>(
      await callTool(target, agent.token, 'upsert_type', {
        name: 'Notice account',
        universal_type: 'cash',
      }),
    ).result;
    const refused = errOf(
      await callTool(target, agent.token, 'delete_type', { type_id: cashType }),
      'VALIDATION_FAILED',
    );
    expect(refused.fields).toHaveProperty('move_holdings_to');
    const deleted = okOf<McpDeleteTypeOutput>(
      await callTool(target, agent.token, 'delete_type', {
        type_id: cashType,
        move_holdings_to: notice.id,
      }),
    );
    expect(deleted.result).toBeNull();
    const holding = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: created.result.id }),
    );
    expect(holding.type_id).toBe(notice.id);
  });

  it('names an unknown type', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'delete_type', {
        type_id: 'typ_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
      }),
      'NOT_FOUND',
    );
  });
});

describe('upsert_tag', () => {
  it('creates a tag', async () => {
    const { agent } = await seeded();
    const upserted = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' }),
    );
    expect(upserted.result.id).toMatch(/^tag_/);
    expect(upserted.result.name).toBe('Joint');
  });

  it('renames a tag', async () => {
    const { agent } = await seeded();
    const upserted = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' }),
    );
    const renamed = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', {
        tag_id: upserted.result.id,
        name: 'Ours',
      }),
    );
    expect(renamed.result.name).toBe('Ours');
  });

  it('refuses a taken name', async () => {
    const { agent } = await seeded();
    await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' });
    const error = errOf(
      await callTool(target, agent.token, 'upsert_tag', { name: 'joint' }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('name');
  });

  it('names an unknown tag', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'upsert_tag', {
        tag_id: 'tag_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
        name: 'Elsewhere',
      }),
      'NOT_FOUND',
    );
  });
});

describe('delete_tag', () => {
  it('deletes, and holdings lose it', async () => {
    const { agent, cashType } = await seeded();
    const tag = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' }),
    ).result;
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      tag_ids: [tag.id],
    });
    const deleted = okOf<McpDeleteTagOutput>(
      await callTool(target, agent.token, 'delete_tag', { tag_id: tag.id }),
    );
    expect(deleted.result).toBeNull();
    const holding = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: created.result.id }),
    );
    expect(holding.tag_ids).toStrictEqual([]);
  });

  it('merges into another tag', async () => {
    const { agent, cashType } = await seeded();
    const oldTag = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' }),
    ).result;
    const newTag = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Ours' }),
    ).result;
    const created = await createHolding(agent, {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      tag_ids: [oldTag.id],
    });
    await callTool(target, agent.token, 'delete_tag', {
      tag_id: oldTag.id,
      merge_into: newTag.id,
    });
    const holding = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: created.result.id }),
    );
    expect(holding.tag_ids).toStrictEqual([newTag.id]);
  });

  it('refuses a merge into itself', async () => {
    const { agent } = await seeded();
    const tag = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' }),
    ).result;
    const error = errOf(
      await callTool(target, agent.token, 'delete_tag', { tag_id: tag.id, merge_into: tag.id }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('merge_into');
  });

  it('names an unknown tag', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'delete_tag', {
        tag_id: 'tag_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
      }),
      'NOT_FOUND',
    );
  });
});
