import { describe, expect, it } from 'vitest';
import type { Message, MessageKind, MessageOf } from '../message';
import { privacyProblems } from '../privacy';
import { EMAIL_VERIFIED_PAGE, RESET_PASSWORD_PAGE } from './account';
import { renderEmail } from './index';
import { escapeHtml } from './layout';

/**
 * The template privacy test (architecture §7.10, CONVENTIONS §9): every kind of message, rendered
 * from fictional samples, carries no figure with a currency and none of the person's own words.
 * `SAMPLES` is keyed by kind, so a kind added without samples does not compile.
 */
const ORIGIN = 'https://netnet.example';

/** A verification token as Better Auth makes it: a JWT. Fictional. */
const JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6InBlcnNvbkBleGFtcGxlLmNvbSJ9.c2lnbmF0dXJlLW5vdC1yZWFsLWF0LWFsbA';
/** A reset token: a random id. Fictional. */
const RESET_TOKEN = 'Qm9vazEyQ2hhcHRlcjM0WFla';

const SAMPLES: { [K in MessageKind]: MessageOf<K>[] } = {
  'account.verify_email': [{ kind: 'account.verify_email', token: JWT }],
  'account.reset_password': [{ kind: 'account.reset_password', token: RESET_TOKEN }],
};

const ALL: Message[] = Object.values(SAMPLES).flat();

/** What a person might have written: fictional holding, type and tag names, and their address. */
const THEIR_WORDS = [
  'MARKER-A-7F3C',
  'Everyday account',
  'World index fund',
  'Home loan',
  'Long term',
  'person@example.com',
  'Fictional Person',
];

describe('every message template', () => {
  it.each(ALL.map((msg) => [msg.kind, msg] as const))(
    '%s passes the privacy test',
    (_kind, msg) => {
      expect(privacyProblems({ ...renderEmail(msg, { origin: ORIGIN }) }, THEIR_WORDS)).toEqual([]);
    },
  );

  it.each(ALL.map((msg) => [msg.kind, msg] as const))(
    '%s is one line, repeated as the subject, with one button and a reason it was sent',
    (_kind, msg) => {
      const { subject, html, text } = renderEmail(msg, { origin: ORIGIN });
      expect(html).toContain(`>${escapeHtml(subject)}</h1>`);
      expect(html.match(/<a /g)).toHaveLength(1);
      expect(text.startsWith(`${subject}\n`)).toBe(true);
      expect(text).toContain('You’re getting this because');
    },
  );

  it('refuses a token that could carry anything but a token', () => {
    for (const token of [
      '',
      'short',
      `${JWT}"><script>`,
      'with space in it here',
      'a'.repeat(3000),
    ]) {
      expect(() =>
        renderEmail({ kind: 'account.verify_email', token }, { origin: ORIGIN }),
      ).toThrow(/malformed/);
    }
  });
});

describe('the account emails', () => {
  it('link to Better Auth’s verification, landing on the web app', () => {
    const { text, html } = renderEmail(SAMPLES['account.verify_email'][0]!, { origin: ORIGIN });
    const url = `${ORIGIN}/api/auth/verify-email?token=${JWT}&callbackURL=${encodeURIComponent(EMAIL_VERIFIED_PAGE)}`;
    expect(text).toContain(url);
    expect(html).toContain(`href="${escapeHtml(url)}"`);
  });

  it('link to Better Auth’s reset, which hands the token to the web app’s page', () => {
    const { text } = renderEmail(SAMPLES['account.reset_password'][0]!, { origin: ORIGIN });
    expect(text).toContain(
      `${ORIGIN}/api/auth/reset-password/${RESET_TOKEN}?callbackURL=${encodeURIComponent(RESET_PASSWORD_PAGE)}`,
    );
  });
});

describe('escapeHtml()', () => {
  it('escapes everything that could open a tag or leave an attribute', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});
