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
import { visitor, type Visitor, type VisitorRequest } from '../db/visitor';
import { appVersion } from '../events/app-version';
import { track, type Track } from '../events/track';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { clientIp, rateLimit, type RateLimit } from '../lib/rate-limit';

/**
 * `POST /api/events {name, props}` → 204 (architecture §7.2, §7.7): the landing page's and the
 * web app's client-side events. Only the names §7.7 marks *client* are accepted, and without a
 * session only `landing_view` and `signup_started`. The event is written after the response.
 *
 * `landing_view` never reads the session: it carries no user id and segment `unknown`, and the
 * server fills its `visitor` from the request's address and user agent and today's salt (§6.4).
 * No other event gets a `visitor`.
 */

/** Per IP address, in a fixed one-minute window. */
export const EVENTS_PER_MINUTE_PER_IP = 60;

/** An event is a name and a few enum props; anything bigger is not one. */
const MAX_BODY_BYTES = 2048;

const ACCEPTED = CLIENT_EVENT_NAMES.join(', ');
const SESSIONLESS = SESSIONLESS_EVENT_NAMES.join(' and ');

export interface EventsDeps {
  track: Track;
  rateLimit: RateLimit;
  appVersion: () => string;
  /** `landing_view`'s visitor hash for a request. */
  visitor: Visitor;
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

/** `landing_view`, written as nobody's: the hash first, then the event. */
async function landingView(deps: EventsDeps, request: VisitorRequest): Promise<void> {
  const hash = await deps.visitor(request);
  await deps.track('landing_view', {}, { visitor: hash, appVersion: deps.appVersion() });
}

export function eventsRoutes(
  deps: EventsDeps = { track, rateLimit, appVersion, visitor },
): Hono<AppEnv> {
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
      const ip = clientIp(c);
      await deps.rateLimit(`events:ip:${ip}`, EVENTS_PER_MINUTE_PER_IP, 60);
      if (event.name === 'landing_view') {
        afterResponse(c, landingView(deps, { ip, userAgent: c.req.header('User-Agent') ?? '' }));
        return c.body(null, 204);
      }
      const user = await c.var.session();
      if (user === null && !isSessionlessEventName(event.name)) {
        throw invalid({
          name: `${event.name} needs a signed-in session. Without one, only ${SESSIONLESS} are accepted.`,
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
