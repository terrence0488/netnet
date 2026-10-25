import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  endpointFor,
  ListingToolsError,
  listTools,
  markdownTable,
  missingAnnotations,
  rowOf,
  toolsOf,
  type ListedTool,
} from '../../scripts/listing-tools';

/**
 * `scripts/listing-tools.ts` against a server on this machine, never the internet. The fixture
 * speaks the stateless 2026-07-28 `tools/list` shape (one page as JSON, one as SSE, with a
 * cursor), so the request headers, both body encodings, pagination and the table are all real.
 * The real 18-tool list is taken from the running server with `pnpm listing:tools` and embedded
 * in `ops/launch/listings.md`, not retyped.
 */

/** A tool as the fixture returns it. */
const TOOLS: ListedTool[] = [
  {
    name: 'get_financial_context',
    title: 'Financial context',
    description: 'The whole picture in one call.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'delete_holding',
    title: 'Delete holding',
    description: 'Stop tracking a holding, with all its values.',
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  {
    name: 'upsert_tag',
    title: 'Tag name',
    description: 'Create or rename a tag.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

interface Seen {
  method: string;
  version: string;
  rpcMethod: string;
  authorization: string;
  cursor: string | undefined;
}

/** One page as plain JSON, the other as SSE, so both parsers are exercised. */
function page(cursor: string | undefined): { body: string; sse: boolean } {
  if (cursor === undefined) {
    return {
      body: JSON.stringify({ result: { tools: TOOLS.slice(0, 2), nextCursor: 'page-2' } }),
      sse: false,
    };
  }
  return {
    sse: true,
    body: `event: message\ndata: ${JSON.stringify({ result: { tools: TOOLS.slice(2) } })}\n\n`,
  };
}

const seen: Seen[] = [];

async function start(
  handler: (request: IncomingMessage, response: ServerResponse, body: string) => void,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const created: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      handler(request, response, Buffer.concat(chunks).toString('utf8'));
    });
  });
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  const port = (created.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => created.close(() => resolve())),
  };
}

describe('listing:tools', () => {
  it('names the connector endpoint from an origin', () => {
    expect(endpointFor('https://netnetapp.io')).toBe('https://netnetapp.io/mcp');
    expect(endpointFor('https://netnetapp.io/')).toBe('https://netnetapp.io/mcp');
    expect(endpointFor('https://netnetapp.io/mcp')).toBe('https://netnetapp.io/mcp');
    expect(endpointFor('http://127.0.0.1:3107')).toBe('http://127.0.0.1:3107/mcp');
  });

  it('refuses plain http off localhost, and anything that is not a URL', () => {
    expect(() => endpointFor('http://netnetapp.io')).toThrow(ListingToolsError);
    expect(() => endpointFor('netnetapp.io')).toThrow(ListingToolsError);
  });

  it('lists every page from a local server, reading JSON and SSE', async () => {
    const fixture = await start((request, response, body) => {
      const parsed = JSON.parse(body) as {
        method: string;
        params: { cursor?: string };
      };
      const cursor = parsed.params.cursor;
      seen.push({
        method: request.method ?? '',
        version: (request.headers['mcp-protocol-version'] as string | undefined) ?? '',
        rpcMethod: parsed.method,
        authorization: request.headers.authorization ?? '',
        cursor,
      });
      const { body: answer, sse } = page(cursor);
      response.writeHead(200, {
        'Content-Type': sse ? 'text/event-stream' : 'application/json',
      });
      response.end(answer);
    });
    try {
      const tools = await listTools({ origin: fixture.origin, token: 'test-token' });
      expect(tools.map((tool) => tool.name)).toStrictEqual([
        'get_financial_context',
        'delete_holding',
        'upsert_tag',
      ]);
      expect(seen).toHaveLength(2);
      expect(seen[0]).toMatchObject({
        method: 'POST',
        version: '2026-07-28',
        rpcMethod: 'tools/list',
        authorization: 'Bearer test-token',
        cursor: undefined,
      });
      expect(seen[1]?.cursor).toBe('page-2');

      const rows = tools.map(rowOf);
      expect(rows[0]).toMatchObject({ kind: 'read', destructive: false });
      expect(rows[1]).toMatchObject({ kind: 'write', destructive: true });
      expect(rows[2]).toMatchObject({ kind: 'write', destructive: false });
      expect(missingAnnotations(tools)).toStrictEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it('reports a tool without a title or a hint', () => {
    expect(missingAnnotations([{ name: 'bare' }])).toStrictEqual([
      'bare: no title, no description, no readOnlyHint or destructiveHint',
    ]);
  });

  it('prints a Markdown table whose cells cannot break it', () => {
    const table = markdownTable([
      {
        name: 'get_financial_context',
        title: 'Financial context',
        kind: 'read',
        destructive: false,
        description: 'The whole picture in one call.',
      },
      {
        name: 'upsert_tag',
        title: 'Tag | name',
        kind: 'write',
        destructive: false,
        description: 'Create or rename a tag.',
      },
    ]);
    const lines = table.split('\n');
    expect(lines[0]).toBe('| Tool | Title | Read or write | Destructive | Description |');
    expect(lines[2]).toContain('`get_financial_context` | Financial context | read | no |');
    expect(lines[3]).toContain('Tag \\| name');
  });

  it('reads a next page, and reports a JSON-RPC error', () => {
    expect(toolsOf({ result: { tools: [{ name: 'a' }], nextCursor: 'next' } })).toStrictEqual({
      tools: [{ name: 'a' }],
      nextCursor: 'next',
    });
    expect(() => toolsOf({ error: { message: 'nope' } })).toThrow(/nope/);
    expect(() => toolsOf({ result: {} })).toThrow(/no result\.tools/);
  });

  it('says what to do when the server answers 401', async () => {
    const unauthorized = await start((_request, response) => {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end('{"error":"unauthorized"}');
    });
    try {
      await expect(listTools({ origin: unauthorized.origin })).rejects.toThrow(/MCP_TOKEN/);
    } finally {
      await unauthorized.close();
    }
  });
});
