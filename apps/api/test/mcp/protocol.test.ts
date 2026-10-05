import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  mcpTestApp,
  okOf,
  onboarded,
  rpcOf,
  type McpTestApp,
} from './support';

/**
 * The protocol-version matrix, over HTTP (architecture §3): the SDK client on 2026-07-28
 * (pinned, so anything else fails loudly) and on 2025-11-25, and raw JSON-RPC on 2025-06-18,
 * which the v2 client no longer speaks. Each connects, lists, reads, writes and fails well.
 */

let db: TestDatabase;
let target: McpTestApp;
let url = '';
let close = async (): Promise<void> => {};

beforeAll(async () => {
  db = await createTestDatabase();
  target = await mcpTestApp(db);
  const served = await target.listen();
  url = served.url;
  close = served.close;
}, 60_000);

afterAll(async () => {
  await close();
  await db?.close();
});

/** A client on `url` as `token`: pinned modern, or the legacy handshake by default. */
async function sdkClient(
  token: string,
  versionNegotiation?: { mode: { pin: string } },
): Promise<Client> {
  const client = new Client(
    { name: 'netnet-test', version: '1' },
    ...(versionNegotiation === undefined ? [] : [{ versionNegotiation }]),
  );
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
    authProvider: { token: () => Promise.resolve(token) },
  });
  await client.connect(transport);
  return client;
}

describe.each([{ version: '2026-07-28' }, { version: '2025-11-25' }])(
  'SDK client on $version',
  ({ version }) => {
    it('connects, lists, reads, writes and fails well', async () => {
      const userId = await onboarded(target);
      const agent = await connectAgent(target, userId);
      const client = await sdkClient(
        agent.token,
        version === '2026-07-28' ? { mode: { pin: version } } : undefined,
      );
      try {
        const listed = await client.listTools();
        expect(listed.tools).toHaveLength(16);
        expect(listed.tools.map((t) => t.name)).toContain('get_financial_context');
        const read = await client.callTool({ name: 'get_taxonomy', arguments: {} });
        expect(read.isError ?? false).toBe(false);
        const taxonomy = read.structuredContent as { types: { id: string }[] };
        expect(taxonomy.types.length).toBeGreaterThan(0);
        const written = await client.callTool({ name: 'upsert_tag', arguments: { name: 'Joint' } });
        expect(written.isError ?? false).toBe(false);
        const tag = (written.structuredContent as { result: { id: string; name: string } }).result;
        expect(tag.name).toBe('Joint');
        const failed = await client.callTool({
          name: 'get_holding',
          arguments: { holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ' },
        });
        expect(failed.isError).toBe(true);
        const error = (failed.structuredContent as { error: { code: string } }).error;
        expect(error.code).toBe('NOT_FOUND');
      } finally {
        await client.close();
      }
      await target.settle();
    });
  },
);

describe('raw client on 2025-06-18', () => {
  let rpcIds = 1000;

  async function rpc(
    token: string,
    method: string,
    params: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    rpcIds += 1;
    const res = await fetch(`${url}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcIds, method, params }),
    });
    return rpcOf(res);
  }

  it('connects, lists, reads, writes and fails well', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const hello = await rpc(agent.token, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'netnet-test', version: '1' },
    });
    expect(hello.status).toBe(200);
    const negotiated = hello.body.result as { protocolVersion: string };
    expect(negotiated.protocolVersion).toBe('2025-06-18');
    const listed = await rpc(agent.token, 'tools/list', {});
    expect(listed.status).toBe(200);
    const tools = (listed.body.result as { tools: { name: string }[] }).tools;
    expect(tools).toHaveLength(16);
    const read = await rpc(agent.token, 'tools/call', { name: 'get_taxonomy', arguments: {} });
    expect(read.status).toBe(200);
    const taxonomy = (read.body.result as { structuredContent: { types: { id: string }[] } })
      .structuredContent;
    expect(taxonomy.types.length).toBeGreaterThan(0);
    const cashType = taxonomy.types[0]?.id ?? '';
    const written = await rpc(agent.token, 'tools/call', {
      name: 'create_holding',
      arguments: { name: 'Everyday pot', kind: 'asset', type_id: cashType, currency: 'EUR' },
    });
    expect(written.status).toBe(200);
    const created = (written.body.result as { structuredContent: { result: { id: string } } })
      .structuredContent.result;
    expect(created.id).toMatch(/^hld_/);
    const failed = await rpc(agent.token, 'tools/call', {
      name: 'get_holding',
      arguments: { holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ' },
    });
    expect(failed.status).toBe(200);
    const result = failed.body.result as {
      isError: boolean;
      structuredContent: { error: { code: string } };
    };
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe('NOT_FOUND');
    await target.settle();
  });

  it('speaks the same ledger as the app itself', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const written = await rpc(agent.token, 'tools/call', {
      name: 'upsert_tag',
      arguments: { name: 'Joint' },
    });
    expect(written.status).toBe(200);
    const seen = okOf<{ tags: { name: string }[] }>(
      await callTool(target, agent.token, 'get_taxonomy'),
    );
    expect(seen.tags.map((t) => t.name)).toContain('Joint');
    await target.settle();
  });
});
