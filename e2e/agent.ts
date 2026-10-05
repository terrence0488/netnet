/// <reference lib="dom" />
/**
 * A fake agent for the connect specs: it plays an MCP client against the real server (discovery,
 * DCR, the authorize URL the person's browser opens, the code exchange), the way agent-connect
 * does, while the specs drive the person's side through the web app. All data is fictional.
 */
import { createHash, randomBytes } from 'node:crypto';
import { withClient } from '@netnet/api/db/client';
import type { APIRequestContext } from '@playwright/test';

/** Where the fake agent returns to: a loopback address, as a native app does. */
export const FAKE_AGENT_CALLBACK = 'http://127.0.0.1:43123/callback';

/** The OAuth server as the fake agent discovers it, from the resource it connects to. */
export interface FakeAgentServer {
  readonly issuer: string;
  readonly resource: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly registrationEndpoint: string;
}

/** Discovers the server from `/.well-known/*`, as an MCP client does. */
export async function discoverServer(request: APIRequestContext): Promise<FakeAgentServer> {
  const resource = (await (await request.get('/.well-known/oauth-protected-resource')).json()) as {
    resource: string;
    authorization_servers: string[];
  };
  const metadata = (await (
    await request.get('/.well-known/oauth-authorization-server')
  ).json()) as Record<string, string>;
  return {
    issuer: metadata['issuer'] ?? '',
    resource: resource.resource,
    authorizationEndpoint: metadata['authorization_endpoint'] ?? '',
    tokenEndpoint: metadata['token_endpoint'] ?? '',
    registrationEndpoint: metadata['registration_endpoint'] ?? '',
  };
}

/** The fake agent's side of one connection: its registration, PKCE and state. */
export interface FakeAgent {
  readonly name: string;
  readonly clientId: string;
  readonly callback: string;
  readonly verifier: string;
  readonly state: string;
}

/**
 * Registers the fake agent by DCR, from its own address (rate limits are per IP). Returns what
 * the authorize URL and the code exchange need.
 */
export async function registerFakeAgent(
  request: APIRequestContext,
  server: FakeAgentServer,
  options: { name?: string; ip?: string } = {},
): Promise<FakeAgent> {
  const name = options.name ?? 'Fictional E2E agent';
  const ip = options.ip ?? `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
  const verifier = randomBytes(32).toString('base64url');
  const registered = await request.post(server.registrationEndpoint, {
    headers: { 'x-real-ip': ip },
    data: {
      client_name: name,
      redirect_uris: [FAKE_AGENT_CALLBACK],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    },
  });
  if (registered.status() !== 201) {
    throw new Error(`The fake agent could not register: ${registered.status()}.`);
  }
  const { client_id: clientId } = (await registered.json()) as { client_id: string };
  return {
    name,
    clientId,
    callback: FAKE_AGENT_CALLBACK,
    verifier,
    state: randomBytes(8).toString('hex'),
  };
}

/** The authorize URL the person's browser opens to approve the fake agent. */
export function authorizeUrl(
  agent: FakeAgent,
  server: FakeAgentServer,
  scope = 'ledger.read ledger.write offline_access',
): string {
  const challenge = createHash('sha256').update(agent.verifier).digest('base64url');
  const url = new URL(server.authorizationEndpoint);
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: agent.clientId,
    redirect_uri: agent.callback,
    scope,
    state: agent.state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: server.resource,
  })) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Exchanges the code the approval sent back for the fake agent's tokens. */
export async function exchangeCode(
  request: APIRequestContext,
  agent: FakeAgent,
  server: FakeAgentServer,
  code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const token = await request.post(server.tokenEndpoint, {
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: agent.callback,
      client_id: agent.clientId,
      code_verifier: agent.verifier,
      resource: server.resource,
    },
  });
  if (token.status() !== 200) {
    throw new Error(`The fake agent could not exchange the code: ${token.status()}.`);
  }
  const { access_token: accessToken, refresh_token: refreshToken } = (await token.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { accessToken, refreshToken };
}

/** The analytics events the server recorded for an account, oldest first. */
export async function eventsFor(email: string): Promise<{ name: string; props: unknown }[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('The agent specs read the local database: set DATABASE_URL.');
  return withClient(url, async (client) => {
    const rows = (
      await client.query(
        `select e.name, e.props from analytics.event e
           join core.user u on u.id = e.user_id
          where u.email = $1 order by e.id`,
        [email],
      )
    ).rows as { name: string; props: unknown }[];
    return rows;
  });
}
