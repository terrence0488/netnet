import { describe, expect, it } from 'vitest';
import {
  LINK_LIFETIME_MS,
  linkSecret,
  signReminderToken,
  verifyReminderToken,
  type ReminderClaims,
} from './links';

const SECRET = 'test-link-secret-0123456789abcdef';
const OTHER_SECRET = 'test-link-secret-ffffffffffffffff';
const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const SENT_AT = '2026-08-01T10:00:00.000Z';
const CLAIMS: ReminderClaims = { userId: USER, channel: 'email', sentAt: SENT_AT };

describe('the reminder token', () => {
  it('round-trips the person, the channel and the reminder', () => {
    const token = signReminderToken(SECRET, CLAIMS);
    expect(token).toMatch(/^r1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyReminderToken(SECRET, token ?? '', new Date(SENT_AT))).toEqual(CLAIMS);
  });

  it('lasts 60 days from the reminder', () => {
    expect(LINK_LIFETIME_MS).toBe(60 * 24 * 60 * 60_000);
    const token = signReminderToken(SECRET, CLAIMS) ?? '';
    const sent = new Date(SENT_AT).getTime();
    expect(verifyReminderToken(SECRET, token, new Date(sent + LINK_LIFETIME_MS - 1000))).toEqual(
      CLAIMS,
    );
    expect(verifyReminderToken(SECRET, token, new Date(sent + LINK_LIFETIME_MS))).toBeNull();
  });

  it('refuses anything forged, tampered with or from another secret, without throwing', () => {
    const token = signReminderToken(SECRET, CLAIMS) ?? '';
    const [version, body, sig] = token.split('.') as [string, string, string];
    const swapped = Buffer.from(
      JSON.stringify({
        u: 'usr_01K1G4KX00BBBBBBBBBBBBBBBB',
        c: 'email',
        s: SENT_AT,
        e: new Date(SENT_AT).getTime() + LINK_LIFETIME_MS,
      }),
    ).toString('base64url');
    for (const bad of [
      '',
      'not-a-token',
      `${version}.${body}.AAAA`,
      `${version}.${swapped}.${sig}`,
      `${version}.${body}.${sig.slice(0, -2)}AA`,
      `r2.${body}.${sig}`,
      signReminderToken(OTHER_SECRET, CLAIMS) ?? '',
    ]) {
      expect(verifyReminderToken(SECRET, bad, new Date(SENT_AT))).toBeNull();
    }
  });

  it('refuses a reminder from the future and a claim that is not an instant', () => {
    const token = signReminderToken(SECRET, CLAIMS) ?? '';
    expect(verifyReminderToken(SECRET, token, new Date('2026-07-01T00:00:00.000Z'))).toBeNull();
    expect(signReminderToken(SECRET, { ...CLAIMS, sentAt: 'not a time' })).toBeNull();
  });

  it('fails closed without the secret: nothing mints and nothing verifies', () => {
    const token = signReminderToken(SECRET, CLAIMS) ?? '';
    for (const missing of [undefined, '']) {
      expect(signReminderToken(missing, CLAIMS)).toBeNull();
      expect(verifyReminderToken(missing, token, new Date(SENT_AT))).toBeNull();
    }
    expect(linkSecret({})).toBeUndefined();
    expect(linkSecret({ LINK_SIGNING_SECRET: '' })).toBeUndefined();
    expect(linkSecret({ LINK_SIGNING_SECRET: SECRET })).toBe(SECRET);
  });
});
