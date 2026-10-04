import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, SessionUser } from './context';

/** Reads the request's session: the person it belongs to, or null. */
export type ResolveSession = (c: Context<AppEnv>) => Promise<SessionUser | null>;

/** Nobody is signed in. The app's resolver until sessions exist (P1-T11 replaces it in app.ts). */
export const noSession: ResolveSession = () => Promise.resolve(null);

/**
 * Puts `c.var.session()` on every request. Nothing is read until a route asks, and then only once
 * per request, so routes that need no session pay nothing for it.
 */
export function sessionContext(resolve: ResolveSession): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let pending: Promise<SessionUser | null> | undefined;
    c.set('session', () => (pending ??= resolve(c)));
    await next();
  };
}
