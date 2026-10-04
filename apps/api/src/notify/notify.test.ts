import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../db/profiles';
import type { EmailChannel } from './channel';
import { captureChannel } from './email';
import type { Message } from './message';
import { createNotify } from './notify';

const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const ADDRESS = 'person@example.com';
const VERIFY: Message = {
  kind: 'account.verify_email',
  token: 'eyJhbGciOiJIUzI1NiJ9.eyJ4Ijox.c2ln',
};
const RESET: Message = { kind: 'account.reset_password', token: 'Qm9vazEyQ2hhcHRlcjM0WFla' };

let logged: string[];

beforeEach(() => {
  logged = [];
  const capture = (line: string) => void logged.push(line);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => vi.restoreAllMocks());

function notifyWith(account: Account | null, email: EmailChannel = captureChannel()) {
  return createNotify(() => ({
    recipient: (userId) => Promise.resolve(userId === USER ? account : null),
    email,
    origin: 'https://netnet.example',
  }));
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
    }));
    await expect(lookupFails(USER, VERIFY)).resolves.toEqual({ channel: null, reason: 'failed' });
    expect(logged.join('\n')).not.toMatch(/example\.com|script|Verify/);
  });
});
