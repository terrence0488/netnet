import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../db/profiles';
import type { EmailChannel, PushChannel, PushEndpoint, RenderedPush } from './channel';
import { captureChannel, type CaptureChannel } from './email';
import type { Message } from './message';
import { createNotify, type ReminderDeps } from './notify';

const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const ADDRESS = 'person@example.com';
const VERIFY: Message = {
  kind: 'account.verify_email',
  token: 'eyJhbGciOiJIUzI1NiJ9.eyJ4Ijox.c2ln',
};
const RESET: Message = { kind: 'account.reset_password', token: 'Qm9vazEyQ2hhcHRlcjM0WFla' };
const REMINDER: Message = { kind: 'reminder.comeback', agentName: 'Claude' };
const SENT_AT = new Date('2026-08-01T10:00:00.000Z');
const TOKEN = 'r1.test-payload.test-signature';

let logged: string[];

beforeEach(() => {
  logged = [];
  const capture = (line: string) => void logged.push(line);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => vi.restoreAllMocks());

function reminderDeps(overrides: Partial<ReminderDeps> = {}): ReminderDeps {
  return {
    state: () => Promise.resolve({ enabled: true, emailEnabled: true, lastSentAt: SENT_AT }),
    sent: () => Promise.resolve(),
    emailBudgetLeft: () => Promise.resolve(true),
    sign: () => TOKEN,
    ...overrides,
  };
}

function notifyWith(account: Account | null, email: EmailChannel = captureChannel()) {
  return createNotify(() => ({
    recipient: (userId) => Promise.resolve(userId === USER ? account : null),
    email,
    origin: 'https://netnet.example',
    reminders: reminderDeps(),
  }));
}

/** A push channel that answers `results` per endpoint, and keeps what it was sent. */
function fakePush(results: boolean[] | 'throw') {
  const sent: { to: PushEndpoint; rendered: RenderedPush }[] = [];
  const channel: PushChannel = {
    id: 'webpush',
    send: (to, rendered) => {
      sent.push({ to, rendered });
      if (results === 'throw') return Promise.reject(new Error('push service down'));
      return Promise.resolve({ ok: results[sent.length - 1] ?? false });
    },
  };
  return { channel, sent };
}

function reminderNotify(options: {
  account?: Account | null;
  email?: CaptureChannel;
  reminders?: Partial<ReminderDeps>;
  endpoints?: PushEndpoint[];
  push?: PushChannel;
}) {
  const email = options.email ?? captureChannel();
  const push =
    options.push === undefined
      ? undefined
      : {
          endpoints: () => Promise.resolve(options.endpoints ?? []),
          channel: options.push,
        };
  const channels: string[] = [];
  const notify = createNotify(() => ({
    recipient: (userId) => Promise.resolve(userId === USER ? (options.account ?? null) : null),
    email,
    origin: 'https://netnet.example',
    reminders: reminderDeps({
      sent: (_userId, channel) => {
        channels.push(channel);
        return Promise.resolve();
      },
      ...(push === undefined ? {} : { push }),
      ...options.reminders,
    }),
  }));
  return { notify, email, channels };
}

describe('notify()', () => {
  it('sends the account emails to the account’s address, verified or not', async () => {
    const email = captureChannel();
    const notify = notifyWith({ email: ADDRESS, emailVerified: false }, email);
    expect(await notify(USER, VERIFY)).toEqual({ channel: 'email' });
    expect(await notify(USER, RESET)).toEqual({ channel: 'email' });
    expect(email.captured.map((m) => [m.to, m.rendered.subject])).toEqual([
      [ADDRESS, 'Verify your email for NetNet'],
      [ADDRESS, 'Reset your NetNet password'],
    ]);
  });

  it('has nowhere to send for a person with no account', async () => {
    expect(await notifyWith(null)(USER, VERIFY)).toEqual({ channel: null, reason: 'nowhere' });
  });

  it('reports a failed send, logging the user id and the provider’s status only', async () => {
    const refusing: EmailChannel = {
      id: 'email',
      send: () => Promise.resolve({ ok: false, status: 503 }),
    };
    const delivery = await notifyWith({ email: ADDRESS, emailVerified: true }, refusing)(
      USER,
      RESET,
    );
    expect(delivery).toEqual({ channel: null, reason: 'failed' });
    expect(logged).toEqual([
      `{"event":"notify_failed","userId":"${USER}","errorCode":"INTERNAL","status":503}`,
    ]);
  });

  it('never throws, and never logs the address or the message', async () => {
    const throwing: EmailChannel = { id: 'email', send: () => Promise.reject(new Error(ADDRESS)) };
    const notify = notifyWith({ email: ADDRESS, emailVerified: true }, throwing);
    await expect(notify(USER, VERIFY)).resolves.toEqual({ channel: null, reason: 'failed' });
    const malformed: Message = { kind: 'account.verify_email', token: '<script>' };
    await expect(
      notifyWith({ email: ADDRESS, emailVerified: true })(USER, malformed),
    ).resolves.toEqual({ channel: null, reason: 'failed' });
    const lookupFails = createNotify(() => ({
      recipient: () => Promise.reject(new Error('database down')),
      email: captureChannel(),
      origin: 'https://netnet.example',
      reminders: reminderDeps(),
    }));
    await expect(lookupFails(USER, VERIFY)).resolves.toEqual({ channel: null, reason: 'failed' });
    expect(logged.join('\n')).not.toMatch(/example\.com|script|Verify/);
  });
});

describe('the comeback reminder', () => {
  const VERIFIED = { email: ADDRESS, emailVerified: true };
  const DEVICES = [{ id: 'ep_1' }, { id: 'ep_2' }];

  it('goes by push to every active device, and not by email', async () => {
    const push = fakePush([true, true]);
    const { notify, email, channels } = reminderNotify({
      account: VERIFIED,
      endpoints: DEVICES,
      push: push.channel,
    });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: 'push', devices: 2 });
    expect(push.sent.map((s) => s.to)).toEqual(DEVICES);
    expect(push.sent[0]?.rendered).toEqual({
      title: 'NetNet',
      body: 'Your net worth is due for an update. Just ask Claude.',
      url: `https://netnet.example/app/?r=${TOKEN}`,
    });
    expect(email.captured).toEqual([]);
    expect(channels).toEqual(['push']);
  });

  it('counts one push as delivered, and falls back to email only when every push failed', async () => {
    const some = fakePush([true, false]);
    const first = reminderNotify({ account: VERIFIED, endpoints: DEVICES, push: some.channel });
    await expect(first.notify(USER, REMINDER)).resolves.toEqual({ channel: 'push', devices: 1 });
    expect(first.email.captured).toEqual([]);

    const all = fakePush([false, false]);
    const second = reminderNotify({ account: VERIFIED, endpoints: DEVICES, push: all.channel });
    await expect(second.notify(USER, REMINDER)).resolves.toEqual({ channel: 'email' });
    expect(second.email.captured).toHaveLength(1);
    expect(second.channels).toEqual(['email']);
  });

  it('treats a throwing push channel as a failed push, and still falls back to email', async () => {
    const push = fakePush('throw');
    const { notify, email } = reminderNotify({
      account: VERIFIED,
      endpoints: DEVICES,
      push: push.channel,
    });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: 'email' });
    expect(email.captured).toHaveLength(1);
  });

  it('goes by email when push is not wired, with the line as its subject', async () => {
    const { notify, email, channels } = reminderNotify({ account: VERIFIED });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: 'email' });
    expect(email.captured.map((m) => [m.to, m.rendered.subject])).toEqual([
      [ADDRESS, 'Your net worth is due for an update.'],
    ]);
    expect(email.captured[0]?.rendered.text).toContain('Just ask Claude.');
    expect(email.captured[0]?.rendered.headers['List-Unsubscribe']).toContain(
      '/api/reminders/unsubscribe?token=',
    );
    expect(channels).toEqual(['email']);
  });

  it('sends nothing by any channel when Reminders is off', async () => {
    const push = fakePush([true]);
    const { notify, email, channels } = reminderNotify({
      account: VERIFIED,
      endpoints: [{ id: 'ep_1' }],
      push: push.channel,
      reminders: {
        state: () => Promise.resolve({ enabled: false, emailEnabled: true, lastSentAt: SENT_AT }),
      },
    });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: null, reason: 'off' });
    expect(push.sent).toEqual([]);
    expect(email.captured).toEqual([]);
    expect(channels).toEqual([]);
  });

  it('sends no reminder email when Email reminders is off, but still pushes', async () => {
    const push = fakePush([true]);
    const pushing = reminderNotify({
      account: VERIFIED,
      endpoints: [{ id: 'ep_1' }],
      push: push.channel,
      reminders: {
        state: () => Promise.resolve({ enabled: true, emailEnabled: false, lastSentAt: SENT_AT }),
      },
    });
    await expect(pushing.notify(USER, REMINDER)).resolves.toEqual({ channel: 'push', devices: 1 });

    const { notify, email } = reminderNotify({
      account: VERIFIED,
      reminders: {
        state: () => Promise.resolve({ enabled: true, emailEnabled: false, lastSentAt: SENT_AT }),
      },
    });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: null, reason: 'off' });
    expect(email.captured).toEqual([]);
  });

  it('emails verified addresses only', async () => {
    const { notify, email } = reminderNotify({
      account: { email: ADDRESS, emailVerified: false },
    });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: null, reason: 'nowhere' });
    expect(email.captured).toEqual([]);
  });

  it('sends no reminder email past the day’s budget', async () => {
    const { notify, email, channels } = reminderNotify({
      account: VERIFIED,
      reminders: { emailBudgetLeft: () => Promise.resolve(false) },
    });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: null, reason: 'failed' });
    expect(email.captured).toEqual([]);
    expect(channels).toEqual([]);
  });

  it('fails closed without the link secret: nothing goes, and the log names the cause', async () => {
    const push = fakePush([true]);
    const { notify, email } = reminderNotify({
      account: VERIFIED,
      endpoints: [{ id: 'ep_1' }],
      push: push.channel,
      reminders: { sign: () => null },
    });
    await expect(notify(USER, REMINDER)).resolves.toEqual({ channel: null, reason: 'failed' });
    expect(push.sent).toEqual([]);
    expect(email.captured).toEqual([]);
    expect(logged).toEqual([
      `{"event":"link_signing_not_configured","userId":"${USER}","errorCode":"INTERNAL"}`,
    ]);
  });

  it('has nowhere to send with no clock, and fails outside a run with no claim', async () => {
    const missing = reminderNotify({
      account: VERIFIED,
      reminders: { state: () => Promise.resolve(null) },
    });
    await expect(missing.notify(USER, REMINDER)).resolves.toEqual({
      channel: null,
      reason: 'nowhere',
    });
    const unclaimed = reminderNotify({
      account: VERIFIED,
      reminders: {
        state: () => Promise.resolve({ enabled: true, emailEnabled: true, lastSentAt: null }),
      },
    });
    await expect(unclaimed.notify(USER, REMINDER)).resolves.toEqual({
      channel: null,
      reason: 'failed',
    });
    expect(missing.email.captured).toEqual([]);
    expect(unclaimed.email.captured).toEqual([]);
  });
});
