import {
  endpointRevokeBySchema,
  notificationEndpointCreateSchema,
  notificationEndpointUpdateSchema,
  notificationPrefsPatchSchema,
  type NotificationPrefs,
} from '@netnet/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireSession } from '../auth/session';
import { database, type Executor } from '../db/client';
import { listActiveEndpoints, revokeEndpoint, saveEndpoint, touchEndpoint } from '../db/endpoints';
import { accountOf } from '../db/profiles';
import { getReminderState, setEmailReminders, setRemindersEnabled } from '../db/reminders';
import { appVersion } from '../events/app-version';
import { track, type Track } from '../events/track';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { log } from '../lib/log';
import { routeOf } from '../lib/request-context';
import { vapidConfig, type VapidConfig } from '../notify/webpush';

/**
 * `/api/notifications/*` (architecture §7.2, PRD J12): the Reminders switches, the VAPID public
 * key, and the push endpoints — one row per device where push is on. Every route needs a session;
 * the user is the session's, never one named in the request (CONVENTIONS §3). `push_enabled` and
 * `push_disabled {by: user|signout}` fire after the response; `{by: browser}` is the channel's.
 */

export interface NotificationsDeps {
  db: () => Executor;
  track: Track;
  appVersion: () => string;
  clock: () => Date;
  /** The VAPID keys (F19): unset until the Founder sets them, so push fails closed. */
  vapid: () => VapidConfig | undefined;
}

/** A subscription is a long URL plus two keys; a prefs patch is two booleans. */
const MAX_SUBSCRIPTION_BYTES = 4096;
const MAX_PREFS_BYTES = 1024;

function invalid(fields: Record<string, string>): AppError {
  return new AppError('VALIDATION_FAILED', 'Nothing was changed; fields says why.', { fields });
}

/**
 * Without the VAPID keys (F19) push fails closed: the caller gets INTERNAL, and the log names
 * the cause with the request id, so the operator knows what is missing.
 */
function vapidNotConfigured(c: Context<AppEnv>): AppError {
  log('vapid_not_configured', {
    requestId: c.get('requestId'),
    route: routeOf(c),
    errorCode: 'INTERNAL',
  });
  return new AppError(
    'INTERNAL',
    'Web push is not set up on the server yet: it has no VAPID key. Ask the Founder for it (F19).',
  );
}

function unknownDevice(whileDoing: string): AppError {
  return new AppError(
    'NOT_FOUND',
    `That device is unknown or was removed${whileDoing}: unsubscribe locally and show push off.`,
  );
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw invalid({ body: 'Send a JSON object.' });
  }
}

/** The zod issues as `fields`, naming each field and the form it allows. */
function fieldsOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    fields[issue.path.map(String).join('.') || 'body'] = issue.message;
  }
  return fields;
}

async function prefsView(deps: NotificationsDeps, userId: string): Promise<NotificationPrefs> {
  const db = deps.db();
  const [account, state, devices] = await Promise.all([
    accountOf(db, userId),
    getReminderState(db, userId),
    listActiveEndpoints(db, userId),
  ]);
  // The session outlived its account (deleted a moment ago): the same as no session.
  if (account === null) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first: there is no such account.');
  }
  return {
    reminders: state?.enabled ?? true,
    email: state?.emailEnabled ?? true,
    emailVerified: account.emailVerified,
    devices: devices.map((device) => ({
      id: device.id,
      label: device.deviceLabel,
      platform: device.platform,
      lastSeenAt: device.lastSeenAt.toISOString(),
    })),
  };
}

export function notificationsRoutes(
  deps: NotificationsDeps = {
    db: database,
    track,
    appVersion,
    clock: () => new Date(),
    vapid: vapidConfig,
  },
): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const subscriptionBody = bodyLimit({
    maxSize: MAX_SUBSCRIPTION_BYTES,
    onError: () => {
      throw invalid({ body: `Send at most ${MAX_SUBSCRIPTION_BYTES} bytes.` });
    },
  });
  const prefsBody = bodyLimit({
    maxSize: MAX_PREFS_BYTES,
    onError: () => {
      throw invalid({ body: `Send at most ${MAX_PREFS_BYTES} bytes.` });
    },
  });

  routes.get('/prefs', async (c) => {
    const { userId } = await requireSession(c);
    return c.json(await prefsView(deps, userId));
  });

  routes.patch('/prefs', prefsBody, async (c) => {
    const { userId } = await requireSession(c);
    const parsed = notificationPrefsPatchSchema.safeParse(await readJson(c));
    if (!parsed.success) throw invalid(fieldsOf(parsed.error));
    const db = deps.db();
    if (parsed.data.reminders !== undefined) {
      await setRemindersEnabled(db, userId, parsed.data.reminders);
    }
    if (parsed.data.email !== undefined) {
      await setEmailReminders(db, userId, parsed.data.email);
    }
    return c.json(await prefsView(deps, userId));
  });

  routes.get('/vapid-key', async (c) => {
    await requireSession(c);
    const vapid = deps.vapid();
    if (vapid === undefined) throw vapidNotConfigured(c);
    return c.json({ publicKey: vapid.publicKey });
  });

  routes.post('/endpoints', subscriptionBody, async (c) => {
    const { userId } = await requireSession(c);
    if (deps.vapid() === undefined) throw vapidNotConfigured(c);
    const parsed = notificationEndpointCreateSchema.safeParse(await readJson(c));
    if (!parsed.success) throw invalid(fieldsOf(parsed.error));
    const saved = await saveEndpoint(deps.db(), userId, parsed.data, deps.clock());
    if (saved.created || saved.reactivated) {
      afterResponse(
        c,
        deps.track(
          'push_enabled',
          { platform: parsed.data.platform },
          { userId, appVersion: deps.appVersion() },
        ),
      );
    }
    return c.json({ id: saved.id });
  });

  routes.put('/endpoints/:id', subscriptionBody, async (c) => {
    const { userId } = await requireSession(c);
    const parsed = notificationEndpointUpdateSchema.safeParse(await readJson(c));
    if (!parsed.success) throw invalid(fieldsOf(parsed.error));
    const touched = await touchEndpoint(
      deps.db(),
      userId,
      c.req.param('id'),
      parsed.data,
      deps.clock(),
    );
    if (!touched) throw unknownDevice(' — a session started on a device that was removed');
    return c.body(null, 204);
  });

  routes.delete('/endpoints/:id', async (c) => {
    const { userId } = await requireSession(c);
    const by = endpointRevokeBySchema.safeParse(new URL(c.req.url).searchParams.get('by'));
    if (!by.success) {
      throw invalid({
        by: 'Send ?by=user when the person turns push off or removes the device, ?by=signout when they sign out on it.',
      });
    }
    const revoked = await revokeEndpoint(deps.db(), userId, c.req.param('id'), deps.clock());
    if (revoked === null) throw unknownDevice('');
    afterResponse(
      c,
      deps.track(
        'push_disabled',
        { platform: revoked.platform, by: by.data },
        { userId, appVersion: deps.appVersion() },
      ),
    );
    return c.body(null, 204);
  });

  return routes;
}
