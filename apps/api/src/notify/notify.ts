import { database } from '../db/client';
import { accountOf, type Account } from '../db/profiles';
import { publicOrigin } from '../lib/env';
import { log } from '../lib/log';
import type { EmailChannel } from './channel';
import { emailChannelFromEnv } from './email';
import type { Delivery, MessageKind, Notify } from './message';
import { renderEmail } from './templates';

/**
 * `notify(userId, msg)`: the only way NetNet reaches a person (architecture §7.10, CONVENTIONS §6).
 * It finds where the message may go, renders it from its typed parameters and sends it. It never
 * throws and never logs an address or a word of the message: a failure is a `Delivery` with a
 * reason, and one log line with the user id.
 */

/**
 * How each kind travels (architecture §7.10's table). The account's emails go by email only, to
 * the account's address whether or not it is verified (verifying it is what one of them is for),
 * and ignore the Reminders switches. Push and the switches come with the comeback reminder (P3).
 */
interface Route {
  email: { verifiedOnly: boolean };
}

const ROUTES: { [K in MessageKind]: Route } = {
  'account.verify_email': { email: { verifiedOnly: false } },
  'account.reset_password': { email: { verifiedOnly: false } },
};

export interface NotifyDeps {
  /** The account's address and whether it is verified, or null when there is no account. */
  recipient: (userId: string) => Promise<Account | null>;
  email: EmailChannel;
  /** Where links in a message point (`publicOrigin()`). */
  origin: string;
}

function failed(userId: string, status?: number): Delivery {
  log('notify_failed', { userId, errorCode: 'INTERNAL', ...(status ? { status } : {}) });
  return { channel: null, reason: 'failed' };
}

export function createNotify(deps: () => NotifyDeps): Notify {
  return async (userId, msg) => {
    try {
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

export const notify: Notify = createNotify(() => ({
  recipient: (userId) => accountOf(database(), userId),
  email: (sharedEmail ??= emailChannelFromEnv()),
  origin: publicOrigin(),
}));
