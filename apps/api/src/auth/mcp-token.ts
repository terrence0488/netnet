import { HTTPException } from 'hono/http-exception';
import {
  createRemoteJWKSet,
  customFetch,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { publicOrigin } from '../lib/env';
import { isId } from '../lib/ids';
import { auth, type Auth } from './auth';
import { AGENT_SCOPES, CONNECTION_CLAIM, mcpResource } from './oauth';

/**
 * The MCP server's token check (architecture §5.1, §7.6): an agent's access token is a JWT we
 * signed (`typ: at+jwt`), checked here against our JWKS for issuer (the origin), audience (the
 * `/mcp` URL), expiry and scope, with no database lookup. Revocation is `withUser`'s check on the
 * connection, made on every call. A failure is a `401` whose `WWW-Authenticate` points the agent
 * at the protected resource metadata, so it can (re)connect.
 */

/** Who a verified token speaks for. Only these may be handed to `withUser` (CONVENTIONS §3). */
export interface AgentToken {
  userId: string;
  connectionId: string;
  clientId: string;
  /** Its NetNet scopes: `ledger.read`, `ledger.write` or both (§7.4). */
  scopes: string[];
}

export type VerifyAccessToken = (req: Request) => Promise<AgentToken>;

export interface McpTokenDeps {
  /** NetNet's origin: the issuer, and the `/mcp` audience's base. */
  origin: string;
  /** Our signing keys (see `jwksFrom`). */
  jwks: JWTVerifyGetKey;
  /** The clock expiry is judged by; tests fix it. */
  clock: () => Date;
}

/** The signing algorithm of Better Auth's JWT plugin keys (Ed25519). */
const ALGORITHMS = ['EdDSA'];

/** Where the protected resource metadata is (RFC 9728), named in every challenge. */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource`;
}

/**
 * The `401` an agent gets: the RFC 6750 challenge with RFC 9728's `resource_metadata`, and our
 * error body. No `error` attribute when no token was sent, as RFC 6750 §3.1 asks.
 */
export function unauthorized(origin: string, description?: string): HTTPException {
  const attributes = [
    ...(description === undefined
      ? []
      : ['error="invalid_token"', `error_description="${description}"`]),
    `resource_metadata="${resourceMetadataUrl(origin)}"`,
  ];
  const res = new Response(
    JSON.stringify({
      error: {
        code: 'UNAUTHENTICATED',
        message: description ?? 'Connect NetNet in your agent: this needs an access token.',
      },
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer ${attributes.join(', ')}`,
      },
    },
  );
  return new HTTPException(401, { res });
}

/** The bearer token in `req`'s Authorization header, or null when there is none. */
function bearer(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

export function createVerifyAccessToken(deps: () => McpTokenDeps): VerifyAccessToken {
  return async (req) => {
    const { origin, jwks, clock } = deps();
    const token = bearer(req);
    if (token === null) throw unauthorized(origin);
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: origin,
        audience: mcpResource(origin),
        algorithms: ALGORITHMS,
        typ: 'at+jwt',
        requiredClaims: ['sub', 'exp', 'client_id', 'scope'],
        currentDate: clock(),
      }));
    } catch (error) {
      const expired = error instanceof joseErrors.JWTExpired;
      throw unauthorized(
        origin,
        expired ? 'The access token has expired.' : 'The access token is not valid.',
      );
    }
    const userId = payload.sub;
    const connectionId = payload[CONNECTION_CLAIM];
    const clientId = payload.client_id;
    const granted = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
    const scopes = AGENT_SCOPES.filter((scope) => granted.includes(scope));
    if (
      !isId(userId, 'usr') ||
      !isId(connectionId, 'con') ||
      typeof clientId !== 'string' ||
      scopes.length === 0
    ) {
      throw unauthorized(origin, 'The access token is not valid.');
    }
    return { userId, connectionId, clientId, scopes };
  };
}

/**
 * Our JWKS as jose reads it: through Better Auth's own handler in the function (no network hop),
 * one database read per instance, then cached by jose and read again for a key it has not seen.
 */
export function jwksFrom(auth: () => Auth, origin: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${origin}/api/auth/jwks`), {
    [customFetch]: (url: string) => auth().handler(new Request(url)),
  });
}

let shared: { origin: string; jwks: JWTVerifyGetKey } | undefined;

/** The running app's token check. */
export const verifyAccessToken: VerifyAccessToken = createVerifyAccessToken(() => {
  const origin = publicOrigin();
  if (shared?.origin !== origin) shared = { origin, jwks: jwksFrom(auth, origin) };
  return { origin, jwks: shared.jwks, clock: () => new Date() };
});
