import { describe, expect, it } from 'vitest';
import type { Message, MessageKind, MessageOf } from '../message';
import { privacyProblems } from '../privacy';
import { EMAIL_VERIFIED_PAGE, RESET_PASSWORD_PAGE } from './account';
import { renderEmail } from './index';
import { escapeHtml } from './layout';
import { AGENT_TAB, UNVERIFIED_NAME, dayAndTime } from './security';

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

/** When a fictional agent was connected: 5 Aug 2026, 05:32 in Singapore. */
const CONNECTED_AT = '2026-08-04T21:32:00.000Z';

const SAMPLES: { [K in MessageKind]: MessageOf<K>[] } = {
  'account.verify_email': [{ kind: 'account.verify_email', token: JWT }],
  'account.reset_password': [{ kind: 'account.reset_password', token: RESET_TOKEN }],
  'security.agent_connected': [
    {
      kind: 'security.agent_connected',
      agentName: 'Claude',
      nameVerified: true,
      connectedAt: CONNECTED_AT,
      timeZone: 'Asia/Singapore',
    },
    {
      kind: 'security.agent_connected',
      agentName:
        '<b>Fictional</b> "agent" & co\u202e\nwith a name far longer than forty characters',
      nameVerified: false,
      connectedAt: CONNECTED_AT,
      timeZone: 'Europe/London',
    },
    {
      kind: 'security.agent_connected',
      agentName: '',
      nameVerified: false,
      connectedAt: CONNECTED_AT,
      timeZone: 'Not/AZone',
    },
  ],
};

/** The line each kind's footer starts with: why it was sent. */
const REASON: Record<MessageKind, string> = {
  'account.verify_email': 'You’re getting this because',
  'account.reset_password': 'You’re getting this because',
  'security.agent_connected': 'We send this every time an agent is connected.',
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
      expect(text).toContain(REASON[msg.kind]);
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

describe('the security email', () => {
  const [verified, unverified, nameless] = SAMPLES['security.agent_connected'] as [
    MessageOf<'security.agent_connected'>,
    MessageOf<'security.agent_connected'>,
    MessageOf<'security.agent_connected'>,
  ];

  it('says which agent was connected and when, in the person’s time zone, and links to revoke it', () => {
    const { subject, text, html } = renderEmail(verified, { origin: ORIGIN });
    expect(subject).toBe('Claude was connected to your NetNet');
    expect(text).toContain(
      'On 5 Aug 2026 at 5:32 am, you allowed Claude to see your holdings and their history, ' +
        'and to add or update them.',
    );
    expect(text).toContain(`Not you? Revoke it: ${ORIGIN}${AGENT_TAB}`);
    expect(html).toContain(`href="${ORIGIN}${AGENT_TAB}"`);
    expect(text).toContain('It can’t be turned off.');
    expect(text).not.toContain(UNVERIFIED_NAME);
  });

  it('escapes a registered name, keeps it to one line of 40 characters, and says it is unverified', () => {
    const { subject, text, html } = renderEmail(unverified, { origin: ORIGIN });
    const name = '<b>Fictional</b> "agent" & co with a na…';
    expect(Array.from(name)).toHaveLength(40);
    expect(subject).toBe(`${name} ${UNVERIFIED_NAME} was connected to your NetNet`);
    expect(subject).not.toMatch(/[\n\u202e]/);
    expect(html).not.toContain('<b>Fictional');
    expect(html).toContain(escapeHtml(name));
    expect(text).toContain('On 4 Aug 2026 at 10:32 pm');
  });

  it('names no one when the agent gave no name, and falls back to UTC for an unknown zone', () => {
    const { subject, text } = renderEmail(nameless, { origin: ORIGIN });
    expect(subject).toBe(`An agent ${UNVERIFIED_NAME} was connected to your NetNet`);
    expect(text).toContain('On 4 Aug 2026 at 9:32 pm, you allowed an agent to see');
  });

  it('formats the time as the prototype does', () => {
    expect(dayAndTime('2026-01-09T00:05:00Z', 'UTC')).toEqual({
      day: '9 Jan 2026',
      time: '12:05 am',
    });
    expect(dayAndTime('2026-01-09T12:00:00Z', 'UTC')).toEqual({
      day: '9 Jan 2026',
      time: '12:00 pm',
    });
    expect(() => dayAndTime('not a time', 'UTC')).toThrow();
  });
});

describe('escapeHtml()', () => {
  it('escapes everything that could open a tag or leave an attribute', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});
