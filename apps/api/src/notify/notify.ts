import { database } from '../db/client';
import { activePushTargets, recordPushFailure, recordPushSuccess } from '../db/endpoints';
import { accountOf, type Account } from '../db/profiles';
import { countReminderEmailsToday, getReminderState, recordReminderSent } from '../db/reminders';
import { appVersion } from '../events/app-version';
import { track } from '../events/track';
import { publicOrigin } from '../lib/env';
import { log } from '../lib/log';
import type { EmailChannel, PushChannel, PushEndpoint } from './channel';
import { emailChannelFromEnv } from './email';
import { linkSecret, signReminderToken } from './links';
import type { Delivery, MessageKind, MessageOf, Notify } from './message';
import { renderEmail, renderPush } from './templates';
import { fetchPost, webPushChannelFromEnv } from './webpush';

/**
 * `notify(userId, msg)`: the only way NetNet reaches a person (architecture §7.10, CONVENTIONS §6).
 * It finds where the message may go, renders it from its typed parameters and sends it. It never
 * throws and never logs an address or a word of the message: a failure is a `Delivery` with a
 * reason, and one log line with the user id.
 */

/**
 * How each email-only kind travels (architecture §7.10's table). The account's emails and the
 * security email go to the account's address whether or not it is verified (verifying it is what
 * one of them is for; the security email is always sent), and ignore the Reminders switches. The
 * comeback reminder travels push-first below, not through this map.
 */
interface Route {
  email: { verifiedOnly: boolean };
}

const ROUTES: { [K in Exclude<MessageKind, 'reminder.comeback'>]: Route } = {
  'account.verify_email': { email: { verifiedOnly: false } },
  'account.reset_password': { email: { verifiedOnly: false } },
  'security.agent_connected': { email: { verifiedOnly: false } },
};

/** Reminder emails stop at 60 per UTC day; anyone past that is released for the next run (§7.10). */
export const REMINDER_EMAILS_PER_DAY = 60;

/** What the comeback reminder's routing needs besides the channels. */
export interface ReminderDeps {
  /** The person's switches and the run's claim (`lastSentAt`), or null when there is no clock. */
  state: (userId: string) => Promise<{
    enabled: boolean;
    emailEnabled: boolean;
    lastSentAt: Date | null;
  } | null>;
  /** Records what a delivered reminder went by. */
  sent: (userId: string, channel: 'push' | 'email') => Promise<void>;
  /** Whether another reminder email may go out this UTC day. */
  emailBudgetLeft: () => Promise<boolean>;
  /** Signs the `?r=` token, or null without `LINK_SIGNING_SECRET` (F19): fail closed. */
  sign: (userId: string, channel: 'push' | 'email', sentAt: string) => string | null;
  /**
   * Push devices and the channel. Absent without the VAPID keys (F19), which means no devices,
   * so the reminder goes by email.
   */
  push?:
    { endpoints: (userId: string) => Promise<PushEndpoint[]>; channel: PushChannel } | undefined;
}

export interface NotifyDeps {
  /** The account's address and whether it is verified, or null when there is no account. */
  recipient: (userId: string) => Promise<Account | null>;
  email: EmailChannel;
  /** Where links in a message point (`publicOrigin()`). */
  origin: string;
  reminders: ReminderDeps;
}

function failed(userId: string, status?: number): Delivery {
  log('notify_failed', { userId, errorCode: 'INTERNAL', ...(status ? { status } : {}) });
  return { channel: null, reason: 'failed' };
}

/** Without `LINK_SIGNING_SECRET` no reminder link works, so no reminder goes (F19). */
function linksNotConfigured(userId: string): Delivery {
  log('link_signing_not_configured', { userId, errorCode: 'INTERNAL' });
  return { channel: null, reason: 'failed' };
}

/**
 * The comeback reminder (§7.10's table): push to every active device in parallel, and email only
 * when there is none or every push failed — to a verified address with email reminders on, while
 * the day's budget lasts. Reminders off means nothing by any channel. Each send links the
 * reminder's own signed token, minted once the channel is chosen.
 */
async function sendReminder(
  deps: NotifyDeps,
  userId: string,
  msg: MessageOf<'reminder.comeback'>,
): Promise<Delivery> {
  const state = await deps.reminders.state(userId);
  if (state === null) return { channel: null, reason: 'nowhere' };
  if (!state.enabled) return { channel: null, reason: 'off' };
  if (state.lastSentAt === null) return failed(userId);
  const sentAt = state.lastSentAt.toISOString();
  const push = deps.reminders.push;
  const endpoints = push === undefined ? [] : await push.endpoints(userId);
  if (endpoints.length > 0 && push !== undefined) {
    const token = deps.reminders.sign(userId, 'push', sentAt);
    if (token === null) return linksNotConfigured(userId);
    const rendered = renderPush(msg, { origin: deps.origin, token });
    const results = await Promise.all(
      endpoints.map((to) =>
        push.channel.send(to, rendered).then(
          (result) => result.ok,
          () => false,
        ),
      ),
    );
    const devices = results.filter((ok) => ok).length;
    if (devices > 0) {
      await deps.reminders.sent(userId, 'push');
      return { channel: 'push', devices };
    }
  }
  if (!state.emailEnabled) return { channel: null, reason: 'off' };
  const account = await deps.recipient(userId);
  if (account === null || !account.emailVerified) return { channel: null, reason: 'nowhere' };
  if (!(await deps.reminders.emailBudgetLeft())) return { channel: null, reason: 'failed' };
  const token = deps.reminders.sign(userId, 'email', sentAt);
  if (token === null) return linksNotConfigured(userId);
  const result = await deps.email.send(
    { email: account.email },
    renderEmail(msg, { origin: deps.origin, token }),
  );
  if (!result.ok) return failed(userId, result.status);
  await deps.reminders.sent(userId, 'email');
  return { channel: 'email' };
}

export function createNotify(deps: () => NotifyDeps): Notify {
  return async (userId, msg) => {
    try {
      if (msg.kind === 'reminder.comeback') return sendReminder(deps(), userId, msg);
      const { recipient, email, origin } = deps();
      const route = ROUTES[msg.kind];
      const account = await recipient(userId);
      if (account === null || (route.email.verifiedOnly && !account.emailVerified)) {
        return { channel: null, reason: 'nowhere' };
      }
      const result = await email.send({ email: account.email }, renderEmail(msg, { origin }));
      return result.ok ? { channel: 'email' } : failed(userId, result.status);
    } catch {
      return failed(userId);
    }
  };
}

let sharedEmail: EmailChannel | undefined;
const sharedPushPost = fetchPost();

/** The live push wiring: the person's devices with their TTLs, and the `webpush` channel. */
function livePush(): ReminderDeps['push'] {
  const channel = webPushChannelFromEnv({
    post: sharedPushPost,
    store: {
      success: (id, at) => recordPushSuccess(database(), id, at),
      failure: (id, status, at) => recordPushFailure(database(), id, status, at),
    },
    track,
    appVersion,
  });
  if (channel === undefined) return undefined;
  return {
    endpoints: async (userId) =>
      (await activePushTargets(database(), userId, new Date())).map((row) => ({
        id: row.id,
        userId: row.userId,
        platform: row.platform,
        subscription: { endpoint: row.endpoint, ...row.keys },
        ttlSeconds: row.ttlSeconds,
      })),
    channel,
  };
}

export const notify: Notify = createNotify(() => ({
  recipient: (userId) => accountOf(database(), userId),
  email: (sharedEmail ??= emailChannelFromEnv()),
  origin: publicOrigin(),
  reminders: {
    state: (userId) => getReminderState(database(), userId),
    sent: (userId, channel) => recordReminderSent(database(), userId, channel),
    emailBudgetLeft: async () =>
      (await countReminderEmailsToday(database(), new Date())) < REMINDER_EMAILS_PER_DAY,
    sign: (userId, channel, sentAt) => signReminderToken(linkSecret(), { userId, channel, sentAt }),
    push: livePush(),
  },
}));
