import type { AgentGuide } from '@netnet/contracts';
import type { Handler } from 'hono';
import { agent } from '../auth/agent';
import type { Client } from '../auth/classify';
import { contentStore } from '../content/store';
import { database, type Executor } from '../db/client';
import { claimDueReminders, mostRecentlyUsedConnection, releaseReminder } from '../db/reminders';
import { track, type Track } from '../events/track';
import { appVersion } from '../events/app-version';
import type { AppEnv } from '../lib/context';
import { log } from '../lib/log';
import { routeOf } from '../lib/request-context';
import type { Notify } from '../notify/message';
import { notify } from '../notify/notify';
import { containsMoneyFigure } from '../notify/privacy';

/**
 * A reminder run (architecture §7.10): `GET /api/cron/reminders`, three times a day (§9.3). It
 * claims everyone due and awake, sends each through `notify()` (recording `reminder_sent
 * {channel}`), releases the claims nothing could be delivered for, and retries the security
 * emails Resend has not accepted. A failed send stays unsent for the next run; the run answers
 * 502 when a security email failed, so the cron shows it.
 */

/** A registered name plain enough for the "Just ask" line: ≤24 letters, digits, spaces and .- */
const PLAIN_NAME = /^[A-Za-z0-9 .-]{1,24}$/;

/**
 * The agent the reminder names: the guide's name for `claude` and `chatgpt`, the registered name
 * for `other` only when short and plain — otherwise the line is left out, and a lock screen never
 * shows untrusted text. A name that reads as money ("USD5", "10 pounds") is not plain: it would
 * trip the privacy test on the rendered message, so the line is left out for it too.
 */
export function reminderAgentName(
  client: Client,
  registeredName: string,
  guideName: string | undefined,
): string | undefined {
  if (client === 'other') {
    return PLAIN_NAME.test(registeredName) && !containsMoneyFigure(registeredName)
      ? registeredName
      : undefined;
  }
  return guideName;
}

export interface RemindersService {
  db: () => Executor;
  clock: () => Date;
  notify: Notify;
  track: Track;
  appVersion: () => string;
  /** The live guide's name for a named agent, or undefined when no guide is published. */
  guideName: (client: 'claude' | 'chatgpt') => Promise<string | undefined>;
  /** The retry (§7.10 step 4): every unsent security email from 10 minutes to 7 days old. */
  retrySecurityEmails: () => Promise<{ sent: number; failed: number }>;
}

export interface ReminderRunResult {
  reminders: { push: number; email: number; released: number };
  securityEmails: { sent: number; failed: number };
}

async function agentNameOf(service: RemindersService, userId: string): Promise<string | undefined> {
  const connection = await mostRecentlyUsedConnection(service.db(), userId);
  if (connection === null) return undefined;
  const guide =
    connection.client === 'other' ? undefined : await service.guideName(connection.client);
  return reminderAgentName(connection.client, connection.clientName, guide);
}

export async function runReminders(service: RemindersService): Promise<ReminderRunResult> {
  const db = service.db();
  const at = service.clock();
  const claimed = await claimDueReminders(db, at);
  let push = 0;
  let email = 0;
  let released = 0;
  for (const next of claimed) {
    const name = await agentNameOf(service, next.userId);
    const delivery = await service.notify(next.userId, {
      kind: 'reminder.comeback',
      ...(name === undefined ? {} : { agentName: name }),
    });
    if (delivery.channel === null) {
      await releaseReminder(db, next.userId, next);
      released += 1;
      continue;
    }
    if (delivery.channel === 'push') push += 1;
    else email += 1;
    await service.track(
      'reminder_sent',
      { channel: delivery.channel },
      { userId: next.userId, appVersion: service.appVersion() },
    );
  }
  const securityEmails = await service.retrySecurityEmails();
  return { reminders: { push, email, released }, securityEmails };
}

async function liveGuideName(client: 'claude' | 'chatgpt'): Promise<string | undefined> {
  try {
    return ((await contentStore().getCurrent('agent', client)).body as AgentGuide).name;
  } catch {
    return undefined;
  }
}

function remindersService(): RemindersService {
  return {
    db: database,
    clock: () => new Date(),
    notify,
    track,
    appVersion,
    guideName: liveGuideName,
    retrySecurityEmails: () => agent().connections.retrySecurityEmails(),
  };
}

export function remindersJob(service: () => RemindersService = remindersService): Handler<AppEnv> {
  return async (c) => {
    const result = await runReminders(service());
    if (result.securityEmails.failed > 0) {
      log('security_email_retry_failed', { requestId: c.get('requestId'), route: routeOf(c) });
    }
    return c.json(result, result.securityEmails.failed > 0 ? 502 : 200);
  };
}
