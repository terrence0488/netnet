import { createHash, randomBytes } from 'node:crypto';
import { expect } from 'vitest';
import type { TestDatabase } from '../isolation/harness';
import { Browser, ORIGIN, type AccountsApp } from './accounts-app';
import { metadataDocument } from './cimd-server';

/**
 * A scripted MCP agent: what Claude's or another agent's servers do against NetNet's OAuth server
 * (discovery, registration by CIMD or DCR, authorization code with PKCE, token, refresh, revoke),
 * with the person's browser doing the approval. Requests from the agent's servers carry no cookie
 * and no Origin.
 */

export const MCP_URL = `${ORIGIN}/mcp`;

export interface Person {
  browser: Browser;
  userId: string;
  email: string;
}

let people = 0;

/**
 * A fictional person signed up in their browser, their email verified unless `verified: false`.
 * Each signs up from an address of their own, so sign-up's limit per IP never gets in the way.
 */
export async function signUpPerson(
  target: AccountsApp,
  db: TestDatabase,
  email: string,
  { verified = true, timeZone = 'Asia/Singapore' } = {},
): Promise<Person> {
  people += 1;
  const browser = new Browser(target, `198.18.${Math.floor(people / 250)}.${(people % 250) + 1}`);
  expect((await browser.signUp(email, 'correct horse', { timeZone })).status).toBe(200);
  await target.settle();
  if (verified) {
    await db.owner.query('update core.user set email_verified = true where email = $1', [email]);
  }
  const { rows } = await db.owner.query<{ id: string }>(
    'select id from core.user where email = $1',
    [email],
  );
  return { browser, userId: rows[0]?.id ?? '', email };
}

export interface TokenResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface Authorized {
  code: string;
  state: string | null;
  iss: string | null;
  verifier: string;
}

export interface AuthorizeOptions {
  /** `null` leaves it out. Default: the MCP URL. */
  resource?: string | null;
  /** `null` sends no PKCE. Default: S256. */
  method?: 'S256' | 'plain' | null;
  scope?: string;
  redirectUri?: string;
  prompt?: string;
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** A DCR registration from the agent's server at `ip`: the status and the body. */
export async function registration(
  target: AccountsApp,
  { name, redirectUri }: { name: string | undefined; redirectUri: string },
  ip = '198.51.100.7',
): Promise<TokenResponse> {
  const res = await target.app.request(`${ORIGIN}/api/auth/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({
      ...(name === undefined ? {} : { client_name: name }),
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

export class AgentClient {
  constructor(
    private readonly target: AccountsApp,
    readonly clientId: string,
    readonly redirectUri: string,
  ) {}

  /** A client registered by DCR (RFC 7591), as a public client. */
  static async register(
    target: AccountsApp,
    name: string | undefined,
    redirectUri = 'https://agent.example/oauth/callback',
    ip = '198.51.100.7',
  ): Promise<AgentClient> {
    const res = await registration(target, { name, redirectUri }, ip);
    if (res.status !== 201)
      throw new Error(`DCR failed: ${res.status} ${JSON.stringify(res.body)}`);
    return new AgentClient(target, String(res.body.client_id), redirectUri);
  }

  /** A client identified by its CIMD URL, whose document the fake server hosts. */
  static cimd(
    target: AccountsApp,
    clientId: string,
    name: string,
    redirectUri = 'https://claude.ai/api/mcp/auth_callback',
  ): AgentClient {
    target.cimd.serve(clientId, metadataDocument(clientId, name, [redirectUri]));
    return new AgentClient(target, clientId, redirectUri);
  }

  /** The authorize URL for a fresh PKCE pair. */
  authorizeUrl(options: AuthorizeOptions = {}): { url: string; verifier: string; state: string } {
    const { verifier, challenge } = pkce();
    const state = randomBytes(8).toString('hex');
    const url = new URL(`${ORIGIN}/api/auth/oauth2/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', options.redirectUri ?? this.redirectUri);
    url.searchParams.set('scope', options.scope ?? 'ledger.read ledger.write offline_access');
    url.searchParams.set('state', state);
    if (options.prompt !== undefined) url.searchParams.set('prompt', options.prompt);
    if (options.method !== null) {
      url.searchParams.set('code_challenge', options.method === 'plain' ? verifier : challenge);
      url.searchParams.set('code_challenge_method', options.method ?? 'S256');
    }
    if (options.resource !== null) url.searchParams.set('resource', options.resource ?? MCP_URL);
    return { url: url.toString(), verifier, state };
  }

  /**
   * The person's browser opens the authorize URL: the redirect it gets (to the approval page, or
   * back to the agent with an error).
   */
  async authorize(
    browser: Browser,
    options: AuthorizeOptions = {},
  ): Promise<{ status: number; location: URL; verifier: string; state: string }> {
    const { url, verifier, state } = this.authorizeUrl(options);
    const res = await browser.send(url.slice(ORIGIN.length));
    const location = new URL(res.headers.get('Location') ?? '/', ORIGIN);
    return { status: res.status, location, verifier, state };
  }

  /** Authorize, then the person reads the approval page and presses Allow (or Cancel). */
  async approve(
    browser: Browser,
    options: AuthorizeOptions & { accept?: boolean } = {},
  ): Promise<{ result: Response; url: URL; verifier: string; state: string; query: string }> {
    const { location, verifier, state } = await this.authorize(browser, options);
    if (location.pathname !== '/app/connect/approve') {
      throw new Error(`authorize did not reach the approval page: ${location.toString()}`);
    }
    const query = location.search.slice(1);
    const read = await browser.send(`/api/agent/approval?${query}`);
    if (read.status !== 200) throw new Error(`approval read: ${read.status} ${await read.text()}`);
    const result = await browser.send('/api/agent/approval', {
      json: { accept: options.accept ?? true, query },
    });
    const body = (await result.clone().json()) as { url?: string };
    return { result, url: new URL(body.url ?? '/', ORIGIN), verifier, state, query };
  }

  /** The whole connect: the code, its `state` and `iss`, and the verifier for the exchange. */
  async connect(browser: Browser, options: AuthorizeOptions = {}): Promise<Authorized> {
    const { url, verifier, state } = await this.approve(browser, options);
    const code = url.searchParams.get('code');
    if (code === null) throw new Error(`no code: ${url.toString()}`);
    if (url.searchParams.get('state') !== state) throw new Error('state mismatch');
    return { code, state, iss: url.searchParams.get('iss'), verifier };
  }

  async token(params: Record<string, string>): Promise<TokenResponse> {
    const res = await this.target.app.request(`${ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
    });
    await this.target.settle();
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  exchange(code: string, verifier: string, extra: Record<string, string> = {}) {
    return this.token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: verifier,
      resource: MCP_URL,
      ...extra,
    });
  }

  refresh(refreshToken: string) {
    return this.token({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
      resource: MCP_URL,
    });
  }

  async revoke(token: string, hint: 'access_token' | 'refresh_token'): Promise<number> {
    const res = await this.target.app.request(`${ORIGIN}/api/auth/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        token_type_hint: hint,
        client_id: this.clientId,
      }).toString(),
    });
    return res.status;
  }
}
