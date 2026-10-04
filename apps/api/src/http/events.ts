import {
  CLIENT_EVENT_NAMES,
  SESSIONLESS_EVENT_NAMES,
  eventSchemas,
  isClientEventName,
  isEventName,
  isSessionlessEventName,
  type ClientEventName,
  type EventProps,
} from '@netnet/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { appVersion } from '../events/app-version';
import { track, type Track } from '../events/track';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { clientIp, rateLimit, type RateLimit } from '../lib/rate-limit';

/**
 * `POST /api/events {name, props}` → 204 (architecture §7.2, §7.7): the web app's client-side
 * events. Only the names §7.7 marks *client* are accepted, and without a session only
 * `signup_started`. The event is written after the response.
 */

/** Per IP address, in a fixed one-minute window. */
export const EVENTS_PER_MINUTE_PER_IP = 60;

/** An event is a name and a few enum props; anything bigger is not one. */
const MAX_BODY_BYTES = 2048;

const ACCEPTED = CLIENT_EVENT_NAMES.join(', ');
const SESSIONLESS = SESSIONLESS_EVENT_NAMES.join(', ');

export interface EventsDeps {
  track: Track;
  rateLimit: RateLimit;
  appVersion: () => string;
}

function invalid(fields: Record<string, string>): AppError {
  return new AppError(
    'VALIDATION_FAILED',
    'This is not an event the app can send; fields says what to change.',
    { fields },
  );
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw invalid({ body: 'Send a JSON object: {"name": …, "props": {…}}.' });
  }
}

interface ClientEventInput {
  name: ClientEventName;
  props: EventProps<ClientEventName>;
}

/** The body as one client event, or VALIDATION_FAILED naming each field to change. */
function parseClientEvent(body: unknown): ClientEventInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid({ body: 'Send a JSON object: {"name": …, "props": {…}}.' });
  }
  const { name, props = {}, ...rest } = body as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length > 0) {
    throw invalid(Object.fromEntries(extra.map((key) => [key, 'Remove it: send name and props.'])));
  }
  if (!isClientEventName(name)) {
    throw invalid({
      name: isEventName(name)
        ? `${name} is recorded by the server. The app sends only ${ACCEPTED}.`
        : `Use one of ${ACCEPTED}.`,
    });
  }
  const parsed = eventSchemas[name].safeParse(props);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          fields[`props.${key}`] = `${name} has no such prop; remove it.`;
        }
      } else {
        fields[['props', ...issue.path.map(String)].join('.')] = issue.message;
      }
    }
    throw invalid(fields);
  }
  return { name, props: parsed.data };
}

export function eventsRoutes(deps: EventsDeps = { track, rateLimit, appVersion }): Hono<AppEnv> {
  return new Hono<AppEnv>().post(
    '/',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw invalid({ body: `Send at most ${MAX_BODY_BYTES} bytes: one event.` });
      },
    }),
    async (c) => {
      const event = parseClientEvent(await readJson(c));
      await deps.rateLimit(`events:ip:${clientIp(c)}`, EVENTS_PER_MINUTE_PER_IP, 60);
      const user = await c.var.session();
      if (user === null && !isSessionlessEventName(event.name)) {
        throw invalid({
          name: `${event.name} needs a signed-in session. Without one, only ${SESSIONLESS} is accepted.`,
        });
      }
      afterResponse(
        c,
        deps.track(event.name, event.props, {
          userId: user?.userId,
          segment: user?.segment,
          appVersion: deps.appVersion(),
        }),
      );
      return c.body(null, 204);
    },
  );
}
