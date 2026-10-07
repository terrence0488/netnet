import { ERROR_STATUS, type ErrorBody, type ErrorCode } from '@netnet/contracts';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './context';
import { AppError } from './errors';
import { log } from './log';
import { routeOf } from './request-context';
import { reportError } from './sentry';

/** Statuses Hono itself raises (a malformed JSON body, say) that have a code of their own. */
const CODE_FOR_HTTP_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

function respond(c: Context<AppEnv>, body: ErrorBody) {
  return c.json(body, ERROR_STATUS[body.error.code]);
}

async function internal(c: Context<AppEnv>, err: unknown) {
  const requestId = c.get('requestId');
  const route = routeOf(c);
  log('request_failed', {
    requestId,
    route,
    status: ERROR_STATUS.INTERNAL,
    errorCode: 'INTERNAL',
  });
  await reportError(err, { requestId, route });
  return respond(c, {
    error: {
      code: 'INTERNAL',
      message: `Something went wrong on our side. Try again; if it keeps happening, quote request id ${requestId}.`,
      requestId,
    },
  });
}

/**
 * Maps an AppError to its status with `{error: {code, message, fields?, …details}}`. A deliberate
 * HTTPException keeps its status (and headers, such as WWW-Authenticate). Anything unexpected
 * becomes INTERNAL with the request id; its message, stack and SQL never leave here.
 */
export const handleError: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError && err.code !== 'INTERNAL') {
    return respond(c, { error: { ...err.details, code: err.code, message: err.message } });
  }
  if (err instanceof HTTPException) {
    const code = CODE_FOR_HTTP_STATUS[err.status];
    if (code) return respond(c, { error: { code, message: err.message || 'Check the request.' } });
    if (err.status < 500) return err.getResponse();
  }
  return internal(c, err);
};

export const handleNotFound: NotFoundHandler<AppEnv> = (c) =>
  respond(c, {
    error: { code: 'NOT_FOUND', message: `Nothing is at ${c.req.method} ${c.req.path}.` },
  });
