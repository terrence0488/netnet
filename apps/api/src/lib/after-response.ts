import type { Context } from 'hono';
import type { AppEnv } from './context';
import { log } from './log';
import { routeOf } from './request-context';

/**
 * Where Vercel's Node runtime exposes the current request's `waitUntil`: the mechanism the
 * `@vercel/functions` package wraps, read here directly to spare the dependency.
 */
const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

interface VercelRequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

type ContextHolder = { get?: () => VercelRequestContext | undefined } | undefined;

function vercelRequestContext(): VercelRequestContext {
  const holder = (globalThis as Record<symbol, ContextHolder>)[VERCEL_REQUEST_CONTEXT];
  return holder?.get?.() ?? {};
}

/**
 * Lets `task` finish after the response has gone (architecture §5.1: events are written after the
 * response). On Vercel the function stays alive for it through `waitUntil`; elsewhere (local runs)
 * it simply runs on. It never rejects: a failure is logged with the request id, because the caller
 * has already been answered.
 */
export function afterResponse(c: Context<AppEnv>, task: Promise<unknown>): void {
  const requestId = c.get('requestId');
  const route = routeOf(c);
  const settled = task.then(
    () => undefined,
    () => log('after_response_failed', { requestId, route, errorCode: 'INTERNAL' }),
  );
  vercelRequestContext().waitUntil?.(settled);
}
