/**
 * A channel carries a rendered message to one place (architecture §7.10): email, web push (P3-T6)
 * and native push with the Expo apps. `notify()` chooses the channel; a channel only sends.
 */
export type ChannelId = 'email' | 'webpush' | 'expo';

/** Where an email goes: the account's address. Never logged, tracked or put in a message. */
export interface Address {
  email: string;
}

/** An email as a template renders it. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

/**
 * The outcome of one send. `captured` means a stand-in kept it instead of sending it (tests, and
 * previews for addresses not on `EMAIL_PREVIEW_ALLOW`). `status` is the provider's HTTP status
 * when it refused, absent when it could not be reached.
 */
export type SendResult = { ok: true; captured?: boolean } | { ok: false; status?: number };

export interface Channel<To, Rendered> {
  readonly id: ChannelId;
  send(to: To, rendered: Rendered): Promise<SendResult>;
}

export interface EmailChannel extends Channel<Address, RenderedEmail> {
  readonly id: 'email';
}

/**
 * A push notification as a template renders it: the title, one body line, and where a tap goes
 * (the reminder's `?r=` link). P3-T6's `webpush` channel wraps it in the wire payload, encrypts
 * it per device and signs it with the VAPID key.
 */
export interface RenderedPush {
  title: string;
  body: string;
  url: string;
}

/**
 * A device push goes to. P3-T6's `notification_endpoint` row stands behind it; until then a test
 * fake. The id is the endpoint's, for revocation on `404`/`410`.
 */
export interface PushEndpoint {
  id: string;
}

export interface PushChannel extends Channel<PushEndpoint, RenderedPush> {
  readonly id: 'webpush' | 'expo';
}
