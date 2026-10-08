import { createSign } from 'node:crypto';
import { log } from '../lib/log';

/**
 * Google and Apple sign-in (architecture §8 "Providers"): the credentials Better Auth's
 * `socialProviders` entries are built from. A provider whose secrets are absent or incomplete is
 * left out, so its endpoints answer "provider not found" and the email flow is untouched; with
 * F17/F18 pending that is the expected state, not an error, and nothing logs it. Only key
 * material that fails to parse is logged, because that needs the Founder's eye.
 */

export interface SocialProviderCredentials {
  clientId: string;
  clientSecret: string;
}

/** The providers Better Auth serves. Absent ones stay unavailable; nothing crashes. */
export interface SocialConfig {
  google?: SocialProviderCredentials;
  apple?: SocialProviderCredentials;
}

/** Apple's client-secret JWT lasts at most 180 days; NetNet mints it for the full term. */
const APPLE_SECRET_DAYS = 180;

/** Who the Apple client secret is for (Apple's token endpoint). */
const APPLE_AUDIENCE = 'https://appleid.apple.com';

function base64url(input: string | Buffer): string {
  return (typeof input === 'string' ? Buffer.from(input, 'utf8') : input).toString('base64url');
}

/**
 * Apple's client secret: an ES256 JWT over the Services ID, signed with the key Apple issued
 * (F18). Built synchronously with node:crypto, so `createAuth` stays synchronous; `jose` only
 * signs asynchronously. Throws when the key does not parse.
 */
export function appleClientSecret(input: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  now: Date;
}): string {
  const at = Math.floor(input.now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: input.keyId }));
  const payload = base64url(
    JSON.stringify({
      iss: input.teamId,
      iat: at,
      exp: at + APPLE_SECRET_DAYS * 24 * 60 * 60,
      aud: APPLE_AUDIENCE,
      sub: input.clientId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign('sha256')
    .update(signingInput)
    // ES256 wants the raw R and S pair, not the DER wrapper node:crypto defaults to.
    .sign({ key: input.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * A PEM key as an environment variable holds it: Vercel keeps real newlines, but a key pasted as
 * one line carries `\n` escapes instead, which the signer would refuse.
 */
export function normalizePrivateKey(key: string): string {
  return key.includes('\n') ? key : key.replace(/\\n/g, '\n');
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

/**
 * The providers configured in `env` (default: the process's). Google needs its client id and
 * secret; Apple needs its Services ID, team, key id and private key, from which the client
 * secret is minted. Anything less leaves that provider out. A key that does not parse leaves
 * Apple out too, and logs it; every other absence is the expected pre-F17/F18 state.
 */
export function socialProvidersFromEnv(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): SocialConfig {
  const config: SocialConfig = {};
  const googleId = env.GOOGLE_CLIENT_ID;
  const googleSecret = env.GOOGLE_CLIENT_SECRET;
  if (present(googleId) && present(googleSecret)) {
    config.google = { clientId: googleId, clientSecret: googleSecret };
  }
  const clientId = env.APPLE_CLIENT_ID;
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  const privateKey = env.APPLE_PRIVATE_KEY;
  if (present(clientId) && present(teamId) && present(keyId) && present(privateKey)) {
    try {
      config.apple = {
        clientId,
        clientSecret: appleClientSecret({
          clientId,
          teamId,
          keyId,
          privateKey: normalizePrivateKey(privateKey),
          now,
        }),
      };
    } catch {
      log('auth_apple_key_invalid', { errorCode: 'INTERNAL' });
    }
  }
  return config;
}
