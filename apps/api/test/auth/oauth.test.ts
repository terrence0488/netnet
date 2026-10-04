import { decodeJwt, decodeProtectedHeader } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createVerifyAccessToken,
  jwksFrom,
  type VerifyAccessToken,
} from '../../src/auth/mcp-token';
import { REGISTRATIONS_PER_HOUR } from '../../src/auth/oauth-routes';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';
import {
  AgentClient,
  MCP_URL,
  registration,
  signUpPerson,
  type Person,
} from '../support/oauth-client';

/**
 * The agents' OAuth server end to end (architecture §7.6), as an MCP agent's servers and the
 * person's browser drive it: discovery, registration by CIMD (from a local fake metadata server)
 * and by DCR, authorization code with PKCE, the approval, the token, refresh rotation and
 * revocation; and the rules around them.
 */
let db: TestDatabase;
let target: AccountsApp;
let verify: VerifyAccessToken;
let person: Person;

const CLAUDE = 'https://claude.ai/oauth/mcp-oauth-client-metadata';

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
  verify = createVerifyAccessToken(() => ({
    origin: ORIGIN,
    jwks: jwksFrom(() => target.auth, ORIGIN),
    clock: () => new Date(),
  }));
  person = await signUpPerson(target, db, 'oauth-person@example.com');
}, 60_000);

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db?.close();
});

async function json(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await target.app.request(`${ORIGIN}${path}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function bearer(token: unknown): Request {
  return new Request(MCP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(token)}` },
  });
}

describe('discovery', () => {
  it('serves the protected resource metadata for /mcp, at both paths (RFC 9728)', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      const { status, body } = await json(path);
      expect(status).toBe(200);
      expect(body).toMatchObject({
        resource: MCP_URL,
        authorization_servers: [ORIGIN],
        scopes_supported: ['ledger.read', 'ledger.write'],
      });
    }
  });

  it('serves the authorization server metadata (RFC 8414) at the library’s own paths', async () => {
    const { status, body } = await json('/.well-known/oauth-authorization-server');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/api/auth/oauth2/authorize`,
      token_endpoint: `${ORIGIN}/api/auth/oauth2/token`,
      registration_endpoint: `${ORIGIN}/api/auth/oauth2/register`,
      revocation_endpoint: `${ORIGIN}/api/auth/oauth2/revoke`,
      jwks_uri: `${ORIGIN}/api/auth/jwks`,
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      scopes_supported: ['ledger.read', 'ledger.write', 'offline_access'],
    });
    // Claude picks CIMD only when "none" is offered too (P1 spike, Q1).
    expect(body.token_endpoint_auth_methods_supported).toContain('none');
  });

  it('publishes the JWKS that access tokens verify against', async () => {
    const { status, body } = await json('/api/auth/jwks');
    expect(status).toBe(200);
    expect(body.keys).toEqual([expect.objectContaining({ kty: 'OKP', crv: 'Ed25519' })]);
  });
});

describe('a CIMD client (Claude’s published identity)', () => {
  it('connects: authorize → approval → code with iss → JWT for /mcp → refresh → revoke', async () => {
    const client = AgentClient.cimd(target, CLAUDE, 'Claude');
    const { code, iss, verifier } = await client.connect(person.browser);
    expect(iss).toBe(ORIGIN);
    expect(target.cimd.fetched).toContain(CLAUDE);

    const token = await client.exchange(code, verifier);
    expect(token.status).toBe(200);
    expect(token.body).toMatchObject({
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'ledger.read ledger.write offline_access',
    });
    const access = String(token.body.access_token);
    expect(decodeProtectedHeader(access)).toMatchObject({ typ: 'at+jwt', alg: 'EdDSA' });
    const claims = decodeJwt(access);
    expect(claims).toMatchObject({
      iss: ORIGIN,
      aud: MCP_URL,
      sub: person.userId,
      client_id: CLAUDE,
    });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(3600);
    const verified = await verify(bearer(access));
    expect(verified).toEqual({
      userId: person.userId,
      connectionId: expect.stringMatching(/^con_/) as unknown,
      clientId: CLAUDE,
      scopes: ['ledger.read', 'ledger.write'],
    });

    // The agent revokes its own refresh token (RFC 7009): it can no longer refresh.
    const second = await client.connect(person.browser);
    const refresh = String(
      (await client.exchange(second.code, second.verifier)).body.refresh_token,
    );
    expect(await client.revoke(refresh, 'refresh_token')).toBe(200);
    expect((await client.refresh(refresh)).body).toMatchObject({ error: 'invalid_grant' });

    // A code works once, and replaying it withdraws what it was exchanged for.
    expect((await client.exchange(code, verifier)).body).toMatchObject({ error: 'invalid_grant' });
    expect((await client.refresh(String(token.body.refresh_token))).body).toMatchObject({
      error: 'invalid_grant',
    });
  });

  it('is cached for up to a day, then fetched again', async () => {
    const client = AgentClient.cimd(
      target,
      'https://claude.ai/oauth/claude-code-client-metadata',
      'Claude Code',
    );
    const fetches = () => target.cimd.fetched.filter((url) => url === client.clientId).length;
    await client.authorize(person.browser);
    expect(fetches()).toBe(1);
    await client.authorize(person.browser);
    expect(fetches()).toBe(1);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 23 * 60 * 60_000);
    await client.authorize(person.browser);
    expect(fetches()).toBe(1);
    vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
    await client.authorize(person.browser);
    expect(fetches()).toBe(2);
  });
});

describe('a DCR client', () => {
  it('registers without authentication as a public client, and connects', async () => {
    const res = await registration(target, {
      name: 'Fictional agent',
      redirectUri: 'https://agent.example/oauth/callback',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ token_endpoint_auth_method: 'none' });
    expect(res.body.client_secret).toBeUndefined();

    const client = new AgentClient(
      target,
      String(res.body.client_id),
      'https://agent.example/oauth/callback',
    );
    const { code, verifier, iss } = await client.connect(person.browser);
    expect(iss).toBe(ORIGIN);
    const token = await client.exchange(code, verifier);
    expect(token.status).toBe(200);
    expect((await verify(bearer(token.body.access_token))).clientId).toBe(client.clientId);
  });

  it('rotates refresh tokens: a retry within 30 s replays, then the old one is refused and the family revoked', async () => {
    const client = await AgentClient.register(target, 'Rotating agent');
    const { code, verifier } = await client.connect(person.browser);
    const first = await client.exchange(code, verifier);
    const old = String(first.body.refresh_token);

    const rotated = await client.refresh(old);
    expect(rotated.status).toBe(200);
    const newer = String(rotated.body.refresh_token);
    expect(newer).not.toBe(old);
    // The new access token keeps the connection.
    expect((await verify(bearer(rotated.body.access_token))).connectionId).toBe(
      (await verify(bearer(first.body.access_token))).connectionId,
    );

    // A client that lost the answer may retry for 30 s and gets the same tokens back.
    expect((await client.refresh(old)).body.refresh_token).toBe(newer);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31_000);
    expect((await client.refresh(old)).body).toMatchObject({ error: 'invalid_grant' });
    // Replay is theft: the whole family goes, the newer token too.
    expect((await client.refresh(newer)).body).toMatchObject({ error: 'invalid_grant' });
  });

  it(`is limited to ${REGISTRATIONS_PER_HOUR} registrations an hour per IP`, async () => {
    const ip = '203.0.113.99';
    const statuses: number[] = [];
    for (let i = 0; i <= REGISTRATIONS_PER_HOUR; i += 1) {
      statuses.push(
        (
          await registration(
            target,
            { name: `Agent ${i}`, redirectUri: 'https://agent.example/cb' },
            ip,
          )
        ).status,
      );
    }
    expect(statuses.slice(0, REGISTRATIONS_PER_HOUR).every((s) => s === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // Another IP is not affected.
    expect(
      (
        await registration(
          target,
          { name: 'Elsewhere', redirectUri: 'https://agent.example/cb' },
          '203.0.113.100',
        )
      ).status,
    ).toBe(201);
  });

  it('takes a registration from a browser-based agent on another origin', async () => {
    const res = await target.app.request(`${ORIGIN}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://agent.example',
        'x-real-ip': '203.0.113.5',
      },
      body: JSON.stringify({
        client_name: 'Browser agent',
        redirect_uris: ['https://agent.example/cb'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('the authorize request', () => {
  let client: AgentClient;

  beforeAll(async () => {
    client = await AgentClient.register(
      target,
      'Strict agent',
      'https://agent.example/oauth/callback',
    );
  });

  it('answers a browser with a 302, never a page of JSON', async () => {
    const { status, location } = await client.authorize(person.browser);
    expect(status).toBe(302);
    expect(location.pathname).toBe('/app/connect/approve');
    expect(location.searchParams.get('sig')).toBeTruthy();
  });

  it('accepts PKCE S256 only', async () => {
    for (const method of ['plain', null] as const) {
      const { location } = await client.authorize(person.browser, { method });
      expect(`${location.origin}${location.pathname}`).toBe(client.redirectUri);
      expect(location.searchParams.get('error')).toBe('invalid_request');
      expect(location.searchParams.get('iss')).toBe(ORIGIN);
    }
  });

  it('matches the redirect URI exactly, and never sends an error to one it does not know', async () => {
    for (const redirectUri of [
      'https://agent.example/oauth/callback/other',
      'https://agent.example/oauth/callback?x=1',
      'https://evil.example/oauth/callback',
      'http://agent.example/oauth/callback',
    ]) {
      const { location } = await client.authorize(person.browser, { redirectUri });
      expect(location.pathname).toBe('/app/connect/approve');
      expect(location.searchParams.get('error')).toMatch(/^invalid_(redirect|request)$/);
    }
  });

  it('requires resource, and only /mcp', async () => {
    const none = await client.authorize(person.browser, { resource: null });
    expect(none.location.pathname).toBe('/app/connect/approve');
    expect(none.location.searchParams.get('error')).toBe('invalid_target');

    const other = await client.authorize(person.browser, {
      resource: 'https://elsewhere.example/api',
    });
    expect(`${other.location.origin}${other.location.pathname}`).toBe(client.redirectUri);
    expect(other.location.searchParams.get('error')).toBe('invalid_target');
  });

  it('refuses scopes NetNet does not grant', async () => {
    const { location } = await client.authorize(person.browser, {
      scope: 'ledger.read openid email',
    });
    expect(location.searchParams.get('error')).toBe('invalid_scope');
  });

  it('never issues a token for another audience', async () => {
    const { code, verifier } = await client.connect(person.browser);
    const res = await client.exchange(code, verifier, {
      resource: 'https://elsewhere.example/api',
    });
    expect(res.body).toMatchObject({ error: 'invalid_target' });
  });

  it('shows the approval page for every new connection: a remembered approval is never used', async () => {
    await client.connect(person.browser);
    const again = await client.authorize(person.browser, { prompt: 'consent' });
    expect(again.location.pathname).toBe('/app/connect/approve');
    const plain = await client.authorize(person.browser);
    expect(plain.location.pathname).toBe('/app/connect/approve');
    const silent = await client.authorize(person.browser, { prompt: 'none' });
    expect(silent.location.searchParams.get('error')).toBe('consent_required');
    const { rows } = await db.owner.query('select count(*)::int as n from core.oauth_consent');
    expect(rows[0]).toEqual({ n: 0 });
  });

  it('sends a person who is not signed in to the approval page, to sign in there', async () => {
    const { Browser } = await import('../support/accounts-app');
    const { location } = await client.authorize(new Browser(target));
    expect(location.pathname).toBe('/app/connect/approve');
    expect(location.searchParams.get('sig')).toBeTruthy();
  });
});

describe('the CIMD fetch', () => {
  async function authorizeWith(clientId: string) {
    const client = new AgentClient(target, clientId, 'https://agent.example/cb');
    const { location } = await client.authorize(person.browser);
    return location;
  }

  it('refuses a client id that is not HTTPS', async () => {
    const location = await authorizeWith('http://agent.example/client.json');
    expect(location.pathname).toBe('/app/connect/approve');
    expect(location.searchParams.get('error')).toBe('invalid_client');
    expect(target.cimd.fetched).not.toContain('http://agent.example/client.json');
  });

  it.each([
    'https://10.0.0.8/client.json',
    'https://192.168.1.2/client.json',
    'https://169.254.169.254/latest/meta-data',
    'https://127.0.0.1/client.json',
    'https://localhost/client.json',
    'https://[::1]/client.json',
  ])('refuses a private or link-local address, without fetching it: %s', async (clientId) => {
    const location = await authorizeWith(clientId);
    expect(location.pathname).toBe('/app/connect/approve');
    expect(location.searchParams.get('error')).toBe('invalid_client');
    expect(target.cimd.fetched).not.toContain(clientId);
  });

  it('refuses a document over 5 KB', async () => {
    const clientId = 'https://agent.example/huge.json';
    target.cimd.serve(clientId, {
      client_id: clientId,
      client_name: 'Huge agent',
      redirect_uris: ['https://agent.example/cb'],
      token_endpoint_auth_method: 'none',
      padding: 'x'.repeat(6000),
    });
    const location = await authorizeWith(clientId);
    expect(location.pathname).toBe('/app/connect/approve');
    expect(location.searchParams.get('error')).toBe('invalid_client');
    expect(location.searchParams.get('error_description')).toMatch(/5KB/);
    expect(target.cimd.fetched).toContain(clientId);
  });

  it('uses a transport that refuses plain HTTP and private addresses (no network in tests)', async () => {
    await expect(fetchClientMetadataResource('http://agent.example/client.json')).rejects.toThrow(
      /HTTPS/,
    );
    await expect(fetchClientMetadataResource('https://localhost/client.json')).rejects.toThrow(
      /public-routable/,
    );
  });
});
