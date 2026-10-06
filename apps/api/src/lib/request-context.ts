import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './context';
import { log } from './log';

/**
 * The matched route pattern (never the raw path, which can carry ids). A request no route matched
 * reports this middleware's own pattern, `/*`.
 */
export function routeOf(c: Context<AppEnv>): string {
  const pattern = c.req.routePath;
  return `${c.req.method} ${pattern === '/*' ? '(unmatched)' : pattern}`;
}

/** A fresh id for each request. Never taken from the caller, so a log line can be trusted. */
export function newRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll('-', '')}`;
}

/**
 * Gives every request an id (on `c` and in `X-Request-Id`), and writes one `request` log line
 * with the matched route, the status and the latency when it finishes. The latency also goes in
 * `Server-Timing`, so the MCP probe can log the function's time next to its own (P1-T18).
 */
export function requestContext(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = performance.now();
    const requestId = newRequestId();
    c.set('requestId', requestId);
    await next();
    const latencyMs = Math.round(performance.now() - started);
    c.header('X-Request-Id', requestId);
    c.header('Server-Timing', `netnet;dur=${latencyMs}`);
    log('request', {
      requestId,
      route: routeOf(c),
      status: c.res.status,
      latencyMs,
    });
  };
}

/**
 * Function responses carry personal data: never cached anywhere (architecture §5.2). A route that
 * serves only public, immutable data (a published content version) sets its own Cache-Control.
 */
export function noStore(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-store');
  };
}
