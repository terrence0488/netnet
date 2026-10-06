import type { McpGetTaxonomyOutput } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  eventsOf,
  mcpTestApp,
  okOf,
  onboarded,
  type McpTestApp,
} from './support';

/**
 * What a call records (architecture §5.1, §7.7): `agent_tool_called` every time, a write's own
 * events with `source: agent` (PRD J3), and never an amount or a name (N9).
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

describe('agent_tool_called', () => {
  it('records a read with its kind, outcome, latency and client', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId, { client: 'claude', clientName: 'Claude' });
    await callTool(target, agent.token, 'get_taxonomy');
    await target.settle();
    const called = (await eventsOf(target, userId)).filter((e) => e.name === 'agent_tool_called');
    expect(called).toHaveLength(1);
    const props = called[0]?.props as Record<string, unknown>;
    expect(props.tool).toBe('get_taxonomy');
    expect(props.kind).toBe('read');
    expect(props.outcome).toBe('ok');
    expect(typeof props.latency_ms).toBe('number');
    expect(props.latency_ms as number).toBeGreaterThanOrEqual(0);
    expect(props.client).toBe('claude');
  });

  it('records a write, and the write\u2019s own events with source agent', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId, { client: 'chatgpt', clientName: 'ChatGPT' });
    const taxonomy = okOf<McpGetTaxonomyOutput>(
      await callTool(target, agent.token, 'get_taxonomy'),
    );
    const cashType = taxonomy.types.find(
      (t) => t.universal_type === 'cash' && t.pack_type_key === null,
    )!.id;
    await callTool(target, agent.token, 'create_holding', {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      opening_value: { amount: '1200.00' },
    });
    await callTool(target, agent.token, 'record_values', {
      values: [{ holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ', amount: '10.00' }],
    }).catch(() => undefined);
    await target.settle();
    const events = await eventsOf(target, userId);
    const called = events.filter((e) => e.name === 'agent_tool_called');
    // The calls' events are written after their responses, so calls landing in the same
    // millisecond can insert in either order: the set is asserted, never the row order.
    expect(called.map((e) => (e.props as { tool: string }).tool).sort()).toStrictEqual([
      'create_holding',
      'get_taxonomy',
      'record_values',
    ]);
    const byTool = (tool: string) =>
      called.find((e) => (e.props as { tool: string }).tool === tool)?.props as Record<
        string,
        unknown
      >;
    const write = byTool('create_holding');
    expect(write.kind).toBe('write');
    expect(write.outcome).toBe('ok');
    expect(write.client).toBe('chatgpt');
    const failed = byTool('record_values');
    expect(failed.outcome).toBe('NOT_FOUND');
    const created = events.find((e) => e.name === 'holding_created');
    expect((created?.props as { source: string } | undefined)?.source).toBe('agent');
  });

  it('carries no amount, name or email', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId, { client: 'claude', clientName: 'Claude' });
    const taxonomy = okOf<McpGetTaxonomyOutput>(
      await callTool(target, agent.token, 'get_taxonomy'),
    );
    const cashType = taxonomy.types.find(
      (t) => t.universal_type === 'cash' && t.pack_type_key === null,
    )!.id;
    await callTool(target, agent.token, 'create_holding', {
      name: 'Everyday pot',
      kind: 'asset',
      type_id: cashType,
      currency: 'EUR',
      opening_value: { amount: '1200.00' },
    });
    await target.settle();
    const text = JSON.stringify(await eventsOf(target, userId));
    expect(text).not.toContain('Everyday pot');
    expect(text).not.toContain('1200');
    expect(text).not.toContain('@example.com');
    expect(text).not.toContain('Claude');
  });
});
