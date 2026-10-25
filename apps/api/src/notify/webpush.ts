import { isPushServiceUrl } from '@netnet/contracts';
import webpush from 'web-push';
import type { Track } from '../events/track';
import { log } from '../lib/log';
import type { PushChannel, PushEndpoint, RenderedPush, SendResult } from './channel';

/**
 * The `webpush` channel (architecture §7.10): the comeback reminder's first channel. One payload
 * serves both paths — Safari 18.4+ shows it with no worker (Declarative Web Push), elsewhere
 * `/app/sw.js` reads the same JSON — encrypted per device (aes128gcm, by the `web-push` library),
 * signed with the VAPID key, `urgency: normal`, and a TTL of the time left until 21:00 in the
 * person's zone. `404`/`410` or five failures in a row revokes the device (`push_disabled {by:
 * browser}`). It sends only to the push services on its list, and never follows a redirect; a
 * stored endpoint off the list is revoked instead of sent to, the same way. Failures are logged
 * without content.
 */

/** The payload's marker: what tells the worker (and Safari) this is NetNet's reminder. */
export const WEB_PUSH_MAGIC = 8030;

/** A push the worker shows: title "NetNet", the line, and where a tap goes. */
export interface WebPushPayload {
  web_push: number;
  notification: { title: string; body: string; navigate: string };
}

/** The wire payload for a rendered reminder: the JSON the worker reads. */
export function buildWebPushPayload(rendered: RenderedPush): string {
  const payload: WebPushPayload = {
    web_push: WEB_PUSH_MAGIC,
    notification: { title: rendered.title, body: rendered.body, navigate: rendered.url },
  };
  return JSON.stringify(payload);
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** A `mailto:` contact or an https: URL: who to reach about these pushes. */
  subject: string;
}

/**
 * `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (F19): the signing key and who to
 * contact about it. Undefined until the Founder sets all three — and when what is set is not a
 * key pair — so everything push-related fails closed instead of sending unsigned or revoking
 * devices over a misconfiguration.
 */
export function vapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | undefined {
  const publicKey = env.VAPID_PUBLIC_KEY ?? '';
  const privateKey = env.VAPID_PRIVATE_KEY ?? '';
  const subject = env.VAPID_SUBJECT ?? '';
  if (publicKey === '' || privateKey === '' || subject === '') return undefined;
  if (!isVapidKeyPair(publicKey, privateKey)) return undefined;
  return { publicKey, privateKey, subject };
}

/**
 * Whether `publicKey` and `privateKey` have a VAPID pair's shape: an uncompressed P-256 point (65
 * bytes, starting 0x04) and a 32-byte scalar, base64url. The push service checks the signature;
 * this only refuses what is plainly not a pair.
 */
export function isVapidKeyPair(publicKey: string, privateKey: string): boolean {
  try {
    const pub = Buffer.from(publicKey, 'base64url');
    const priv = Buffer.from(privateKey, 'base64url');
    return pub.length === 65 && pub[0] === 0x04 && priv.length === 32;
  } catch {
    return false;
  }
}

/** What a send records: the row's outcomes live in `apps/api/src/db/endpoints.ts`. */
export interface PushOutcomeStore {
  success(id: string, at: Date): Promise<void>;
  /** Records a failure; `revoked` says whether this one revoked the device. */
  failure(
    id: string,
    status: number | undefined,
    at: Date,
  ): Promise<{ userId: string; revoked: boolean } | null>;
  /**
   * Revokes a device whose endpoint is off the push services' list (one stored before the list):
   * true when this call revoked it, so `push_disabled` fires once.
   */
  revoke(id: string, userId: string, at: Date): Promise<boolean>;
}

export interface WebPushPost {
  (
    url: string,
    init: { method: string; headers: Record<string, string>; body: Buffer },
  ): Promise<{
    ok: boolean;
    status: number;
  }>;
}

const TIMEOUT_MS = 10_000;

/**
 * POSTs a built push request with `fetch`. A redirect is never followed (architecture §7.10): it
 * rejects, so the send counts as failed, and the push service cannot send NetNet's function on to
 * an address of its choosing.
 */
export function fetchPost(post: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): WebPushPost {
  return async (url, init) => {
    const res = await post(url, {
      method: init.method,
      headers: init.headers,
      // A plain view: `fetch` takes it under every lib, where `Buffer` quibbles.
      body: new Uint8Array(init.body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    return { ok: res.ok, status: res.status };
  };
}

export interface WebPushChannelOptions {
  vapid: VapidConfig;
  post: WebPushPost;
  store: PushOutcomeStore;
  track: Track;
  appVersion: () => string;
  clock?: () => Date;
  /**
   * The push services it sends to (architecture §7.10): `PUSH_SERVICE_HOSTS` in production,
   * never read from the environment; tests pass a fake service's host.
   */
  pushHosts: readonly string[];
}

/**
 * The channel over the `web-push` library: it builds each send's request (encryption, VAPID
 * signature, TTL, urgency) and `post` delivers it. A refusal or a network failure is a result,
 * never a throw, and is recorded on the row — except building the request itself failing, which
 * is our bug or a malformed subscription, and counts as failed without touching the count. An
 * endpoint off the list is never sent to: the device is revoked, as for a `410`.
 */
export function webPushChannel(options: WebPushChannelOptions): PushChannel {
  const clock = options.clock ?? (() => new Date());
  const disabledByBrowser = (to: PushEndpoint, userId: string) =>
    options.track(
      'push_disabled',
      { platform: to.platform, by: 'browser' },
      { userId, appVersion: options.appVersion() },
    );
  return {
    id: 'webpush',
    async send(to: PushEndpoint, rendered: RenderedPush): Promise<SendResult> {
      if (!isPushServiceUrl(to.subscription.endpoint, options.pushHosts)) {
        if (await options.store.revoke(to.id, to.userId, clock())) {
          await disabledByBrowser(to, to.userId);
        }
        log('push_endpoint_off_list', { userId: to.userId });
        return { ok: false };
      }
      let request: { endpoint: string; headers: Record<string, string>; body: Buffer };
      try {
        const built = webpush.generateRequestDetails(
          {
            endpoint: to.subscription.endpoint,
            keys: { p256dh: to.subscription.p256dh, auth: to.subscription.auth },
          },
          buildWebPushPayload(rendered),
          {
            TTL: to.ttlSeconds,
            urgency: 'normal',
            contentEncoding: 'aes128gcm',
            vapidDetails: {
              subject: options.vapid.subject,
              publicKey: options.vapid.publicKey,
              privateKey: options.vapid.privateKey,
            },
          },
        );
        // The library types its headers as strings but sends TTL and Content-Length as
        // numbers; `fetch` wants strings.
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(built.headers)) headers[name] = String(value);
        request = { endpoint: built.endpoint, headers, body: built.body };
      } catch {
        // Our bug or a malformed subscription: failed, but not the device's fault.
        return failed(to);
      }
      let status: number | undefined;
      let ok: boolean;
      try {
        const res = await options.post(request.endpoint, {
          method: 'POST',
          headers: request.headers,
          body: request.body,
        });
        status = res.status;
        ok = res.ok;
      } catch {
        ok = false;
      }
      const at = clock();
      if (ok) {
        await options.store.success(to.id, at);
        return { ok: true };
      }
      const outcome = await options.store.failure(to.id, status, at);
      if (outcome !== null && outcome.revoked) await disabledByBrowser(to, outcome.userId);
      if (status !== undefined) {
        log('push_send_failed', { userId: to.userId, status, errorCode: 'INTERNAL' });
      } else {
        log('push_send_failed', { userId: to.userId, errorCode: 'INTERNAL' });
      }
      return status === undefined ? { ok: false } : { ok: false, status };
    },
  };
}

function failed(to: PushEndpoint): SendResult {
  log('push_send_failed', { userId: to.userId, errorCode: 'INTERNAL' });
  return { ok: false };
}

/**
 * The channel for this environment, or undefined without the VAPID keys (F19): then `notify()`'s
 * push wiring stays absent and reminders go by email, exactly as before P3-T6.
 */
export function webPushChannelFromEnv(
  deps: Omit<WebPushChannelOptions, 'vapid'>,
  env: NodeJS.ProcessEnv = process.env,
): PushChannel | undefined {
  const vapid = vapidConfig(env);
  if (vapid === undefined) return undefined;
  return webPushChannel({ ...deps, vapid });
}
