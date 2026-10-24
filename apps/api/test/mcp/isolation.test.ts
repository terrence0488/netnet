import type {
  McpCreateHoldingOutput,
  McpGetFinancialContextOutput,
  McpGetHoldingOutput,
  McpGetNetWorthHistoryOutput,
  McpGetPeriodChangesOutput,
  McpGetTaxonomyOutput,
  McpUpsertTagOutput,
  McpUpsertTypeOutput,
} from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOOL_REGISTRY } from '../../src/mcp/registry';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  errOf,
  ledgerOf,
  mcpTestApp,
  okOf,
  onboarded,
  type ConnectedAgent,
  type McpTestApp,
} from './support';

/**
 * Every tool is B's with A's ids (architecture §7.5): NOT_FOUND, none of A's data, and A's ledger
 * byte-for-byte as it was. A banks in QZ (EUR); B in GB (GBP), so a leak would also show in the
 * currency. The last test fails when a tool has no case here.
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

interface Person {
  agent: ConnectedAgent;
  holdingId: string;
  valueId: string;
  customTypeId: string;
  tagId: string;
  batchId: string;
}

interface Pair {
  a: Person;
  b: Person;
}

/** Two people, each with a holding (with a value), a custom type and a tag. */
async function pair(): Promise<Pair> {
  const make = async (country: string, name: string): Promise<Person> => {
    const userId = await onboarded(target, country);
    const agent = await connectAgent(target, userId, { client: 'claude', clientName: 'Claude' });
    const taxonomy = okOf<McpGetTaxonomyOutput>(
      await callTool(target, agent.token, 'get_taxonomy'),
    );
    const cashType = taxonomy.types.find(
      (t) => t.universal_type === 'cash' && t.pack_type_key === null,
    )!.id;
    const customType = okOf<McpUpsertTypeOutput>(
      await callTool(target, agent.token, 'upsert_type', {
        name: `${name} type`,
        universal_type: 'cash',
      }),
    ).result;
    const tag = okOf<McpUpsertTagOutput>(
      await callTool(target, agent.token, 'upsert_tag', { name: `${name} tag` }),
    ).result;
    const holding = okOf<McpCreateHoldingOutput>(
      await callTool(target, agent.token, 'create_holding', {
        name: `${name} pot`,
        kind: 'asset',
        type_id: cashType,
        currency: country === 'QZ' ? 'EUR' : 'GBP',
        tag_ids: [tag.id],
        opening_value: { amount: '1200.00', date: '2026-07-01' },
      }),
    ).result;
    const full = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: holding.id }),
    );
    const activity = okOf<{ entries: { batch_id: string | null }[] }>(
      await callTool(target, agent.token, 'list_activity', { limit: 1 }),
    );
    return {
      agent,
      holdingId: holding.id,
      valueId: full.values.items[0]?.id ?? '',
      customTypeId: customType.id,
      tagId: tag.id,
      batchId: activity.entries[0]?.batch_id ?? '',
    };
  };
  return { a: await make('QZ', 'Alpha'), b: await make('GB', 'Beta') };
}

/** B's call ran; A's ledger is as it was. */
async function unchanged(pair: Pair, run: () => Promise<unknown>): Promise<void> {
  const before = await ledgerOf(target, pair.a.agent.userId);
  await run();
  await target.settle();
  expect(await ledgerOf(target, pair.a.agent.userId)).toBe(before);
}

/** None of A's names or ids in `seen`. */
function seesOnlyOwn(seen: unknown, a: Person): void {
  const text = JSON.stringify(seen);
  for (const secret of [a.holdingId, a.valueId, a.customTypeId, a.tagId]) {
    expect(text).not.toContain(secret);
  }
  expect(text).not.toContain('Alpha');
}

describe('isolation', () => {
  it('get_financial_context answers B, never A', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      const context = okOf<McpGetFinancialContextOutput>(
        await callTool(target, p.b.agent.token, 'get_financial_context'),
      );
      expect(context.currency).toBe('GBP');
      seesOnlyOwn(context, p.a);
    });
  });

  it('list_holdings lists B, never A', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      const { holdings } = okOf<{ holdings: { name: string }[] }>(
        await callTool(target, p.b.agent.token, 'list_holdings'),
      );
      expect(holdings.map((h) => h.name)).toStrictEqual(['Beta pot']);
    });
  });

  it('get_holding refuses A\u2019s holding', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'get_holding', { holding_id: p.a.holdingId }),
        'NOT_FOUND',
      );
    });
  });

  it('get_net_worth_history answers B, never A', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      const history = okOf<McpGetNetWorthHistoryOutput>(
        await callTool(target, p.b.agent.token, 'get_net_worth_history', { group_by: 'currency' }),
      );
      expect(history.currency).toBe('GBP');
      for (const point of history.points) {
        expect(Object.keys(point.groups ?? {})).not.toContain('EUR');
      }
    });
  });

  it('get_period_changes answers B, never A', async () => {
    const p = await pair();
    // A later value of B's own: the first period has no drivers, so the second names one.
    okOf(
      await callTool(target, p.b.agent.token, 'record_values', {
        values: [{ holding_id: p.b.holdingId, amount: '1300.00' }],
      }),
    );
    await target.settle();
    await unchanged(p, async () => {
      const table = okOf<McpGetPeriodChangesOutput>(
        await callTool(target, p.b.agent.token, 'get_period_changes', { view: 'monthly' }),
      );
      expect(table.currency).toBe('GBP');
      expect(table.periods.map((period) => period.start)).toEqual(['2026-08-01', '2026-07-01']);
      expect(table.periods[0]?.drivers.map((d) => d.name)).toStrictEqual(['Beta pot']);
      expect(table.periods[1]).toMatchObject({ end_value: 1200, change: null, drivers: [] });
      seesOnlyOwn(table, p.a);
    });
  });

  it('get_taxonomy answers B, never A', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      const taxonomy = okOf<McpGetTaxonomyOutput>(
        await callTool(target, p.b.agent.token, 'get_taxonomy'),
      );
      expect(taxonomy.types.map((t) => t.label)).toContain('Beta type');
      seesOnlyOwn(taxonomy, p.a);
    });
  });

  it('list_activity lists B, never A', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      const activity = okOf<{ entries: { summary: string }[] }>(
        await callTool(target, p.b.agent.token, 'list_activity'),
      );
      expect(activity.entries.length).toBeGreaterThan(0);
      seesOnlyOwn(activity, p.a);
      expect(JSON.stringify(activity)).toContain('Beta');
      const filtered = okOf<{ entries: unknown[] }>(
        await callTool(target, p.b.agent.token, 'list_activity', { batch_id: p.a.batchId }),
      );
      expect(filtered.entries).toEqual([]);
    });
  });

  it('get_setup_guide answers B\u2019s country', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      const guide = okOf<{ country: string; checklist: { id: string }[] }>(
        await callTool(target, p.b.agent.token, 'get_setup_guide'),
      );
      expect(guide.country).toBe('GB');
      expect(guide.checklist.map((i) => i.id)).toStrictEqual(['everyday', 'home']);
    });
  });

  it('create_holding refuses A\u2019s type and tag', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      const typeError = errOf(
        await callTool(target, p.b.agent.token, 'create_holding', {
          name: 'Sneak',
          kind: 'asset',
          type_id: p.a.customTypeId,
          currency: 'GBP',
        }),
        'NOT_FOUND',
      );
      expect(typeError.fields).toHaveProperty('type_id');
      const bTaxonomy = okOf<McpGetTaxonomyOutput>(
        await callTool(target, p.b.agent.token, 'get_taxonomy'),
      );
      const bCash = bTaxonomy.types.find(
        (t) => t.universal_type === 'cash' && t.pack_type_key === null,
      )!.id;
      const tagError = errOf(
        await callTool(target, p.b.agent.token, 'create_holding', {
          name: 'Sneak',
          kind: 'asset',
          type_id: bCash,
          currency: 'GBP',
          tag_ids: [p.a.tagId],
        }),
        'NOT_FOUND',
      );
      expect(tagError.fields).toHaveProperty('tag_ids[0]');
    });
  });

  it('update_holding refuses A\u2019s holding', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'update_holding', {
          holding_id: p.a.holdingId,
          name: 'Sneak',
        }),
        'NOT_FOUND',
      );
    });
  });

  it('delete_holding refuses A\u2019s holding', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'delete_holding', { holding_id: p.a.holdingId }),
        'NOT_FOUND',
      );
      const still = okOf<McpGetHoldingOutput>(
        await callTool(target, p.a.agent.token, 'get_holding', { holding_id: p.a.holdingId }),
      );
      expect(still.name).toBe('Alpha pot');
    });
  });

  it('record_values refuses A\u2019s holding', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'record_values', {
          values: [{ holding_id: p.a.holdingId, amount: '1.00' }],
        }),
        'NOT_FOUND',
      );
    });
  });

  it('update_value refuses A\u2019s value', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'update_value', {
          value_id: p.a.valueId,
          amount: '1.00',
        }),
        'NOT_FOUND',
      );
    });
  });

  it('delete_value refuses A\u2019s value', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'delete_value', { value_id: p.a.valueId }),
        'NOT_FOUND',
      );
    });
  });

  it('upsert_type refuses A\u2019s type', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'upsert_type', {
          type_id: p.a.customTypeId,
          name: 'Sneak',
        }),
        'NOT_FOUND',
      );
    });
  });

  it('delete_type refuses A\u2019s type', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'delete_type', { type_id: p.a.customTypeId }),
        'NOT_FOUND',
      );
    });
  });

  it('upsert_tag refuses A\u2019s tag', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'upsert_tag', {
          tag_id: p.a.tagId,
          name: 'Sneak',
        }),
        'NOT_FOUND',
      );
    });
  });

  it('delete_tag refuses A\u2019s tag', async () => {
    const p = await pair();
    await unchanged(p, async () => {
      errOf(
        await callTool(target, p.b.agent.token, 'delete_tag', { tag_id: p.a.tagId }),
        'NOT_FOUND',
      );
      const taxonomy = okOf<McpGetTaxonomyOutput>(
        await callTool(target, p.a.agent.token, 'get_taxonomy'),
      );
      expect(taxonomy.tags.map((t) => t.name)).toContain('Alpha tag');
    });
  });

  it('every tool has a case above', async () => {
    const p = await pair();
    const cases: Record<string, () => Promise<unknown>> = {
      get_financial_context: () => callTool(target, p.b.agent.token, 'get_financial_context'),
      list_holdings: () => callTool(target, p.b.agent.token, 'list_holdings'),
      get_holding: () =>
        callTool(target, p.b.agent.token, 'get_holding', { holding_id: p.a.holdingId }),
      get_net_worth_history: () => callTool(target, p.b.agent.token, 'get_net_worth_history'),
      get_period_changes: () =>
        callTool(target, p.b.agent.token, 'get_period_changes', { view: 'monthly' }),
      get_taxonomy: () => callTool(target, p.b.agent.token, 'get_taxonomy'),
      get_setup_guide: () => callTool(target, p.b.agent.token, 'get_setup_guide'),
      list_activity: () => callTool(target, p.b.agent.token, 'list_activity'),
      create_holding: () =>
        callTool(target, p.b.agent.token, 'create_holding', {
          name: 'Sneak',
          kind: 'asset',
          type_id: p.a.customTypeId,
          currency: 'GBP',
        }),
      update_holding: () =>
        callTool(target, p.b.agent.token, 'update_holding', {
          holding_id: p.a.holdingId,
          name: 'Sneak',
        }),
      delete_holding: () =>
        callTool(target, p.b.agent.token, 'delete_holding', { holding_id: p.a.holdingId }),
      record_values: () =>
        callTool(target, p.b.agent.token, 'record_values', {
          values: [{ holding_id: p.a.holdingId, amount: '1.00' }],
        }),
      update_value: () =>
        callTool(target, p.b.agent.token, 'update_value', {
          value_id: p.a.valueId,
          amount: '1.00',
        }),
      delete_value: () =>
        callTool(target, p.b.agent.token, 'delete_value', { value_id: p.a.valueId }),
      upsert_type: () =>
        callTool(target, p.b.agent.token, 'upsert_type', {
          type_id: p.a.customTypeId,
          name: 'Sneak',
        }),
      delete_type: () =>
        callTool(target, p.b.agent.token, 'delete_type', { type_id: p.a.customTypeId }),
      upsert_tag: () =>
        callTool(target, p.b.agent.token, 'upsert_tag', { tag_id: p.a.tagId, name: 'Sneak' }),
      delete_tag: () => callTool(target, p.b.agent.token, 'delete_tag', { tag_id: p.a.tagId }),
    };
    expect(Object.keys(cases).sort()).toStrictEqual(TOOL_REGISTRY.map((t) => t.name).sort());
    for (const run of Object.values(cases)) await run();
    await target.settle();
  });
});
