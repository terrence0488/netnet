import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { deleteConnection, deleteConsents, insertConnection } from '../db/agent-connections';
import { findOAuthClient, type OAuthClientView } from '../db/oauth';
import { AppError } from '../lib/errors';
import { newId } from '../lib/ids';
import { cleanAgentName, SHOWN_NAME_LENGTH } from './agent-name';
import type { AgentDeps, Attempts } from './attempts';
import type { Auth } from './auth';
import {
  classify,
  classifyingHost,
  type Client,
  type LoadGuideHosts,
  type Registration,
} from './classify';
import type { Connections } from './connections';
import { withApproval } from './oauth';

/**
 * The approval page's API (architecture §7.6; the page is the web app's, `/app/connect/approve`).
 * Better Auth's OAuth provider sends the browser there with a signed copy of the agent's request
 * (`?client_id=…&scope=…&exp=…&sig=…`); the page passes that query back here. Reading it shows
 * who is asking and for what; Allow makes the connection, classified, and lets the library issue
 * the code; Cancel tells the agent no. Both answer with the URL the browser goes to next.
 *
 * Only a signed-in person with a verified email gets this far (the routes check), and only for a
 * request NetNet signed in the last 10 minutes.
 */

/** `GET /api/agent/approval?‹the page's query›`. */
export interface ApprovalView {
  /** The name the agent registered with: untrusted, cleaned and cut; the page escapes it. */
  clientName: string;
  registration: Registration;
  /** False for a DCR client: the page says NetNet cannot verify the name. */
  nameVerified: boolean;
  /** The classification its connection will get. */
  client: Client;
  /** The CIMD URL's host, or for DCR the host it returns to: what the name is checked against. */
  host: string | null;
  scopes: string[];
}

/** `POST /api/agent/approval`: where the browser goes now, the agent's own page. */
export interface ApprovalResult {
  url: string;
}

export interface ApprovalDeps extends AgentDeps {
  auth: () => Auth;
  /** NetNet's origin, which the approval page is on. */
  origin: () => string;
  guides: LoadGuideHosts;
  attempts: Attempts;
  connections: Connections;
}

/** Who is deciding: the verified session's user, and the request's headers (its cookie). */
export interface Approver {
  userId: string;
  headers: Headers;
}

export interface Approval {
  read(who: Approver, query: string): Promise<ApprovalView>;
  decide(who: Approver, decision: { accept: boolean; query: string }): Promise<ApprovalResult>;
}

/** The parameter that lists which query parameters the signature covers. */
const SIGNED_NAMES = 'ba_param';

/**
 * The signed part of the page's query, as Better Auth's own client builds it: `sig`, the list of
 * signed names and those parameters, so anything else in the page's URL is left out.
 */
export function signedQuery(query: string): string | null {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const names = new Set(params.getAll(SIGNED_NAMES));
  if (!params.has('sig') || names.size === 0) return null;
  const signed = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === 'sig' || key === SIGNED_NAMES || names.has(key)) signed.append(key, value);
  }
  return signed.toString();
}

function expired(): AppError {
  return new AppError(
    'VALIDATION_FAILED',
    'This approval link has expired or is not valid. Go back to your agent and connect again.',
    { fields: { query: 'Send the approval page’s query as NetNet signed it, within 10 minutes.' } },
  );
}

interface Pending {
  signed: string;
  params: URLSearchParams;
  client: OAuthClientView;
  registration: Registration;
  host: string | null;
  classification: Client;
}

export function createApproval(deps: ApprovalDeps): Approval {
  /** The agent's request behind the page's query, once its signature and expiry check out. */
  const pending = async (query: string): Promise<Pending> => {
    const signed = signedQuery(query);
    if (signed === null) throw expired();
    const { secret } = await deps.auth().$context;
    if (!(await verifyOAuthQueryParams(signed, secret))) throw expired();
    const params = new URLSearchParams(signed);
    const clientId = params.get('client_id') ?? '';
    const client = clientId === '' ? null : await findOAuthClient(deps.db(), clientId);
    if (!client || client.disabled) throw expired();
    const registration: Registration = client.clientDiscoveryId === 'cimd' ? 'cimd' : 'dcr';
    const host = classifyingHost(registration, clientId, params.get('redirect_uri') ?? '');
    return {
      signed,
      params,
      client,
      registration,
      host,
      classification: classify(host, await deps.guides()),
    };
  };

  /**
   * Whether the agent asked for a fresh sign-in (`prompt=login`, or `max_age`) that this session
   * does not satisfy: the page has the person sign in again first.
   */
  const requireFreshEnough = async (who: Approver, params: URLSearchParams): Promise<void> => {
    const login = (params.get('prompt') ?? '').split(' ').includes('login');
    const maxAge = params.get('max_age');
    if (!login && maxAge === null) return;
    const session = await deps.auth().api.getSession({ headers: who.headers });
    const signedInAt = session ? new Date(session.session.createdAt).getTime() : 0;
    const issuedAt = Number(params.get('ba_iat'));
    const stale =
      (login && !(Number.isFinite(issuedAt) && signedInAt >= issuedAt)) ||
      (maxAge !== null && Date.now() - signedInAt > Number(maxAge) * 1000);
    if (stale) {
      throw new AppError('REAUTH_REQUIRED', 'Sign in again: the agent asked for a fresh sign-in.');
    }
  };

  /** The library's consent: the URL it sends the browser to, with a code or with the refusal. */
  const consent = async (who: Approver, signed: string, accept: boolean): Promise<string> => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: deps.origin(),
    });
    const cookie = who.headers.get('Cookie');
    if (cookie !== null) headers.set('Cookie', cookie);
    const response = await deps.auth().handler(
      new Request(`${deps.origin()}/api/auth/oauth2/consent`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ accept, oauth_query: signed }),
      }),
    );
    const body = (await response.json().catch(() => null)) as { url?: unknown } | null;
    if (!response.ok || typeof body?.url !== 'string') throw expired();
    return body.url;
  };

  return {
    async read(who, query) {
      const p = await pending(query);
      await requireFreshEnough(who, p.params);
      await deps.attempts.authorizeSeen(who.userId);
      return {
        clientName: cleanAgentName(p.client.name, SHOWN_NAME_LENGTH),
        registration: p.registration,
        nameVerified: p.registration === 'cimd',
        client: p.classification,
        host: p.host,
        scopes: (p.params.get('scope') ?? '').split(' ').filter((s) => s !== ''),
      };
    },

    async decide(who, { accept, query }) {
      const p = await pending(query);
      if (!accept) {
        const url = await consent(who, p.signed, false);
        await deps.attempts.cancelled(who.userId, p.classification);
        return { url };
      }

      await requireFreshEnough(who, p.params);
      const db = deps.db();
      const at = deps.clock();
      const connectionId = newId('con', at.getTime());
      await insertConnection(db, {
        id: connectionId,
        userId: who.userId,
        clientId: p.client.clientId,
        clientName: p.client.name ?? '',
        registration: p.registration,
        client: p.classification,
        createdAt: at,
      });
      let url: string;
      try {
        url = await withApproval(connectionId, () => consent(who, p.signed, true));
      } catch (error) {
        await deleteConnection(db, who.userId, connectionId);
        throw error;
      } finally {
        // The consent was for this approval only: a remembered one is never used (§7.6).
        await deleteConsents(db, who.userId, connectionId);
      }
      const redirectUri = p.params.get('redirect_uri') ?? '';
      const granted = new URL(url, deps.origin());
      if (!url.startsWith(redirectUri) || !granted.searchParams.has('code')) {
        await deleteConnection(db, who.userId, connectionId);
        if (granted.searchParams.has('error')) {
          await deps.attempts.authorizeRefused(who.userId);
          return { url };
        }
        throw expired();
      }

      const entry = await deps.attempts.approved(who.userId, connectionId, p.classification);
      deps.background(
        deps.track(
          'agent_connection_completed',
          { client: p.classification, entry },
          { userId: who.userId, appVersion: deps.appVersion() },
        ),
      );
      deps.background(deps.connections.sendSecurityEmail(connectionId));
      return { url };
    },
  };
}
