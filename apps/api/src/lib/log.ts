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
  /**
   * An unexpected error's class (architecture §10): the name of its class, never its message, and
   * the Postgres SQLSTATE it carries. `errorClass()` derives both; each must have its exact form.
   */
  errorName?: string;
  pgCode?: string;
  /** A response's size, raw and gzipped (the snapshot's revisit trigger, architecture §7.2). */
  bytes?: number;
  gzipBytes?: number;
  /** How many values a response carries (the same trigger). */
  valueCount?: number;
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
  errorName: 'string',
  pgCode: 'string',
  bytes: 'number',
  gzipBytes: 'number',
  valueCount: 'number',
};

const EVENT_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_STRING_LENGTH = 200;

/** A class name: an identifier, so no message, SQL or value fits in it. */
const ERROR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
/** A Postgres SQLSTATE: five digits or capital letters. */
const SQLSTATE = /^[0-9A-Z]{5}$/;

/** Fields whose values must have an exact form, whatever their length. */
const FIELD_FORMS: Partial<Record<keyof LogFields, RegExp>> = {
  errorName: ERROR_NAME,
  pgCode: SQLSTATE,
};

/** How far `errorClass()` follows a `cause` chain. */
const MAX_CAUSES = 8;

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
    const form = FIELD_FORMS[key];
    if (form !== undefined && !(typeof value === 'string' && form.test(value))) {
      refuse(`field "${key}" must match ${String(form)}`);
      continue;
    }
    line[key] = value as string | number;
  }
  const status = line.status;
  const write = typeof status === 'number' && status >= 500 ? console.error : console.log;
  write(JSON.stringify(line));
}

/** The name of `error`'s class, when it is an identifier. */
function className(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const prototype: unknown = Object.getPrototypeOf(error);
  const name: unknown = (prototype as { constructor?: { name?: unknown } } | null)?.constructor
    ?.name;
  return typeof name === 'string' && ERROR_NAME.test(name) ? name : undefined;
}

/**
 * The first Postgres SQLSTATE along `error`'s `cause` chain: Drizzle wraps the driver's error,
 * whose `code` it is. Only an error the driver built carries one (it has a `severity` too), so a
 * system error's code, such as `EPIPE`, is not taken for one.
 */
function sqlState(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSES; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    const { code, severity, cause } = current as {
      code?: unknown;
      severity?: unknown;
      cause?: unknown;
    };
    if (typeof code === 'string' && typeof severity === 'string' && SQLSTATE.test(code)) {
      return code;
    }
    current = cause;
  }
  return undefined;
}

/**
 * An unexpected error's class as log fields (architecture §10): `errorName`, the name of its class,
 * and `pgCode`, its Postgres SQLSTATE. Never its message, SQL or a value: each field is left out
 * unless it has its exact form, and a hostile error that throws on being read yields nothing.
 */
export function errorClass(error: unknown): Pick<LogFields, 'errorName' | 'pgCode'> {
  try {
    const errorName = className(error);
    const pgCode = sqlState(error);
    return {
      ...(errorName === undefined ? {} : { errorName }),
      ...(pgCode === undefined ? {} : { pgCode }),
    };
  } catch {
    return {};
  }
}
