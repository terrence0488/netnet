import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The reminder's signed links (architecture §7.10): the `?r=` token behind **Open NetNet**, the
 * push's tap target, the footer's unsubscribe link and the `List-Unsubscribe` target. A token names
 * the person, the channel and the reminder's `last_sent_at`, lasts 60 days, is signed with HMAC
 * (`LINK_SIGNING_SECRET`), and signs no one in. Without the secret nothing verifies and nothing is
 * minted: every caller fails closed.
 */

const VERSION = 'r1';

/** A token's life: 60 days from the reminder it names. */
export const LINK_LIFETIME_MS = 60 * 24 * 60 * 60_000;

export interface ReminderClaims {
  userId: string;
  channel: 'push' | 'email';
  /** The reminder's `last_sent_at`, an ISO instant. */
  sentAt: string;
}

interface Payload {
  u: string;
  c: string;
  s: string;
  e: number;
}

function encode(payload: Payload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(body: string): Payload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { u, c, s, e } = parsed as Record<string, unknown>;
  if (typeof u !== 'string' || u === '') return null;
  if (typeof c !== 'string' || typeof s !== 'string' || typeof e !== 'number') return null;
  return { u, c, s, e };
}

function signature(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(`${VERSION}.${body}`).digest();
}

/**
 * Signs `claims`: `r1.‹payload›.‹signature›`, expiring 60 days after `sentAt`. Null when there is
 * no secret to sign with (F19): the caller sends nothing.
 */
export function signReminderToken(
  secret: string | undefined,
  claims: ReminderClaims,
): string | null {
  if (secret === undefined || secret === '') return null;
  const sentAt = new Date(claims.sentAt).getTime();
  if (!Number.isFinite(sentAt)) return null;
  const body = encode({
    u: claims.userId,
    c: claims.channel,
    s: claims.sentAt,
    e: sentAt + LINK_LIFETIME_MS,
  });
  return `${VERSION}.${body}.${signature(secret, body).toString('base64url')}`;
}

/**
 * The claims `token` carries, or null when it is malformed, forged, expired, from the future, or
 * there is no secret to check it with. Never throws.
 */
export function verifyReminderToken(
  secret: string | undefined,
  token: string,
  at: Date,
): ReminderClaims | null {
  if (secret === undefined || secret === '') return null;
  const [version, body, sig] = token.split('.');
  if (version !== VERSION || body === undefined || sig === undefined) return null;
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  const expected = signature(secret, body);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const payload = decode(body);
  if (payload === null) return null;
  if (payload.c !== 'push' && payload.c !== 'email') return null;
  const sentAt = new Date(payload.s).getTime();
  if (!Number.isFinite(sentAt)) return null;
  const now = at.getTime();
  if (sentAt > now || now >= payload.e) return null;
  return { userId: payload.u, channel: payload.c, sentAt: payload.s };
}

/** `LINK_SIGNING_SECRET` (F19): unset until the Founder sets it, so links fail closed. */
export function linkSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.LINK_SIGNING_SECRET;
  return secret === undefined || secret === '' ? undefined : secret;
}
