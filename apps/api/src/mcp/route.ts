import type { AuthInfo } from '@modelcontextprotocol/server';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { unauthorized } from '../auth/mcp-token';
import { getConnection } from '../db/agent-connections';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { toolContext } from './context';
import { appMcpDeps, type McpDeps } from './deps';
import { createMcpHttpHandler, type McpExtra } from './server';

/**
 * `POST /mcp`: the connector URL agents paste (architecture §7.1, §7.4). Streamable HTTP,
 * stateless: the token is verified, the connection checked, the rate counted, and the request
 * served on its own, on any function instance. `GET` and `DELETE` reach the same gate; the SDK
 * answers them 405 (there are no sessions to keep).
 */

/** MCP: 120 a minute and 5,000 a day per connection (architecture §8). */
export const MCP_PER_MINUTE = 120;
export const MCP_PER_DAY = 5000;

/**
 * An agent's server or a browser-based agent may call from anywhere: the token is a Bearer,
 * never a cookie, so there is nothing for another site to forge (CORS without credentials).
 */
const anyOrigin = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE'],
  allowHeaders: ['Authorization', 'Content-Type', 'MCP-Protocol-Version', 'MCP-Session-Id'],
  maxAge: 86_400,
});

export function mcpRoutes(deps: McpDeps = appMcpDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const handler = createMcpHttpHandler(deps.appVersion);
  routes.use('*', anyOrigin);

  const serve = async (c: Context<AppEnv>): Promise<Response> => {
    // No valid token: 401 with the challenge that points the agent at our metadata (§7.6).
    const token = await deps.verify(c.req.raw);
    // Revoked, or not theirs: the next call is rejected, whatever the token's remaining life.
    const connection = await getConnection(deps.db(), token.userId, token.connectionId);
    if (connection === null || connection.revokedAt !== null) {
      throw unauthorized(
        deps.origin(),
        'This agent connection was revoked. Reconnect NetNet in the agent.',
      );
    }
    try {
      await deps.rateLimit(`mcp:con:${token.connectionId}:min`, MCP_PER_MINUTE, 60);
      await deps.rateLimit(`mcp:con:${token.connectionId}:day`, MCP_PER_DAY, 24 * 60 * 60);
    } catch (error) {
      if (error instanceof AppError && error.code === 'RATE_LIMITED') {
        const retryAfterS =
          typeof error.details?.retry_after_s === 'number' ? error.details.retry_after_s : 60;
        return c.json(
          {
            error: {
              code: error.code,
              message: error.message,
              retry_after_s: retryAfterS,
            },
          },
          429,
          { 'Retry-After': String(retryAfterS) },
        );
      }
      throw error;
    }
    const ctx = await toolContext(
      deps,
      {
        userId: token.userId,
        connectionId: token.connectionId,
        client: connection.client,
        clientName: connection.clientName,
      },
      c.get('requestId'),
      (task) => afterResponse(c, task),
    );
    const header = c.req.header('Authorization') ?? '';
    const authInfo: AuthInfo = {
      token: header.replace(/^Bearer\s+/i, ''),
      clientId: token.clientId,
      scopes: [...token.scopes],
      extra: { ctx, scopes: token.scopes } satisfies McpExtra,
    };
    return handler.fetch(c.req.raw, { authInfo });
  };

  routes.on(['GET', 'POST', 'DELETE'], '/', serve);
  return routes;
}
