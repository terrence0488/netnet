import { Hono } from 'hono';
import { eventsRoutes, type EventsDeps } from '../../src/http/events';
import type { AppEnv, SessionUser } from '../../src/lib/context';
import { handleError, handleNotFound } from '../../src/lib/error-handler';
import { requestContext } from '../../src/lib/request-context';
import { sessionContext } from '../../src/lib/session';

/**
 * `POST /api/events` wired as app.ts wires it, over the given dependencies, with a fake session:
 * whoever `signedIn()` names at the time of the request, or nobody.
 */
export function eventsApp(deps: EventsDeps, signedIn: () => SessionUser | null): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    sessionContext(() => Promise.resolve(signedIn())),
  );
  app.route('/api/events', eventsRoutes(deps));
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}

/** Sends `body` (JSON unless it is already a string) from `ip`. */
export function postEvent(app: Hono<AppEnv>, body: unknown, ip = '192.0.2.10'): Promise<Response> {
  return Promise.resolve(
    app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}
