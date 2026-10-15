import { reminderTokenSchema } from '@netnet/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { database, type Executor } from '../db/client';
import { getReminderState, markReminderOpened, setEmailReminders } from '../db/reminders';
import { appVersion } from '../events/app-version';
import { track, type Track } from '../events/track';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { clientIp, rateLimit, type RateLimit } from '../lib/rate-limit';
import { linkSecret, verifyReminderToken, type ReminderClaims } from '../notify/links';

/**
 * `/api/reminders/*` (architecture §7.2, PRD J12): what the reminder's signed links do. Neither
 * route needs a session — the token is the authority — and neither signs anyone in, counts as a
 * check, or touches the session. `opened` fires `reminder_opened {channel}` for the first open of
 * each reminder; `unsubscribe` turns email reminders off, and is the `List-Unsubscribe-Post`
 * target, so it also takes the token as `?token=`.
 */

export interface RemindersDeps {
  db: () => Executor;
  track: Track;
  rateLimit: RateLimit;
  appVersion: () => string;
  clock: () => Date;
  /** `LINK_SIGNING_SECRET`; unset (F19), every token is refused. */
  secret: () => string | undefined;
}

/** A token is a few hundred characters at most. */
const MAX_BODY_BYTES = 2048;

/** Per IP address, in a fixed one-minute window: guessing a token is hopeless, but cheap to try. */
export const REMINDERS_PER_MINUTE_PER_IP = 60;

function invalid(fields: Record<string, string>): AppError {
  return new AppError('VALIDATION_FAILED', 'Nothing was changed; fields says why.', { fields });
}

function unknownLink(): AppError {
  return new AppError(
    'NOT_FOUND',
    'That reminder link is unknown or has expired. Links last 60 days.',
  );
}

/** The body as `{token}`, or an empty object when it is not JSON (a one-click POST has no JSON). */
async function readTokenBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json<unknown>();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The request's token: the query's for a one-click POST (whose body is no JSON object), else the body's, strictly. */
function tokenOf(c: Context<AppEnv>, body: Record<string, unknown>): string {
  const query = new URL(c.req.url).searchParams.get('token');
  const parsed =
    query === null
      ? reminderTokenSchema.safeParse(body)
      : reminderTokenSchema.safeParse({ token: query });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fields[issue.path.map(String).join('.') || 'token'] = issue.message;
    }
    throw invalid(fields);
  }
  return parsed.data.token;
}

async function verifiedToken(
  deps: RemindersDeps,
  c: Context<AppEnv>,
  body: Record<string, unknown>,
): Promise<ReminderClaims> {
  await deps.rateLimit(`reminders:ip:${clientIp(c)}`, REMINDERS_PER_MINUTE_PER_IP, 60);
  const claims = verifyReminderToken(deps.secret(), tokenOf(c, body), deps.clock());
  if (claims === null) throw unknownLink();
  const state = await getReminderState(deps.db(), claims.userId);
  if (state === null) throw unknownLink();
  return claims;
}

export function remindersRoutes(
  deps: RemindersDeps = {
    db: database,
    track,
    rateLimit,
    appVersion,
    clock: () => new Date(),
    secret: linkSecret,
  },
): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const smallBody = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw invalid({ body: `Send at most ${MAX_BODY_BYTES} bytes.` });
    },
  });

  routes.post('/opened', smallBody, async (c) => {
    const claims = await verifiedToken(deps, c, await readTokenBody(c));
    const first = await markReminderOpened(deps.db(), claims.userId, new Date(claims.sentAt));
    if (first) {
      await deps.track(
        'reminder_opened',
        { channel: claims.channel },
        { userId: claims.userId, appVersion: deps.appVersion() },
      );
    }
    return c.body(null, 204);
  });

  routes.post('/unsubscribe', smallBody, async (c) => {
    const claims = await verifiedToken(deps, c, await readTokenBody(c));
    await setEmailReminders(deps.db(), claims.userId, false);
    return c.body(null, 204);
  });

  return routes;
}
