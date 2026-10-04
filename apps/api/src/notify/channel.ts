/**
 * A channel carries a rendered message to one place (architecture §7.10): email now, web push with
 * the comeback reminder (P3), native push with the Expo apps. `notify()` chooses the channel;
 * a channel only sends.
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
