import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderedEmail } from './channel';
import {
  allowListChannel,
  captureChannel,
  countedChannel,
  emailChannelFromEnv,
  parseAllowList,
  resendChannel,
} from './email';

const RENDERED: RenderedEmail = {
  subject: 'Verify your email for NetNet',
  html: '<p>Verify</p>',
  text: 'Verify',
  headers: {},
};
const TO = { email: 'person@example.com' };

let logged: string[];

beforeEach(() => {
  logged = [];
  const capture = (line: string) => void logged.push(line);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A stand-in for Resend's API: records each call and answers with `status`. */
function fakeResend(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify({ id: 'email-id' }), { status }));
  };
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

describe('resendChannel()', () => {
  it('posts the message to Resend with the key, from the configured sender', async () => {
    const resend = fakeResend();
    const channel = resendChannel({
      apiKey: 're_test_key',
      from: 'NetNet <hello@netnet.example>',
      fetch: resend.fetch,
    });
    expect(await channel.send(TO, { ...RENDERED, headers: { 'X-Kind': 'test' } })).toEqual({
      ok: true,
    });
    expect(resend.calls).toHaveLength(1);
    const [call] = resend.calls;
    expect(call?.url).toBe('https://api.resend.com/emails');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(call?.init.body as string)).toStrictEqual({
      from: 'NetNet <hello@netnet.example>',
      to: ['person@example.com'],
      subject: RENDERED.subject,
      html: RENDERED.html,
      text: RENDERED.text,
      headers: { 'X-Kind': 'test' },
    });
  });

  it('leaves out empty headers', async () => {
    const resend = fakeResend();
    await resendChannel({ apiKey: 'k', from: 'f', fetch: resend.fetch }).send(TO, RENDERED);
    expect(JSON.parse(resend.calls[0]?.init.body as string)).not.toHaveProperty('headers');
  });

  it('turns a refusal or a network failure into a result, never a throw', async () => {
    const refused = resendChannel({ apiKey: 'k', from: 'f', fetch: fakeResend(422).fetch });
    expect(await refused.send(TO, RENDERED)).toEqual({ ok: false, status: 422 });
    const down = resendChannel({
      apiKey: 'k',
      from: 'f',
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    expect(await down.send(TO, RENDERED)).toEqual({ ok: false });
  });
});

describe('captureChannel()', () => {
  it('keeps the message instead of sending it, and logs neither address nor content', async () => {
    const channel = captureChannel();
    expect(await channel.send(TO, RENDERED)).toEqual({ ok: true, captured: true });
    expect(channel.captured).toEqual([{ to: 'person@example.com', rendered: RENDERED }]);
    expect(logged).toEqual(['{"event":"email_captured"}']);
  });

  it('keeps only the latest messages', async () => {
    const channel = captureChannel(2);
    for (const subject of ['one', 'two', 'three']) {
      await channel.send(TO, { ...RENDERED, subject });
    }
    expect(channel.captured.map((m) => m.rendered.subject)).toEqual(['two', 'three']);
  });
});

describe('countedChannel()', () => {
  const AT = new Date('2026-08-01T10:00:00.000Z');

  it('counts a send Resend accepted, stamped by its clock', async () => {
    const recorded: Date[] = [];
    const channel = countedChannel(
      { id: 'email', send: () => Promise.resolve({ ok: true }) },
      (at) => {
        recorded.push(at);
        return Promise.resolve();
      },
      () => AT,
    );
    expect(await channel.send(TO, RENDERED)).toEqual({ ok: true });
    expect(recorded).toEqual([AT]);
  });

  it('counts neither a captured message nor a refusal', async () => {
    const recorded: Date[] = [];
    const record = (at: Date) => {
      recorded.push(at);
      return Promise.resolve();
    };
    const captured = countedChannel(captureChannel(), record, () => AT);
    expect(await captured.send(TO, RENDERED)).toEqual({ ok: true, captured: true });
    const refused = countedChannel(
      { id: 'email', send: () => Promise.resolve({ ok: false, status: 503 }) },
      record,
      () => AT,
    );
    expect(await refused.send(TO, RENDERED)).toEqual({ ok: false, status: 503 });
    expect(recorded).toEqual([]);
  });

  it('keeps a delivered email a success when the count fails, and logs only that', async () => {
    const channel = countedChannel(
      { id: 'email', send: () => Promise.resolve({ ok: true }) },
      () => Promise.reject(new Error('database down')),
      () => AT,
    );
    expect(await channel.send(TO, RENDERED)).toEqual({ ok: true });
    expect(logged).toEqual(['{"event":"email_count_failed","errorCode":"INTERNAL"}']);
  });
});

describe('allowListChannel()', () => {
  it('sends only to the allowed addresses, in any case, and captures the rest', async () => {
    const real = captureChannel();
    const capture = captureChannel();
    const channel = allowListChannel(parseAllowList('Tester@Example.com'), real, capture);
    await channel.send({ email: 'tester@example.com' }, RENDERED);
    await channel.send({ email: 'someone-else@example.com' }, RENDERED);
    expect(real.captured.map((m) => m.to)).toEqual(['tester@example.com']);
    expect(capture.captured.map((m) => m.to)).toEqual(['someone-else@example.com']);
  });
});

describe('parseAllowList()', () => {
  it('reads addresses separated by commas or spaces', () => {
    expect([
      ...parseAllowList(' a@example.com, B@example.com  c@example.com,,not-an-address'),
    ]).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
    expect(parseAllowList(undefined).size).toBe(0);
  });
});

describe('emailChannelFromEnv()', () => {
  /** Sends one message through the channel the environment picks; says where it went. */
  async function routed(env: NodeJS.ProcessEnv, to = TO.email): Promise<string> {
    const resend = fakeResend();
    vi.stubGlobal('fetch', resend.fetch);
    const result = await emailChannelFromEnv(env).send({ email: to }, RENDERED);
    if (resend.calls.length > 0) return 'resend';
    return result.ok ? 'captured' : 'failed';
  }

  const KEYS = { RESEND_API_KEY: 're_test_key', EMAIL_FROM: 'NetNet <hello@netnet.example>' };

  it('sends everything through Resend in production, and fails loudly without its settings', async () => {
    expect(await routed({ VERCEL_ENV: 'production', ...KEYS })).toBe('resend');
    expect(await routed({ VERCEL_ENV: 'production' })).toBe('failed');
    expect(logged).toContain('{"event":"email_not_configured","errorCode":"INTERNAL"}');
  });

  it('in a preview, sends only to EMAIL_PREVIEW_ALLOW and captures every other address', async () => {
    const env = { VERCEL_ENV: 'preview', ...KEYS, EMAIL_PREVIEW_ALLOW: 'founder@example.com' };
    expect(await routed(env, 'founder@example.com')).toBe('resend');
    expect(await routed(env, 'person@example.com')).toBe('captured');
    expect(await routed({ VERCEL_ENV: 'preview', ...KEYS })).toBe('captured');
  });

  it('captures everything in a local run without a Resend key', async () => {
    expect(await routed({ EMAIL_PREVIEW_ALLOW: 'person@example.com' })).toBe('captured');
  });
});
