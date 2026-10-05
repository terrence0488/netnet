import { createHash } from 'node:crypto';
import type { McpGetTaxonomyOutput } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOOL_REGISTRY } from '../../src/mcp/registry';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  errOf,
  eventsOf,
  mcpRequest,
  mcpTestApp,
  okOf,
  onboarded,
  rpcOf,
  type ConnectedAgent,
  type McpTestApp,
} from './support';

/**
 * Around the tools (architecture §5.1, §7.5, §7.6, §8): the touch and `live` after a success and
 * never after a failure, revoked and missing tokens, scopes, CORS, the P3 hook on `tools/call`
 * only, and the per-connection rate limits with the clock moved by hand.
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

async function connectionOf(connectionId: string): Promise<{
  first_call_at: string | null;
  last_used_at: string | null;
}> {
  const { rows } = await db.owner.query(
    `select first_call_at, last_used_at from core.agent_connection where id = $1`,
    [connectionId],
  );
  return rows[0] as { first_call_at: string | null; last_used_at: string | null };
}

async function approvedAttempt(userId: string, connectionId: string): Promise<void> {
  await db.owner.query(
    `insert into core.connection_attempt (id, user_id, client, entry, platform, state, connection_id)
     values ($1, $2, 'claude', 'home', 'computer', 'approved', $3)`,
    [`att_${connectionId.slice(4)}`, userId, connectionId],
  );
}

async function attemptOf(connectionId: string): Promise<string> {
  const { rows } = await db.owner.query<{ state: string }>(
    `select state from core.connection_attempt where connection_id = $1`,
    [connectionId],
  );
  return rows[0]?.state ?? '';
}

describe('touch and live', () => {
  it('touches the connection and marks its attempt live after a success', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    await approvedAttempt(userId, agent.connectionId);
    expect(await connectionOf(agent.connectionId)).toStrictEqual({
      first_call_at: null,
      last_used_at: null,
    });
    await callTool(target, agent.token, 'get_taxonomy');
    await target.settle();
    const touched = await connectionOf(agent.connectionId);
    expect(touched.first_call_at).not.toBeNull();
    expect(touched.last_used_at).not.toBeNull();
    expect(await attemptOf(agent.connectionId)).toBe('live');
  });

  it('touches nothing after a failure', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    await approvedAttempt(userId, agent.connectionId);
    errOf(
      await callTool(target, agent.token, 'get_holding', {
        holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
      }),
      'NOT_FOUND',
    );
    await target.settle();
    expect(await connectionOf(agent.connectionId)).toStrictEqual({
      first_call_at: null,
      last_used_at: null,
    });
    expect(await attemptOf(agent.connectionId)).toBe('approved');
  });
});

describe('tokens', () => {
  it('rejects a revoked connection on its next call', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    await callTool(target, agent.token, 'get_taxonomy');
    await db.owner.query(`update core.agent_connection set revoked_at = now() where id = $1`, [
      agent.connectionId,
    ]);
    const res = await mcpRequest(target, agent.token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate') ?? '';
    expect(challenge).toContain('resource_metadata=');
    expect(challenge).toContain('/.well-known/oauth-protected-resource');
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.message).toContain('revoked');
  });

  it('rejects a token for no connection', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    await db.owner.query(`delete from core.agent_connection where id = $1`, [agent.connectionId]);
    const res = await mcpRequest(target, agent.token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it('rejects no token, without an error attribute', async () => {
    const res = await mcpRequest(target, null, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('WWW-Authenticate') ?? '';
    expect(challenge).not.toContain('error=');
    expect(challenge).toContain('resource_metadata=');
  });

  it('rejects a forged token', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const forged = `${agent.token.slice(0, -2)}xx`;
    const res = await mcpRequest(target, forged, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(401);
  });
});

describe('scopes', () => {
  it('lets a read token read but not write', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId, { scopes: ['ledger.read'] });
    const taxonomy = okOf<McpGetTaxonomyOutput>(
      await callTool(target, agent.token, 'get_taxonomy'),
    );
    expect(taxonomy.types.length).toBeGreaterThan(0);
    const error = errOf(
      await callTool(target, agent.token, 'upsert_tag', { name: 'Sneak' }),
      'SCOPE_REQUIRED',
    );
    expect(error.message).toContain('ledger.write');
  });

  it('lets a write token write but not read', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId, { scopes: ['ledger.write'] });
    errOf(await callTool(target, agent.token, 'get_taxonomy'), 'SCOPE_REQUIRED');
    const upserted = await callTool(target, agent.token, 'upsert_tag', { name: 'Joint' });
    expect(upserted.isError ?? false).toBe(false);
  });
});

describe('CORS', () => {
  it('answers any origin, without credentials', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const res = await mcpRequest(
      target,
      agent.token,
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { headers: { Origin: 'https://some-agent.example' } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('answers a preflight', async () => {
    const res = await mcpRequest(
      target,
      null,
      {},
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://some-agent.example',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, mcp-protocol-version',
        },
      },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const allowed = res.headers.get('access-control-allow-headers') ?? '';
    expect(allowed.toLowerCase()).toContain('authorization');
    expect(allowed.toLowerCase()).toContain('mcp-protocol-version');
  });
});

describe('methods', () => {
  it('answers GET and DELETE 405', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    for (const method of ['GET', 'DELETE']) {
      const res = await mcpRequest(target, agent.token, {}, { method });
      expect(res.status, method).toBe(405);
    }
  });
});

describe('handshake and list', () => {
  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    },
  };

  it('negotiates 2025-11-25 and lists the sixteen tools', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const hello = await rpcOf(
      await mcpRequest(target, agent.token, initialize, { protocolVersion: '2025-11-25' }),
    );
    expect(hello.status).toBe(200);
    const result = hello.body.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe('2025-11-25');
    expect(result.serverInfo.name).toBe('netnet');
    const listed = await rpcOf(
      await mcpRequest(
        target,
        agent.token,
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { protocolVersion: '2025-11-25' },
      ),
    );
    expect(listed.status).toBe(200);
    const tools = (listed.body.result as { tools: { name: string; description: string }[] }).tools;
    expect(tools.map((t) => t.name).sort()).toStrictEqual(TOOL_REGISTRY.map((t) => t.name).sort());
    expect(tools).toHaveLength(16);
    for (const tool of tools) expect(tool.description.length).toBeGreaterThan(0);
  });

  it('answers an unknown tool with InvalidParams, and no event', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const res = await mcpRequest(target, agent.token, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'mend_the_books', arguments: {} },
    });
    const { body } = await rpcOf(res);
    const error = body.error as { code: number; message: string };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain('mend_the_books');
    await target.settle();
    expect(
      (await eventsOf(target, userId)).filter((e) => e.name === 'agent_tool_called'),
    ).toStrictEqual([]);
  });
});

describe('the P3 hook', () => {
  it('runs on tools/call only, whatever the outcome', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const checked: string[] = [];
    target.mcp.touchChecked = (touched: string) => {
      checked.push(touched);
      return Promise.resolve();
    };
    try {
      await mcpRequest(
        target,
        agent.token,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2026-07-28',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          },
        },
        { protocolVersion: '2026-07-28' },
      );
      await mcpRequest(
        target,
        agent.token,
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { protocolVersion: '2026-07-28' },
      );
      expect(checked).toStrictEqual([]);
      await callTool(target, agent.token, 'get_taxonomy');
      errOf(
        await callTool(target, agent.token, 'get_holding', {
          holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ',
        }),
        'NOT_FOUND',
      );
      await target.settle();
      expect(checked).toStrictEqual([userId, userId]);
    } finally {
      target.mcp.touchChecked = () => Promise.resolve();
    }
  });
});

describe('rate limits', () => {
  const storedKey = (connectionId: string, window: 'min' | 'day'): string =>
    createHash('sha256').update(`mcp:con:${connectionId}:${window}`).digest('hex');

  it('allows 120 a minute, then 429 with retry_after_s, then the next minute', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    for (let i = 0; i < 120; i += 1) {
      await callTool(target, agent.token, 'get_taxonomy');
    }
    const limited = await mcpRequest(target, agent.token, {
      jsonrpc: '2.0',
      id: 121,
      method: 'tools/list',
      params: {},
    });
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as {
      error: { code: string; message: string; retry_after_s: number };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retry_after_s).toBeGreaterThan(0);
    expect(limited.headers.get('Retry-After')).toBe(String(body.error.retry_after_s));
    target.rateClock.now = new Date(target.rateClock.now.getTime() + 61_000);
    await callTool(target, agent.token, 'get_taxonomy');
  });

  it('limits each connection on its own', async () => {
    const userId = await onboarded(target);
    const first: ConnectedAgent = await connectAgent(target, userId);
    const second: ConnectedAgent = await connectAgent(target, userId);
    for (let i = 0; i < 121; i += 1) {
      await mcpRequest(target, first.token, {
        jsonrpc: '2.0',
        id: i,
        method: 'tools/list',
        params: {},
      });
    }
    const res = await mcpRequest(target, second.token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status).toBe(200);
  });

  it('allows 5,000 a day', async () => {
    const userId = await onboarded(target);
    const agent = await connectAgent(target, userId);
    const dayMs = 24 * 60 * 60 * 1000;
    const windowStart = new Date(
      Math.floor(target.rateClock.now.getTime() / dayMs) * dayMs,
    ).toISOString();
    await db.owner.query(
      `insert into core.rate_limit (key, window_start, count) values ($1, $2, 5000)`,
      [storedKey(agent.connectionId, 'day'), windowStart],
    );
    const limited = await mcpRequest(target, agent.token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: { code: string; retry_after_s: number } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retry_after_s).toBeGreaterThan(0);
  });
});
