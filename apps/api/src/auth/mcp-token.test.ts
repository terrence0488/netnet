import { HTTPException } from 'hono/http-exception';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createVerifyAccessToken, resourceMetadataUrl, type VerifyAccessToken } from './mcp-token';

/**
 * The token check against a key pair made here, standing in for our JWKS: what passes, and the
 * `401` with its challenge for everything else.
 */
const ORIGIN = 'https://netnet.example';
const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const CONNECTION = 'con_01K1G4KX00AAAAAAAAAAAAAAAA';
const NOW = new Date('2026-08-01T10:00:00Z');

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let privateKey: Key;
let otherKey: Key;
let verify: VerifyAccessToken;

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('EdDSA', { crv: 'Ed25519' })).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'EdDSA' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  verify = createVerifyAccessToken(() => ({ origin: ORIGIN, jwks, clock: () => NOW }));
});

interface Claims {
  [claim: string]: unknown;
}

async function token(
  claims: Claims = {},
  options: { key?: Key; typ?: string; exp?: number; drop?: string[] } = {},
): Promise<string> {
  const payload: Claims = {
    sub: USER,
    client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
    scope: 'ledger.read ledger.write offline_access',
    connection_id: CONNECTION,
    ...claims,
  };
  for (const claim of options.drop ?? []) delete payload[claim];
  const iat = Math.floor(NOW.getTime() / 1000) - 60;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', typ: options.typ ?? 'at+jwt', kid: 'k1' })
    .setIssuer((claims.iss as string | undefined) ?? ORIGIN)
    .setAudience((claims.aud as string | undefined) ?? `${ORIGIN}/mcp`)
    .setIssuedAt(iat)
    .setExpirationTime(options.exp ?? iat + 3600)
    .sign(options.key ?? privateKey);
}

function request(bearer?: string): Request {
  return new Request(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: bearer === undefined ? {} : { Authorization: `Bearer ${bearer}` },
  });
}

async function refusal(
  req: Request,
): Promise<{ status: number; challenge: string; body: unknown }> {
  try {
    await verify(req);
  } catch (error) {
    if (error instanceof HTTPException) {
      const res = error.getResponse();
      return {
        status: res.status,
        challenge: res.headers.get('WWW-Authenticate') ?? '',
        body: await res.json(),
      };
    }
    throw error;
  }
  throw new Error('the token was accepted');
}

describe('verifyAccessToken()', () => {
  it('accepts our token for /mcp and says whose, which connection and which scopes', async () => {
    expect(await verify(request(await token()))).toEqual({
      userId: USER,
      connectionId: CONNECTION,
      clientId: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
      scopes: ['ledger.read', 'ledger.write'],
    });
    expect((await verify(request(await token({ scope: 'ledger.read' })))).scopes).toEqual([
      'ledger.read',
    ]);
  });

  it('asks for a token, with the resource metadata, when none is sent', async () => {
    const { status, challenge, body } = await refusal(request());
    expect(status).toBe(401);
    expect(challenge).toBe(`Bearer resource_metadata="${resourceMetadataUrl(ORIGIN)}"`);
    expect(body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(
      (await refusal(new Request(ORIGIN, { headers: { Authorization: 'Basic abc' } }))).status,
    ).toBe(401);
  });

  it.each([
    ['another audience', () => token({ aud: 'https://elsewhere.example/api' })],
    ['another issuer', () => token({ iss: 'https://elsewhere.example' })],
    ['another key', () => token({}, { key: otherKey })],
    ['an ID token rather than an access token', () => token({}, { typ: 'JWT' })],
    ['an expired token', () => token({}, { exp: Math.floor(NOW.getTime() / 1000) - 1 })],
    ['no connection', () => token({}, { drop: ['connection_id'] })],
    ['a connection that is not one', () => token({ connection_id: 'con_nope' })],
    ['a subject that is not a user id', () => token({ sub: 'someone' })],
    ['no NetNet scope', () => token({ scope: 'offline_access openid' })],
    ['no client', () => token({}, { drop: ['client_id'] })],
    ['garbage', () => Promise.resolve('not.a.jwt')],
  ])('refuses %s with 401 invalid_token and the resource metadata', async (_case, make) => {
    const { status, challenge } = await refusal(request(await make()));
    expect(status).toBe(401);
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain(`resource_metadata="${resourceMetadataUrl(ORIGIN)}"`);
  });

  it('says when the token has expired, so the agent refreshes it', async () => {
    const { challenge } = await refusal(
      request(await token({}, { exp: Math.floor(NOW.getTime() / 1000) - 1 })),
    );
    expect(challenge).toContain('error_description="The access token has expired."');
  });
});
