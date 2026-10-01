import type { ErrorCode } from '@netnet/contracts';
import { isProduction } from './env';

/**
 * The only fields a log line may carry (architecture §10). Never amounts, names, emails or
 * bodies: anything else is refused, so a new field is a deliberate change here.
 */
export interface LogFields {
  requestId?: string;
  route?: string;
  tool?: string;
  status?: number;
  latencyMs?: number;
  userId?: string;
  connectionId?: string;
  errorCode?: ErrorCode;
}

const FIELD_TYPES: Record<keyof LogFields, 'string' | 'number'> = {
  requestId: 'string',
  route: 'string',
  tool: 'string',
  status: 'number',
  latencyMs: 'number',
  userId: 'string',
  connectionId: 'string',
  errorCode: 'string',
};

const EVENT_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_STRING_LENGTH = 200;

function isLogField(key: string): key is keyof LogFields {
  return Object.hasOwn(FIELD_TYPES, key);
}

function refuse(reason: string): void {
  if (!isProduction()) throw new Error(`log(): ${reason}`);
}

/**
 * Writes one JSON line to the function's log. Outside production an unknown field, a value of the
 * wrong type or a malformed event name throws, so the mistake fails a test or a preview. In
 * production the offending field is dropped and the rest is written.
 */
export function log(event: string, fields: LogFields = {}): void {
  if (!EVENT_NAME.test(event)) {
    refuse(`event name "${event.slice(0, 64)}" must be snake_case`);
    return;
  }
  const line: Record<string, string | number> = { event };
  for (const [key, value] of Object.entries(fields) as [string, unknown][]) {
    if (value === undefined) continue;
    if (!isLogField(key)) {
      refuse(`field "${key}" is not allowed; see LogFields`);
      continue;
    }
    const expected = FIELD_TYPES[key];
    if (typeof value !== expected) {
      refuse(`field "${key}" must be a ${expected}`);
      continue;
    }
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
      refuse(`field "${key}" is longer than ${MAX_STRING_LENGTH} characters`);
      continue;
    }
    line[key] = value as string | number;
  }
  const status = line.status;
  const write = typeof status === 'number' && status >= 500 ? console.error : console.log;
  write(JSON.stringify(line));
}
