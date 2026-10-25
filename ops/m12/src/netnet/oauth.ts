import { createHash, randomBytes } from 'node:crypto';

/**
 * The MCP client's side of a real connection (P4-T9): what a native agent does against NetNet's
 * server, driven from Node instead of a browser. Discovery from the resource's metadata, DCR to
 * register, PKCE, the approval API with the account's session (the page's own calls), the code
 * exchange, and a bearer token for `/mcp`. All data is fictional; the account is made on the
 * scratch database and never reaches a real environment.
 */

/** The agent's loopback callback, as a native app returns to. Nothing listens on it. */
export const CALLBACK = 'http://127.0.0.1:43123/callback';

/** OAuth server metadata, as the resource's discovery document names it. */
export interface OAuthServer {
  readonly issuer: string;
  readonly resource: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly registrationEndpoint: string;
}

/** The person's session: the cookie Better Auth set at sign-up. */
export interface Session {
  readonly cookie: string;
}

/** The agent's registration and PKCE verifier. */
export interface Registration {
  readonly clientId: string;
  readonly verifier: string;
  readonly state: string;
}

const json = async <T>(response: Response, what: string): Promise<T> => {
  if (!response.ok) {
    throw new Error(`${what} failed: ${response.status} ${response.statusText}.`);
  }
  return (await response.json()) as T;
};

/** The server's metadata, from `/.well-known/*`, as an MCP client discovers it. */
export async function discover(origin: string): Promise<OAuthServer> {
  const resource = await json<{ resource: string; authorization_servers: string[] }>(
    await fetch(`${origin}/.well-known/oauth-protected-resource`),
    'The protected-resource metadata',
  );
  const metadata = await json<Record<string, string>>(
    await fetch(`${origin}/.well-known/oauth-authorization-server`),
    'The authorization-server metadata',
  );
  const server: OAuthServer = {
    issuer: metadata['issuer'] ?? '',
    resource: resource.resource,
    authorizationEndpoint: metadata['authorization_endpoint'] ?? '',
    tokenEndpoint: metadata['token_endpoint'] ?? '',
    registrationEndpoint: metadata['registration_endpoint'] ?? '',
  };
  if (
    server.authorizationEndpoint === '' ||
    server.tokenEndpoint === '' ||
    server.registrationEndpoint === '' ||
    server.resource === ''
  ) {
    throw new Error('The server’s metadata is missing an endpoint or the resource.');
  }
  return server;
}

/**
 * A verified account on the scratch app, made the way the web app makes one: sign-up with an
 * email, a password and a time zone. The harness verifies the address directly in the scratch
 * database afterwards, as the E2E specs do, because there is no inbox to open.
 */
export async function signUp(options: {
  origin: string;
  email: string;
  password: string;
  timeZone: string;
  ip: string;
}): Promise<Session> {
  const response = await fetch(`${options.origin}/api/auth/sign-up/email`, {
    method: 'POST',
    // Better Auth refuses a state-changing request with no Origin ("MISSING_OR_NULL_ORIGIN"),
    // exactly as a browser would send it: the app's own.
    headers: {
      'Content-Type': 'application/json',
      'x-real-ip': options.ip,
      Origin: options.origin,
    },
    body: JSON.stringify({
      email: options.email,
      password: options.password,
      timeZone: options.timeZone,
    }),
  });
  if (!response.ok) {
    throw new Error(`Sign-up failed: ${response.status} ${response.statusText}.`);
  }
  const cookies = response.headers.getSetCookie?.() ?? [];
  const cookie = cookies
    .map((value) => value.split(';')[0] ?? '')
    .filter((value) => value.includes('='))
    .join('; ');
  if (cookie === '') throw new Error('Sign-up answered without a session cookie.');
  return { cookie };
}

/** Registers the harness as an agent by DCR, returning its client id and PKCE verifier. */
export async function register(
  server: OAuthServer,
  options: { name: string; ip: string },
): Promise<Registration> {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(8).toString('hex');
  const response = await fetch(server.registrationEndpoint, {
    method: 'POST',
    // As the E2E suites register: DCR is cookieless and outside the origin check, like token.
    headers: { 'Content-Type': 'application/json', 'x-real-ip': options.ip },
    body: JSON.stringify({
      client_name: options.name,
      redirect_uris: [CALLBACK],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    }),
  });
  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.status} ${response.statusText}.`);
  }
  const body = (await response.json()) as { client_id?: unknown };
  if (typeof body.client_id !== 'string') throw new Error('Registration answered no client id.');
  return { clientId: body.client_id, verifier, state };
}

/** The authorize URL the person's browser would open. */
export function authorizeUrl(server: OAuthServer, registration: Registration): string {
  const challenge = createHash('sha256').update(registration.verifier).digest('base64url');
  const url = new URL(server.authorizationEndpoint);
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: registration.clientId,
    redirect_uri: CALLBACK,
    scope: 'ledger.read ledger.write offline_access',
    state: registration.state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: server.resource,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/** The approval page's signed query, from the authorize redirect's `Location`. */
export async function approvalQuery(
  origin: string,
  authorizeAt: string,
  session: Session,
): Promise<string> {
  const response = await fetch(authorizeAt, {
    redirect: 'manual',
    headers: { Cookie: session.cookie },
  });
  const location = response.headers.get('location');
  if (location === null) {
    throw new Error(`The authorize URL did not redirect: ${response.status}.`);
  }
  const url = new URL(location, origin);
  if (url.pathname !== '/app/connect/approve' || url.search === '') {
    throw new Error(`The authorize URL redirected to ${url.pathname}, not the approval page.`);
  }
  return url.search.slice(1);
}

/** The approval page's two calls, as its own script makes them: read, then Allow. */
export async function approve(
  origin: string,
  session: Session,
  query: string,
): Promise<{ clientName: string; scopes: string[]; code: string }> {
  const read = await json<{ clientName: string; scopes: string[] }>(
    await fetch(`${origin}/api/agent/approval?${query}`, { headers: { Cookie: session.cookie } }),
    'Reading the approval',
  );
  const decided = await json<{ url: string }>(
    await fetch(`${origin}/api/agent/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session.cookie, Origin: origin },
      body: JSON.stringify({ accept: true, query }),
    }),
    'Approving the agent',
  );
  const callback = new URL(decided.url);
  const code = callback.searchParams.get('code');
  if (code === null) throw new Error('The approval answered without a code.');
  return { clientName: read.clientName, scopes: read.scopes, code };
}

/** The code exchanged for the agent's bearer token, as the agent's server does it. */
export async function exchange(
  server: OAuthServer,
  registration: Registration,
  code: string,
): Promise<string> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CALLBACK,
    client_id: registration.clientId,
    code_verifier: registration.verifier,
    resource: server.resource,
  });
  const response = await fetch(server.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await json<{ access_token?: unknown }>(response, 'The code exchange');
  if (typeof body.access_token !== 'string')
    throw new Error('The code exchange had no access token.');
  return body.access_token;
}
