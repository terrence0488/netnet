import {
  SEGMENTS,
  eventSchemas,
  isEventName,
  type EventName,
  type EventProps,
  type Segment,
} from '@netnet/contracts';
import { eventStore, type EventStore } from '../db/analytics';
import { database } from '../db/client';
import { VISITOR } from '../db/visitor';
import { isProduction } from '../lib/env';
import { isId } from '../lib/ids';
import { log } from '../lib/log';

/**
 * `track()`: the only way an analytics event is written (architecture §6.4, §7.7). The event's
 * props must pass its strict schema in packages/contracts; `segment`, `user_id`, `visitor` and
 * `app_version` are attached here, never taken from props. An event for a verified user is written only while
 * their account exists, so none keeps the id of a deleted account (PRD J10).
 */

export interface TrackContext {
  /**
   * The verified user id, when there is one. The event is written only while that account exists;
   * once it is deleted, nothing is.
   */
  userId?: string | undefined;
  /**
   * Instead of `userId`: the random id a deleted account's events were re-keyed to
   * (`DELETE /api/account`), for `account_deleted`. It is no account's, so the event is written
   * as it is. Its segment is the caller's, or `unknown`.
   */
  rekeyedUserId?: string | undefined;
  /** The person's segment when the caller has it loaded; otherwise read from `core.profile`. */
  segment?: Segment | undefined;
  /**
   * `landing_view` only, and never with a user id: the visitor hash the events route works out
   * from the request (`db/visitor.ts`, architecture §6.4).
   */
  visitor?: string | undefined;
  /** The deployed version (see `appVersion()`). */
  appVersion: string;
}

export interface TrackDeps {
  store: EventStore;
  clock: () => Date;
}

/**
 * Checks the event at once: outside production an unknown name, a prop its schema does not allow
 * or a malformed context throws here, at the call, so the mistake fails a test or a preview. In
 * production it is logged (without the props) and dropped. A valid event is written by the
 * returned promise, which never rejects: a write that fails is logged, because analytics never
 * breaks what the person was doing. Server events run it after the response (`afterResponse`).
 */
export type Track = <N extends EventName>(
  name: N,
  props: EventProps<N>,
  ctx: TrackContext,
) => Promise<void>;

/** A token such as a short commit SHA or `dev`: never free text. */
const APP_VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$/;

interface Checked {
  name: EventName;
  props: Record<string, unknown>;
}

/** Where a check failed, as paths and issue codes only: never the values sent. */
function describeIssues(issues: readonly { path: PropertyKey[]; code: string }[]): string {
  return issues
    .map((issue) => `${issue.path.map(String).join('.') || '(props)'}: ${issue.code}`)
    .join('; ');
}

function check(name: unknown, props: unknown, ctx: TrackContext): Checked | string {
  if (!isEventName(name)) return 'unknown event name';
  const parsed = eventSchemas[name].safeParse(props);
  if (!parsed.success) return `${name} props rejected: ${describeIssues(parsed.error.issues)}`;
  if (ctx.userId !== undefined && !isId(ctx.userId, 'usr')) {
    return 'ctx.userId must be the verified user id, a usr_ ULID';
  }
  if (ctx.rekeyedUserId !== undefined && !isId(ctx.rekeyedUserId, 'usr')) {
    return 'ctx.rekeyedUserId must be the re-keyed id, a usr_ ULID';
  }
  if (ctx.userId !== undefined && ctx.rekeyedUserId !== undefined) {
    return 'ctx.userId and ctx.rekeyedUserId cannot both be set';
  }
  if (ctx.segment !== undefined && !SEGMENTS.includes(ctx.segment)) {
    return 'ctx.segment is not a segment';
  }
  if (ctx.visitor !== undefined) {
    if (name !== 'landing_view') return 'ctx.visitor is for landing_view only';
    if (ctx.userId !== undefined || ctx.rekeyedUserId !== undefined) {
      return 'ctx.visitor cannot go with a user id';
    }
    if (!VISITOR.test(ctx.visitor)) return 'ctx.visitor must be 16 lower-case hex characters';
  }
  if (typeof ctx.appVersion !== 'string' || !APP_VERSION.test(ctx.appVersion)) {
    return 'ctx.appVersion must be a version token such as a short commit SHA';
  }
  return { name, props: parsed.data };
}

/** The user id for a log line, only when it is a well-formed one. */
function logUser(ctx: TrackContext): { userId?: string } {
  return isId(ctx.userId, 'usr') ? { userId: ctx.userId } : {};
}

/** Builds `track` over a given store and clock. The app uses `track` below. */
export function createTrack(deps: () => TrackDeps): Track {
  return (name, props, ctx) => {
    const checked = check(name, props, ctx);
    if (typeof checked === 'string') {
      if (!isProduction()) throw new Error(`track(): ${checked}`);
      log('event_rejected', { ...logUser(ctx), errorCode: 'VALIDATION_FAILED' });
      return Promise.resolve();
    }
    return write(deps, checked, ctx);
  };
}

/** Runs synchronously up to its first await, so `at` is the moment `track()` was called. */
async function write(deps: () => TrackDeps, event: Checked, ctx: TrackContext) {
  try {
    const { store, clock } = deps();
    const row = { name: event.name, at: clock(), props: event.props, appVersion: ctx.appVersion };
    const { userId } = ctx;
    if (userId === undefined) {
      const segment = ctx.segment ?? 'unknown';
      const visitor = ctx.visitor === undefined ? {} : { visitor: ctx.visitor };
      await store.insert({ ...row, ...visitor, userId: ctx.rekeyedUserId ?? null, segment });
    } else {
      const segment = ctx.segment ?? (await store.segmentOf(userId));
      await store.insertForAccount({ ...row, userId, segment });
    }
  } catch {
    log('event_write_failed', { ...logUser(ctx), errorCode: 'INTERNAL' });
  }
}

export const track: Track = createTrack(() => ({
  store: eventStore(database()),
  clock: () => new Date(),
}));
