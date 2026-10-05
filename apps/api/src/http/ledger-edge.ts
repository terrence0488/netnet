import type { DomainEvent, EventName, EventProps, Warning, Write } from '@netnet/contracts';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { database } from '../db/client';
import { ensureProfile, type Profile } from '../db/profiles';
import { appVersion } from '../events/app-version';
import { track, type Track, type TrackContext } from '../events/track';
import { appLedgerOptions } from '../ledger/content';
import { FieldErrors, parseInput, type FieldErrorCode } from '../ledger/input';
import { createWithLedger, type Ledger, type LedgerOptions } from '../ledger/ledger';
import { withUser, type Actor, type WithUser } from '../ledger/with-user';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { isId, type IdPrefix } from '../lib/ids';

/**
 * The REST edge over the Ledger (architecture §5.1, §7.2): what every handler in snapshot, holdings,
 * values, types, tags and prefs shares. A handler takes the user from the session (never from the
 * request, CONVENTIONS §3), checks the input with the contract's schema, opens the Ledger with the
 * person's options (their pack chain, the rates, the time zone that decides their today), and maps
 * the result. A write's analytics events go to `track()` after the response, with the segment.
 */

export interface LedgerDeps {
  /** The person's profile (country, time zone, segment), made with its defaults if missing. */
  profile: (userId: string) => Promise<Profile>;
  withUser: WithUser;
  /** The Ledger's options for this person. */
  options: (profile: Profile) => LedgerOptions;
  track: Track;
  appVersion: () => string;
}

export const appLedgerDeps: LedgerDeps = {
  profile: (userId) => ensureProfile(database(), userId),
  withUser,
  options: appLedgerOptions,
  track,
  appVersion,
};

/** Every REST call is the person themselves, on the web: their writes carry `source: web` (§7.7). */
export const WEB: Actor = { kind: 'user' };

/** `Write<void>`'s result goes out as `null`. */
export type RestResult<T> = [T] extends [void] ? null : T;

/** What every write answers with (§7.2): the Ledger's `Write` without its events. */
export interface WriteResponse<T> {
  result: RestResult<T>;
  dataVersion: number;
  warnings: Warning[];
}

/** The largest body a ledger route reads: two saved filters of 500 ids per list fit. */
export const MAX_BODY_BYTES = 256 * 1024;

/** VALIDATION_FAILED naming each field, worded as the Ledger words its own. */
export function invalid(fields: Record<string, string>): AppError {
  const listed = Object.entries(fields)
    .map(([path, message]) => `${path}: ${message}`)
    .join(' ');
  return new AppError('VALIDATION_FAILED', listed, { fields });
}

/** Refuses a body over MAX_BODY_BYTES before it is read. */
export function limitBody() {
  return bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw invalid({ body: `Send at most ${MAX_BODY_BYTES} bytes.` });
    },
  });
}

/** The body as a JSON object, or VALIDATION_FAILED. */
export async function readObject(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json<unknown>();
  } catch {
    throw invalid({ body: 'Send a JSON object.' });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid({ body: 'Send a JSON object.' });
  }
  return body as Record<string, unknown>;
}

type Schema<T> = Parameters<typeof parseInput<T>>[0];

/**
 * Checks `input` with its contract schema before anything is read, so a bad request costs no
 * transaction. `extra` adds the route's own problems (a field the path supplies, say); the error
 * names every field, with the Ledger's own wording, which it checks again when it is called.
 */
export function validate<T>(
  schema: Schema<T>,
  input: unknown,
  extra?: (errors: FieldErrors) => void,
): void {
  const errors = new FieldErrors();
  try {
    parseInput(schema, input);
  } catch (error) {
    const fields = error instanceof AppError ? error.details?.fields : undefined;
    if (!(error instanceof AppError) || !fields) throw error;
    for (const [path, message] of Object.entries(fields)) {
      errors.add(error.code as FieldErrorCode, path, message);
    }
  }
  extra?.(errors);
  errors.throwIfAny();
}

/** Adds a problem for `key` when the body has it: a field the path gives, not the body. */
export function refuseKey(
  body: Record<string, unknown>,
  key: string,
  message: string,
  errors: FieldErrors,
): void {
  if (Object.hasOwn(body, key)) errors.add('VALIDATION_FAILED', key, message);
}

/** The id in the path, which must be an id of `prefix`; VALIDATION_FAILED names `id` otherwise. */
export function pathId(id: string, prefix: IdPrefix, what: string): string {
  if (!isId(id, prefix)) {
    throw invalid({ id: `Give a ${what} id in the path, such as "${prefix}_01J…".` });
  }
  return id;
}

/** An optional id in the query (`moveTo`, `mergeInto`); VALIDATION_FAILED names it if malformed. */
export function queryId(
  value: string | undefined,
  param: string,
  prefix: IdPrefix,
  what: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (!isId(value, prefix)) {
    throw invalid({ [param]: `Give a ${what} id, such as "${prefix}_01J…", or leave it out.` });
  }
  return value;
}

/**
 * Rethrows a Ledger error with its field paths as this route names them (`rename` returns the new
 * path); anything else is rethrown as it is.
 */
export function renamePaths(error: unknown, rename: (path: string) => string): never {
  const fields = error instanceof AppError ? error.details?.fields : undefined;
  if (!(error instanceof AppError) || !fields) throw error;
  const errors = new FieldErrors();
  for (const [path, message] of Object.entries(fields)) {
    errors.add(error.code as FieldErrorCode, rename(path), message);
  }
  errors.throwIfAny();
  throw error;
}

/** Hands one event to `track`: a domain event is always one of the typed events (§7.7). */
function trackEvent(t: Track, event: DomainEvent, ctx: TrackContext): Promise<void> {
  return t(event.name as EventName, event.props as EventProps<EventName>, ctx);
}

/** Runs `fn` on the person's Ledger in a read-only transaction. */
export async function readLedger<T>(
  deps: LedgerDeps,
  userId: string,
  fn: (ledger: Ledger) => Promise<T>,
): Promise<T> {
  const profile = await deps.profile(userId);
  return createWithLedger(deps.withUser, deps.options(profile))(userId, WEB, fn);
}

/**
 * Runs a write on the person's Ledger and answers with §7.2's `{result, dataVersion, warnings}`.
 * Its events are checked now and written after the response (§5.1), each with the person's segment.
 */
export async function writeLedger<T>(
  c: Context<AppEnv>,
  deps: LedgerDeps,
  userId: string,
  fn: (ledger: Ledger) => Promise<Write<T>>,
): Promise<WriteResponse<T>> {
  const profile = await deps.profile(userId);
  const write = await createWithLedger(deps.withUser, deps.options(profile))(userId, WEB, fn, {
    write: true,
  });
  if (write.events.length > 0) {
    const ctx = { userId, segment: profile.segment, appVersion: deps.appVersion() };
    afterResponse(c, Promise.all(write.events.map((e) => trackEvent(deps.track, e, ctx))));
  }
  return {
    result: (write.result ?? null) as RestResult<T>,
    dataVersion: write.dataVersion,
    warnings: write.warnings,
  };
}
