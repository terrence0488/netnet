import { createECDH, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import type { Track } from '../events/track';
import type { PushEndpoint, RenderedPush } from './channel';
import {
  WEB_PUSH_MAGIC,
  buildWebPushPayload,
  fetchPost,
  isVapidKeyPair,
  vapidConfig,
  webPushChannel,
  webPushChannelFromEnv,
  type PushOutcomeStore,
  type VapidConfig,
  type WebPushPost,
} from './webpush';

/**
 * The `webpush` channel (architecture §7.10, CONVENTIONS §9): the wire payload's shape, VAPID
 * parsing that fails closed, sends through the real `web-push` request builder against a fake
 * push endpoint, and the revocation rules — `404`/`410` or five failures revoke, with
 * `push_disabled {by: browser}`. Keys are test-only, generated per run.
 */

const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const RENDERED: RenderedPush = {
  title: 'NetNet',
  body: 'Your net worth is due for an update. Just ask Claude.',
  url: 'https://netnet.example/app/?r=r1.test-payload.test-signature',
};

/** Test-only VAPID keys, generated per run. */
const VAPID: VapidConfig = {
  ...webpush.generateVAPIDKeys(),
  subject: 'mailto:push@netnet.example',
};

/** A subscription the library can really encrypt for: a P-256 point plus a 16-byte secret. */
function subscription(endpoint: string): PushEndpoint['subscription'] {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint,
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

function device(over: Partial<PushEndpoint> = {}): PushEndpoint {
  return {
    id: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA',
    userId: USER,
    platform: 'android',
    subscription: subscription('https://push.example.net/push/test-device'),
    ttlSeconds: 3600,
    ...over,
  };
}

interface SentPost {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Buffer;
}

function stubPost(answer: { ok: boolean; status: number } | 'throw') {
  const sent: SentPost[] = [];
  const post: WebPushPost = (url, init) => {
    sent.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (answer === 'throw') return Promise.reject(new Error('push service down'));
    return Promise.resolve(answer);
  };
  return { post, sent };
}

function memoryStore() {
  const successes: { id: string; at: Date }[] = [];
  const failures: { id: string; status: number | undefined; at: Date }[] = [];
  let next: { userId: string; revoked: boolean } | null = { userId: USER, revoked: false };
  const store: PushOutcomeStore = {
    success: (id, at) => {
      successes.push({ id, at });
      return Promise.resolve();
    },
    failure: (id, status, at) => {
      failures.push({ id, status, at });
      return Promise.resolve(next);
    },
  };
  return { store, successes, failures, revoke: (outcome: typeof next) => (next = outcome) };
}

function captureTrack() {
  const events: { name: string; props: unknown; userId: string | undefined }[] = [];
  const track: Track = (name, props, ctx) => {
    events.push({ name, props, userId: ctx.userId });
    return Promise.resolve();
  };
  return { track, events };
}

let logged: string[];

beforeEach(() => {
  logged = [];
  const capture = (line: string) => void logged.push(line);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => vi.restoreAllMocks());

function channelOf(options: {
  post: WebPushPost;
  store: PushOutcomeStore;
  track: Track;
  vapid?: VapidConfig;
  clock?: () => Date;
}) {
  return webPushChannel({
    vapid: options.vapid ?? VAPID,
    post: options.post,
    store: options.store,
    track: options.track,
    appVersion: () => 'test123',
    ...(options.clock ? { clock: options.clock } : {}),
  });
}

describe('buildWebPushPayload', () => {
  it('is the worker’s JSON: the marker, title, body and where a tap goes', () => {
    expect(JSON.parse(buildWebPushPayload(RENDERED))).toEqual({
      web_push: WEB_PUSH_MAGIC,
      notification: {
        title: 'NetNet',
        body: 'Your net worth is due for an update. Just ask Claude.',
        navigate: 'https://netnet.example/app/?r=r1.test-payload.test-signature',
      },
    });
    expect(WEB_PUSH_MAGIC).toBe(8030);
  });
});

describe('vapidConfig', () => {
  it('reads the pair and subject from the environment', () => {
    expect(
      vapidConfig({
        VAPID_PUBLIC_KEY: VAPID.publicKey,
        VAPID_PRIVATE_KEY: VAPID.privateKey,
        VAPID_SUBJECT: 'mailto:push@netnet.example',
      }),
    ).toEqual({
      publicKey: VAPID.publicKey,
      privateKey: VAPID.privateKey,
      subject: 'mailto:push@netnet.example',
    });
  });

  it('is undefined until all three are set, and when the pair is malformed', () => {
    const full = {
      VAPID_PUBLIC_KEY: VAPID.publicKey,
      VAPID_PRIVATE_KEY: VAPID.privateKey,
      VAPID_SUBJECT: 'mailto:push@netnet.example',
    };
    expect(vapidConfig({})).toBeUndefined();
    expect(vapidConfig({ ...full, VAPID_PUBLIC_KEY: '' })).toBeUndefined();
    expect(vapidConfig({ ...full, VAPID_PRIVATE_KEY: '' })).toBeUndefined();
    expect(vapidConfig({ ...full, VAPID_SUBJECT: '' })).toBeUndefined();
    expect(vapidConfig({ ...full, VAPID_PUBLIC_KEY: 'not-a-key' })).toBeUndefined();
    expect(vapidConfig({ ...full, VAPID_PRIVATE_KEY: VAPID.publicKey })).toBeUndefined();
  });

  it('accepts a generated pair only', () => {
    expect(isVapidKeyPair(VAPID.publicKey, VAPID.privateKey)).toBe(true);
    expect(isVapidKeyPair('x', 'y')).toBe(false);
    expect(isVapidKeyPair(VAPID.privateKey, VAPID.privateKey)).toBe(false);
  });
});

describe('webPushChannelFromEnv', () => {
  it('is absent without the keys, so reminders go by email', () => {
    const store = memoryStore();
    const tracked = captureTrack();
    expect(
      webPushChannelFromEnv(
        {
          post: stubPost({ ok: true, status: 201 }).post,
          store: store.store,
          track: tracked.track,
          appVersion: () => 'test123',
        },
        {},
      ),
    ).toBeUndefined();
  });
});

describe('sending', () => {
  it('encrypts per device, signs with VAPID, and posts TTL with normal urgency', async () => {
    const post = stubPost({ ok: true, status: 201 });
    const store = memoryStore();
    const tracked = captureTrack();
    const at = new Date('2026-08-01T10:00:00.000Z');
    const channel = channelOf({
      post: post.post,
      store: store.store,
      track: tracked.track,
      clock: () => at,
    });

    await expect(channel.send(device(), RENDERED)).resolves.toEqual({ ok: true });
    expect(post.sent).toHaveLength(1);
    const sent = post.sent[0]!;
    expect(sent.url).toBe('https://push.example.net/push/test-device');
    expect(sent.method).toBe('POST');
    expect(sent.headers['TTL']).toBe('3600');
    expect(sent.headers['Urgency']).toBe('normal');
    expect(sent.headers['Content-Encoding']).toBe('aes128gcm');
    expect(sent.headers['Authorization']).toMatch(/^vapid t=[^,]+, k=.+$/);
    // Encrypted: the lock-screen line is nowhere in the body on the wire.
    expect(sent.body).toBeInstanceOf(Buffer);
    expect(sent.body.toString('latin1')).not.toContain('Your net worth');
    expect(store.successes).toEqual([{ id: device().id, at }]);
    expect(store.failures).toEqual([]);
    expect(tracked.events).toEqual([]);
    expect(logged).toEqual([]);
  });

  it('posts the payload against a fake push endpoint, over real HTTP', async () => {
    const received: { url: string; headers: Record<string, unknown>; body: Buffer }[] = [];
    const server: Server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          url: request.url ?? '',
          headers: request.headers,
          body: Buffer.concat(chunks),
        });
        response.statusCode = 201;
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (typeof address !== 'object' || address === null) throw new Error('no address');
      const store = memoryStore();
      const tracked = captureTrack();
      const channel = channelOf({
        post: fetchPost(),
        store: store.store,
        track: tracked.track,
      });
      const to = device({
        subscription: subscription(`http://127.0.0.1:${address.port}/push/fake-device`),
        ttlSeconds: 7200,
      });
      await expect(channel.send(to, RENDERED)).resolves.toEqual({ ok: true });
      expect(received).toHaveLength(1);
      expect(received[0]?.url).toBe('/push/fake-device');
      expect(received[0]?.headers['ttl']).toBe('7200');
      expect(received[0]?.headers['urgency']).toBe('normal');
      expect(received[0]?.headers['content-encoding']).toBe('aes128gcm');
      expect(String(received[0]?.headers['authorization'])).toMatch(/^vapid t=[^,]+, k=.+$/);
      expect(received[0]?.body.toString('latin1')).not.toContain('Your net worth');
      expect(store.successes).toHaveLength(1);
      expect(tracked.events).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('revokes on 404 and 410, firing push_disabled {by: browser} once', async () => {
    for (const status of [404, 410]) {
      const post = stubPost({ ok: false, status });
      const store = memoryStore();
      const tracked = captureTrack();
      store.revoke({ userId: USER, revoked: true });
      const at = new Date('2026-08-01T10:00:00.000Z');
      const channel = channelOf({
        post: post.post,
        store: store.store,
        track: tracked.track,
        clock: () => at,
      });

      await expect(channel.send(device(), RENDERED)).resolves.toEqual({ ok: false, status });
      expect(store.failures).toEqual([{ id: device().id, status, at }]);
      expect(tracked.events).toEqual([
        {
          name: 'push_disabled',
          props: { platform: 'android', by: 'browser' },
          userId: USER,
        },
      ]);
      expect(logged).toEqual([
        `{"event":"push_send_failed","userId":"${USER}","status":${status},"errorCode":"INTERNAL"}`,
      ]);
      logged = [];
    }
  });

  it('counts other failures without the event, until the fifth revokes', async () => {
    const post = stubPost({ ok: false, status: 503 });
    const store = memoryStore();
    const tracked = captureTrack();
    const channel = channelOf({ post: post.post, store: store.store, track: tracked.track });

    await expect(channel.send(device(), RENDERED)).resolves.toEqual({ ok: false, status: 503 });
    expect(store.failures.map((f) => f.status)).toEqual([503]);
    expect(tracked.events).toEqual([]);

    store.revoke({ userId: USER, revoked: true });
    await expect(channel.send(device(), RENDERED)).resolves.toEqual({ ok: false, status: 503 });
    expect(tracked.events).toEqual([
      { name: 'push_disabled', props: { platform: 'android', by: 'browser' }, userId: USER },
    ]);
  });

  it('treats a network failure as failed, with no status', async () => {
    const post = stubPost('throw');
    const store = memoryStore();
    const tracked = captureTrack();
    const channel = channelOf({ post: post.post, store: store.store, track: tracked.track });

    await expect(channel.send(device(), RENDERED)).resolves.toEqual({ ok: false });
    expect(store.failures.map((f) => f.status)).toEqual([undefined]);
    expect(tracked.events).toEqual([]);
    expect(logged).toEqual([
      `{"event":"push_send_failed","userId":"${USER}","errorCode":"INTERNAL"}`,
    ]);
  });

  it('fires no event when the row was already revoked', async () => {
    const post = stubPost({ ok: false, status: 410 });
    const store = memoryStore();
    const tracked = captureTrack();
    store.revoke(null);
    const channel = channelOf({ post: post.post, store: store.store, track: tracked.track });

    await expect(channel.send(device(), RENDERED)).resolves.toEqual({ ok: false, status: 410 });
    expect(tracked.events).toEqual([]);
  });

  it('fails a malformed subscription without touching the failure count', async () => {
    const post = stubPost({ ok: true, status: 201 });
    const store = memoryStore();
    const tracked = captureTrack();
    const channel = channelOf({ post: post.post, store: store.store, track: tracked.track });

    const to = device({
      subscription: { endpoint: 'https://push.example.net/push/x', p256dh: '!!!', auth: '!!!' },
    });
    await expect(channel.send(to, RENDERED)).resolves.toEqual({ ok: false });
    expect(post.sent).toEqual([]);
    expect(store.successes).toEqual([]);
    expect(store.failures).toEqual([]);
    expect(tracked.events).toEqual([]);
  });
});
