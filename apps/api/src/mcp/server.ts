import {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  createMcpHandler,
  type AuthInfo,
  type CallToolResult,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import type { ErrorCode } from '@netnet/contracts';
import { parseInput } from '../ledger/input';
import type { ToolCtx } from './context';
import { scopeRequired, toMcpError } from './errors';
import { trackToolCalled } from './events';
import { TOOL_REGISTRY } from './registry';
import type { ToolDef } from './tool';

/**
 * The MCP server (architecture §3, §7.4): the official SDK's `McpServer`, stateless, negotiating
 * three protocol versions, with P1's sixteen tools. `tools/list` and the handshake are the SDK's;
 * `tools/call` is overridden below (public API), so a malformed call fails like every other
 * error — `isError` with `structuredContent.error {code, message, fields?}` — and every call
 * fires `agent_tool_called`, instead of the SDK's text-only error with no event.
 */

/** The protocol versions the server negotiates. */
export const PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18'];

export const SERVER_NAME = 'netnet';
export const SERVER_TITLE = 'NetNet';

/** The server instructions (§7.4): a few lines. Never user data. */
export const SERVER_INSTRUCTIONS =
  'Call get_financial_context first for any question about the position. ' +
  'NetNet states facts and uncertainty, and advice is yours. ' +
  'Look for an existing holding before creating one. ' +
  'For a setup conversation, ask what get_setup_guide asks.';

const byName = new Map<string, ToolDef>(TOOL_REGISTRY.map((tool) => [tool.name, tool]));

/**
 * One `tools/call`: the scope, the parsed arguments, the tool, and the checked output — or the
 * failure it answers with. Never throws: anything unexpected is INTERNAL with the request id.
 * After it runs: `agent_tool_called`, and on success the connection's touch and `live`.
 */
export async function callTool(
  ctx: ToolCtx,
  scopes: readonly string[],
  tool: ToolDef,
  args: unknown,
): Promise<CallToolResult> {
  const started = ctx.deps.clock().getTime();
  let outcome: 'ok' | ErrorCode = 'ok';
  try {
    if (!scopes.includes(tool.scope)) throw scopeRequired(tool.scope);
    const output = await tool.run(ctx, parseInput(tool.inputSchema, args ?? {}));
    const checked = tool.outputSchema.safeParse(output);
    if (!checked.success) {
      throw new Error(
        `tool ${tool.name} answered what its output schema does not allow: ` +
          checked.error.issues
            .map((i) => `${i.path.join('.') || '(output)'}: ${i.code}`)
            .join('; '),
      );
    }
    return {
      content: [{ type: 'text', text: tool.text(output) }],
      structuredContent: output as Record<string, unknown>,
    };
  } catch (error) {
    const failed = toMcpError(error, tool.renames, ctx.requestId, tool.name);
    outcome = failed.code;
    return {
      content: [{ type: 'text', text: failed.body.error.message }],
      isError: true,
      structuredContent: failed.body,
    };
  } finally {
    const latencyMs = ctx.deps.clock().getTime() - started;
    trackToolCalled(ctx, {
      tool: tool.name,
      kind: tool.kind,
      outcome,
      latencyMs,
      client: ctx.client,
    });
    if (outcome === 'ok') {
      ctx.background(
        ctx.deps
          .touch(ctx.connectionId)
          .then(() => ctx.deps.markLive(ctx.userId, ctx.connectionId))
          .then(() => undefined),
      );
    }
    // P3 (J12) HOOK: touchChecked(userId) runs here — see McpDeps. tools/call only: tools/list
    // and the handshake never reach this wrapper.
    ctx.background(ctx.deps.touchChecked(ctx.userId));
  }
}

/** What the route hands the per-request server factory: the request's context and scopes. */
export interface McpExtra extends Record<string, unknown> {
  ctx: ToolCtx;
  scopes: readonly string[];
}

/** One request's server: the sixteen tools over its context, on the three versions. */
export function createMcpServer(extra: McpExtra, version: string): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version, title: SERVER_TITLE },
    { instructions: SERVER_INSTRUCTIONS, supportedProtocolVersions: [...PROTOCOL_VERSIONS] },
  );
  for (const tool of TOOL_REGISTRY) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
      },
      async (args: unknown) => callTool(extra.ctx, extra.scopes, tool, args),
    );
  }
  // The override: the same wrapper, so a malformed call is our error, with our event.
  server.server.setRequestHandler('tools/call', async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Tool ${request.params.name} not found`,
      );
    }
    return callTool(extra.ctx, extra.scopes, tool, request.params.arguments);
  });
  return server;
}

/**
 * The stateless Streamable HTTP handler: a fresh server per request, 2026-07-28 on the modern
 * path, 2025-era traffic through the SDK's stateless fallback, GET and DELETE answered 405.
 */
export function createMcpHttpHandler(version: () => string): McpHttpHandler {
  return createMcpHandler(
    ({ authInfo }: { authInfo?: AuthInfo }) => {
      const extra = authInfo?.extra as McpExtra | undefined;
      if (!extra) throw new Error('MCP request reached the server without its context');
      return createMcpServer(extra, version());
    },
    { legacy: 'stateless' },
  );
}
