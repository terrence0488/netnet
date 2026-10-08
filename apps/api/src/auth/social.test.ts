import { generateKeyPairSync } from 'node:crypto';
import { importSPKI, jwtVerify } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appleClientSecret, normalizePrivateKey, socialProvidersFromEnv } from './social';

/** A fresh P-256 key pair, as Apple's key file holds it (PKCS#8) and checks it (SPKI). */
function appleKey(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

const NOW = new Date('2026-10-08T00:00:00Z');
const APPLE_ENV = (privateKey: string): Record<string, string> => ({
  APPLE_CLIENT_ID: 'com.netnet.test',
  APPLE_TEAM_ID: 'TESTTEAM01',
  APPLE_KEY_ID: 'TESTKEY001',
  APPLE_PRIVATE_KEY: privateKey,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('socialProvidersFromEnv()', () => {
  it('configures nothing when the secrets are absent: providers stay unavailable, nothing throws', () => {
    expect(socialProvidersFromEnv({})).toStrictEqual({});
    expect(
      socialProvidersFromEnv({ GOOGLE_CLIENT_ID: 'id', APPLE_CLIENT_ID: 'com.netnet.test' }),
    ).toStrictEqual({});
    // Whitespace is absence, not a credential.
    expect(
      socialProvidersFromEnv({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: '' }),
    ).toStrictEqual({});
  });

  it('configures Google from its client id and secret', () => {
    expect(
      socialProvidersFromEnv({
        GOOGLE_CLIENT_ID: 'google-id',
        GOOGLE_CLIENT_SECRET: 'google-secret',
      }),
    ).toStrictEqual({ google: { clientId: 'google-id', clientSecret: 'google-secret' } });
  });

  it('mints Apple’s client secret from the Services ID, team, key id and private key', async () => {
    const { privateKey, publicKey } = appleKey();
    const config = socialProvidersFromEnv(APPLE_ENV(privateKey), NOW);
    const secret = config.apple?.clientSecret;
    expect(config.apple?.clientId).toBe('com.netnet.test');
    expect(typeof secret).toBe('string');
    const { payload, protectedHeader } = await jwtVerify(
      secret as string,
      await importSPKI(publicKey, 'ES256'),
      { issuer: 'TESTTEAM01', audience: 'https://appleid.apple.com' },
    );
    expect(protectedHeader).toMatchObject({ alg: 'ES256', kid: 'TESTKEY001' });
    expect(payload).toMatchObject({
      iss: 'TESTTEAM01',
      sub: 'com.netnet.test',
      aud: 'https://appleid.apple.com',
    });
    const at = Math.floor(NOW.getTime() / 1000);
    expect(payload.iat).toBe(at);
    expect(payload.exp).toBe(at + 180 * 24 * 60 * 60);
  });

  it('accepts a private key pasted as one line of \\n escapes', () => {
    const { privateKey } = appleKey();
    const oneLine = privateKey.replace(/\n/g, '\\n');
    expect(oneLine).not.toContain('\n');
    const config = socialProvidersFromEnv(APPLE_ENV(oneLine), NOW);
    expect(typeof config.apple?.clientSecret).toBe('string');
  });

  it('leaves Apple out, and logs it, when the key does not parse', () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    const config = socialProvidersFromEnv(APPLE_ENV('not a key'), NOW);
    expect(config).toStrictEqual({});
    expect(logged).toHaveBeenCalledOnce();
    expect(JSON.parse(logged.mock.calls[0]?.[0] as string)).toMatchObject({
      event: 'auth_apple_key_invalid',
      errorCode: 'INTERNAL',
    });
  });
});

describe('appleClientSecret()', () => {
  it('throws on an unparsable key, so the caller can leave Apple out', () => {
    expect(() =>
      appleClientSecret({
        clientId: 'com.netnet.test',
        teamId: 'TESTTEAM01',
        keyId: 'TESTKEY001',
        privateKey: 'not a key',
        now: NOW,
      }),
    ).toThrow();
  });
});

describe('normalizePrivateKey()', () => {
  it('keeps real newlines, and expands escapes only when there are none', () => {
    expect(normalizePrivateKey('a\nb')).toBe('a\nb');
    expect(normalizePrivateKey('a\\nb')).toBe('a\nb');
  });
});
