import { createHash, randomBytes } from 'node:crypto';
import { withClient } from '@netnet/api/db/client';
import { expect, test } from '@playwright/test';

/**
 * Connecting an agent, driven in a real browser (architecture §7.6; the P1 spike's verdict): the
 * agent's servers register by DCR and exchange the code from here, while the person's browser
 * opens the authorize URL, lands on the approval page by a 302 (never a page of JSON), approves
 * through the approval page's API from that page, and is sent back to the agent with the code.
 * The approval page's own screen is P1-T17's; until then the web app shows its not-found page at
 * that address, which is all this needs. Needs the database the built app uses (DATABASE_URL).
 */
const CALLBACK = 'http://127.0.0.1:43123/callback';

test.skip(!process.env.DATABASE_URL, 'needs the database the built app runs on (DATABASE_URL)');

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

test('an agent connects by OAuth with the person approving in their browser, then is revoked', async ({
  page,
  request,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  const agentIp = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;

  // The agent discovers the server from the resource, as an MCP client does.
  const resource = (await (await request.get('/.well-known/oauth-protected-resource')).json()) as {
    resource: string;
    authorization_servers: string[];
  };
  expect(resource.resource).toBe(`${origin}/mcp`);
  const metadata = (await (
    await request.get('/.well-known/oauth-authorization-server')
  ).json()) as Record<string, string>;
  expect(metadata.issuer).toBe(resource.authorization_servers[0]);

  // A fictional person signs up in the browser; their email is verified for them.
  const email = `e2e-agent-${randomBytes(4).toString('hex')}@example.com`;
  await page.goto('/app/');
  // From an address of its own, so sign-up's limit per IP holds for runs in quick succession.
  const signedUp = await page.evaluate(
    async ({ email, ip }) => {
      const res = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
        body: JSON.stringify({
          email,
          password: 'correct horse battery',
          timeZone: 'Asia/Singapore',
        }),
      });
      return res.status;
    },
    { email, ip: agentIp.replace('198.51.100.', '192.0.2.') },
  );
  expect(signedUp).toBe(200);
  await withClient(process.env.DATABASE_URL ?? '', (client) =>
    client.query('update core.user set email_verified = true where email = $1', [email]),
  );

  // The agent's server registers by DCR, as a native app returning to a loopback address.
  const registered = await request.post(metadata.registration_endpoint ?? '', {
    headers: { 'x-real-ip': agentIp },
    data: {
      client_name: 'Fictional E2E agent',
      redirect_uris: [CALLBACK],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    },
  });
  expect(registered.status()).toBe(201);
  const clientId = String(((await registered.json()) as { client_id: string }).client_id);

  // The browser opens the authorize URL and arrives on the approval page, by a 302.
  const { verifier, challenge } = pkce();
  const state = randomBytes(8).toString('hex');
  const authorize = new URL(metadata.authorization_endpoint ?? '');
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: 'ledger.read ledger.write offline_access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: resource.resource,
  })) {
    authorize.searchParams.set(key, value);
  }
  const navigation = await page.goto(authorize.toString());
  expect(new URL(page.url()).pathname).toBe('/app/connect/approve');
  expect(navigation?.headers()['content-type'] ?? '').not.toContain('application/json');
  const query = new URL(page.url()).search.slice(1);

  // The approval page reads the request and the person presses Allow.
  const decided = await page.evaluate(async (query) => {
    const read = await fetch(`/api/agent/approval?${query}`);
    const view = (await read.json()) as Record<string, unknown>;
    const allow = await fetch('/api/agent/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept: true, query }),
    });
    return { view, status: allow.status, body: (await allow.json()) as { url?: string } };
  }, query);
  expect(decided.view).toMatchObject({
    clientName: 'Fictional E2E agent',
    registration: 'dcr',
    nameVerified: false,
    client: 'other',
    host: '127.0.0.1',
  });
  expect(decided.status).toBe(200);

  // The browser goes back to the agent, with the code, the state and the issuer.
  await page.route(`${CALLBACK}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'Back in the agent.' }),
  );
  await page.goto(decided.body.url ?? '');
  const back = new URL(page.url());
  expect(`${back.origin}${back.pathname}`).toBe(CALLBACK);
  expect(back.searchParams.get('state')).toBe(state);
  expect(back.searchParams.get('iss')).toBe(metadata.issuer);
  const code = back.searchParams.get('code') ?? '';

  // The agent's server exchanges the code: a JWT for /mcp and a refresh token.
  const token = await request.post(metadata.token_endpoint ?? '', {
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK,
      client_id: clientId,
      code_verifier: verifier,
      resource: resource.resource,
    },
  });
  expect(token.status()).toBe(200);
  const tokens = (await token.json()) as { access_token: string; refresh_token: string };
  const claims = JSON.parse(
    Buffer.from(tokens.access_token.split('.')[1] ?? '', 'base64url').toString(),
  ) as Record<string, unknown>;
  expect(claims).toMatchObject({ aud: resource.resource, iss: metadata.issuer });

  // The Agent tab lists it; revoking it stops the refresh token.
  await page.goto('/app/');
  const revoked = await page.evaluate(async () => {
    const list = (await (await fetch('/api/agent/connections')).json()) as { id: string }[];
    const res = await fetch(`/api/agent/connections/${list[0]?.id ?? ''}`, { method: 'DELETE' });
    const after = (await (await fetch('/api/agent/connections')).json()) as unknown[];
    return { listed: list.length, status: res.status, left: after.length };
  });
  expect(revoked).toEqual({ listed: 1, status: 200, left: 0 });
  const refreshed = await request.post(metadata.token_endpoint ?? '', {
    form: {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      resource: resource.resource,
    },
  });
  expect(((await refreshed.json()) as { error?: string }).error).toBe('invalid_grant');
});
