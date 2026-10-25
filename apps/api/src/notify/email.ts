import { log } from '../lib/log';
import type { Address, EmailChannel, RenderedEmail, SendResult } from './channel';

/**
 * The email channel (architecture §7.10): Resend's HTTP API, called with `fetch`, so no SDK. Tests
 * never send: they use `captureChannel()`. A preview sends only to the addresses on
 * `EMAIL_PREVIEW_ALLOW` and captures the rest (F10).
 */

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export interface ResendOptions {
  /** `RESEND_API_KEY`. */
  apiKey: string;
  /** `EMAIL_FROM`, such as `NetNet <hello@‹domain›>`. */
  from: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Sends through Resend. A refusal or a network failure is a result, never a throw. */
export function resendChannel(options: ResendOptions): EmailChannel {
  const send = options.fetch ?? fetch;
  return {
    id: 'email',
    async send(to: Address, rendered: RenderedEmail): Promise<SendResult> {
      const body = {
        from: options.from,
        to: [to.email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(Object.keys(rendered.headers).length > 0 ? { headers: rendered.headers } : {}),
      };
      try {
        const res = await send(RESEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
        });
        // The body is Resend's id or its error; neither is needed, and neither is logged.
        await res.body?.cancel();
        return res.ok ? { ok: true } : { ok: false, status: res.status };
      } catch {
        return { ok: false };
      }
    },
  };
}

export interface CapturedEmail {
  to: string;
  rendered: RenderedEmail;
}
export interface CaptureChannel extends EmailChannel {
  /** The latest messages, oldest first; at most `keep`. */
  readonly captured: readonly CapturedEmail[];
}

/**
 * Keeps messages instead of sending them, and logs that it did without the address or a word of
 * the content. Tests read `captured`; a preview's instance keeps at most `keep` in memory.
 */
export function captureChannel(keep = 50): CaptureChannel {
  const captured: CapturedEmail[] = [];
  return {
    id: 'email',
    captured,
    send(to, rendered) {
      captured.push({ to: to.email, rendered });
      if (captured.length > keep) captured.splice(0, captured.length - keep);
      log('email_captured');
      return Promise.resolve({ ok: true, captured: true });
    },
  };
}

/**
 * Counts every send Resend accepts, and only those (architecture §7.10, §9.4; P4-T4): the day's
 * allowance is what Resend actually took, so a captured message (a test, or a preview's
 * non-allowed address) and a refusal spend nothing. A failed count never turns a delivered email
 * into a failure: it is logged, and the send keeps its result.
 */
export function countedChannel(
  channel: EmailChannel,
  record: (at: Date) => Promise<void>,
  clock: () => Date = () => new Date(),
): EmailChannel {
  return {
    id: 'email',
    async send(to, rendered) {
      const result = await channel.send(to, rendered);
      if (result.ok && result.captured !== true) {
        try {
          await record(clock());
        } catch {
          log('email_count_failed', { errorCode: 'INTERNAL' });
        }
      }
      return result;
    },
  };
}

/** Sends to the addresses on `allow` through `real`; captures every other. */
export function allowListChannel(
  allow: ReadonlySet<string>,
  real: EmailChannel,
  capture: EmailChannel,
): EmailChannel {
  return {
    id: 'email',
    send: (to, rendered) => (allow.has(to.email.toLowerCase()) ? real : capture).send(to, rendered),
  };
}

/** `EMAIL_PREVIEW_ALLOW`: addresses separated by commas or spaces, compared in lowercase. */
export function parseAllowList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(/[\s,]+/)
      .map((address) => address.trim().toLowerCase())
      .filter((address) => address.includes('@')),
  );
}

/** Production without its Resend settings: every send fails, and says so in the log. */
const UNCONFIGURED: EmailChannel = {
  id: 'email',
  send() {
    log('email_not_configured', { errorCode: 'INTERNAL' });
    return Promise.resolve({ ok: false });
  },
};

/**
 * The email channel for this environment. Production: Resend for everyone. Anywhere else
 * (previews, local runs): Resend only for `EMAIL_PREVIEW_ALLOW`, captured otherwise.
 */
export function emailChannelFromEnv(env: NodeJS.ProcessEnv = process.env): EmailChannel {
  const apiKey = env.RESEND_API_KEY ?? '';
  const from = env.EMAIL_FROM ?? '';
  const real = apiKey !== '' && from !== '' ? resendChannel({ apiKey, from }) : undefined;
  if (env.VERCEL_ENV === 'production') return real ?? UNCONFIGURED;
  const capture = captureChannel();
  const allow = parseAllowList(env.EMAIL_PREVIEW_ALLOW);
  return real && allow.size > 0 ? allowListChannel(allow, real, capture) : capture;
}
