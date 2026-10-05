import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { cimd } from '@better-auth/cimd';
import { mcp } from '@better-auth/mcp';
import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import type { BetterAuthPlugin } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { isId } from '../lib/ids';

/**
 * The agents' OAuth 2.1 server (architecture §7.6), as the P1 spike settled it: Better Auth's JWT
 * plugin (our JWKS, issuer = NetNet's origin), `mcp()` from `@better-auth/mcp` (the OAuth provider
 * with `‹origin›/mcp` as its resource and RFC 9728 metadata), and `cimd()` for Client ID Metadata
 * Documents. DCR stays on, unauthenticated and rate-limited (routes), because the "Other agent"
 * guide promises any standard MCP agent can connect.
 *
 * Every connection is a deliberate Allow (§7.6): a consent is looked up under a reference that
 * exists only inside the approval that writes it (`withApproval`), so a remembered one never
 * matches, and the approval deletes it afterwards. That reference is the new connection's id: it
 * rides on the code and the refresh tokens, and every access token carries it as `connection_id`.
 */

/** The web app's approval page: sign-in when needed, then Allow or Cancel (§7.1). */
export const APPROVAL_PAGE = '/app/connect/approve';

/** What an agent may be granted (§7.4). v1's approval grants what was asked. */
export const AGENT_SCOPES = ['ledger.read', 'ledger.write'] as const;

/**
 * What the metadata advertises, and what a request that names no scope gets: the agent scopes and
 * `offline_access`, which asks for a refresh token and grants nothing at `/mcp`.
 */
export const ADVERTISED_SCOPES = [...AGENT_SCOPES, 'offline_access'];

/**
 * OpenID Connect's identity scopes, which some agents ask for as well (OpenAI's Codex asks for
 * `openid profile email`). They are accepted, never refused, but never reveal the person:
 * `openid` gets an ID token that names only the account's opaque id, and `profile` and `email`
 * are dropped before the library sees the request, so no name or email is ever released.
 */
export const DROPPED_SCOPES = ['profile', 'email'];

/** Every scope the library accepts, in a registration or a request. */
export const OAUTH_SCOPES = [...ADVERTISED_SCOPES, 'openid', ...DROPPED_SCOPES];

/**
 * The scope NetNet passes on for an agent's `requested` one: none named gets
 * `ADVERTISED_SCOPES`; otherwise `profile` and `email` are dropped, and a request that names none
 * of the agent scopes gets both, since the person's Allow on the approval page is the consent and
 * a connection without them could do nothing. Anything else is passed on as it is, so a scope
 * NetNet does not know is still refused.
 */
export function agentScope(requested: string | null): string {
  if (requested === null) return ADVERTISED_SCOPES.join(' ');
  const scopes = [...new Set(requested.split(' ').filter((s) => s !== ''))].filter(
    (s) => !DROPPED_SCOPES.includes(s),
  );
  const agent: readonly string[] = AGENT_SCOPES;
  if (!scopes.some((s) => agent.includes(s))) scopes.unshift(...AGENT_SCOPES);
  return scopes.join(' ');
}

/** Access tokens last an hour (§7.6). */
export const ACCESS_TOKEN_S = 60 * 60;
/** Refresh tokens last 90 days; each rotation starts the 90 again. */
export const REFRESH_TOKEN_S = 90 * 24 * 60 * 60;
/** Authorization codes, and the signed query the approval page works from, last 10 minutes. */
export const CODE_S = 10 * 60;
/** A CIMD document is trusted for at most a day before it is fetched again (§7.6). */
export const CIMD_CACHE_S = 24 * 60 * 60;

/** The access token claim that names the agent connection. */
export const CONNECTION_CLAIM = 'connection_id';

/** The resource agents' tokens are for: the connector URL people paste (§7.6). */
export function mcpResource(origin: string): string {
  return `${origin}/mcp`;
}

/**
 * How codes and tokens are stored: their SHA-256, never the value. Ours rather than the library's
 * default, so the token route can find a code's grant before it is exchanged.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

const approvals = new AsyncLocalStorage<{ connectionId: string }>();

/** Runs `fn` (the library's consent) as the approval that makes connection `connectionId`. */
export function withApproval<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
  return approvals.run({ connectionId }, fn);
}

/**
 * The consent reference for the request under way: the connection being approved, or, anywhere
 * else, a value no consent was ever stored under, so the approval page is always shown.
 */
function consentReference(): string {
  return approvals.getStore()?.connectionId ?? `unapproved_${randomBytes(12).toString('hex')}`;
}

export interface OAuthPluginOptions {
  /** NetNet's origin: the issuer, and the resource's base. */
  origin: string;
  /**
   * Fetches a CIMD document: HTTPS to public addresses only, resolved once and pinned, no
   * redirects (`@better-auth/cimd/node`); tests pass a local fake. The plugin itself adds the
   * 5 KB and 5 s limits.
   */
  fetchClientMetadata: ClientMetadataResourceFetch;
}

export function oauthPlugins(options: OAuthPluginOptions): BetterAuthPlugin[] {
  const { origin } = options;
  return [
    jwt({ jwt: { issuer: origin }, disableSettingJwtHeader: true }),
    // Under exactOptionalPropertyTypes the provider's endpoint types (an openapi field typed
    // `items?: undefined`) do not match BetterAuthPlugin; without the flag it checks (spike Q1).
    mcp({
      resource: mcpResource(origin),
      loginPage: APPROVAL_PAGE,
      consentPage: APPROVAL_PAGE,
      scopes: OAUTH_SCOPES,
      grantTypes: ['authorization_code', 'refresh_token'],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      accessTokenExpiresIn: ACCESS_TOKEN_S,
      refreshTokenExpiresIn: REFRESH_TOKEN_S,
      codeExpiresIn: CODE_S,
      storeTokens: { hash: (token) => hashToken(token) },
      postLogin: {
        page: APPROVAL_PAGE,
        shouldRedirect: () => false,
        consentReferenceId: () => consentReference(),
      },
      customAccessTokenClaims: ({ referenceId }) =>
        isId(referenceId, 'con') ? { [CONNECTION_CLAIM]: referenceId } : {},
    }) as unknown as BetterAuthPlugin,
    cimd({
      fetchClientMetadataResource: options.fetchClientMetadata,
      metadataProfile: 'mcp-2026-07-28',
      metadataRevalidationInterval: CIMD_CACHE_S,
    }),
  ];
}
