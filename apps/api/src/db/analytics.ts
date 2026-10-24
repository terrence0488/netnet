import type { Segment } from '@netnet/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Executor } from './client';
import { event, profile } from './schema';

/** One `analytics.event` row as `track()` builds it (architecture §6.4). */
export interface EventRow {
  name: string;
  at: Date;
  userId: string | null;
  segment: Segment;
  props: Record<string, unknown>;
  appVersion: string;
}

/** An event of the account `userId` names. */
export interface AccountEventRow extends EventRow {
  userId: string;
}

/** What `track()` needs from the database: the segment to attach, and the inserts. */
export interface EventStore {
  /** The person's segment: `unknown` until onboarding sets it, or when there is no profile yet. */
  segmentOf(userId: string): Promise<Segment>;
  /** An event tied to no account: no user id, or the random id a deletion re-keyed to. */
  insert(row: EventRow): Promise<void>;
  /** An account's event, written only while the account exists (`insertAccountEvent`). */
  insertForAccount(row: AccountEventRow): Promise<void>;
}

/**
 * Writes one event. Insert only, with no RETURNING: `netnet_app` cannot read `analytics` back
 * (§6.1). `visitor` stays null; the landing page's hash is P4's.
 */
export async function insertEvent(db: Executor, row: EventRow): Promise<void> {
  await db.insert(event).values({ ...row, visitor: null });
}

/**
 * Writes an account's event only while the account exists, holding its `user` row (`FOR KEY
 * SHARE`) while it does, so no event keeps the id of an account deleted around it (PRD J10):
 * either the write locks the row first, and the deletion's `delete` waits for it to commit and
 * its re-keying then reaches the event, or the deletion locks it first, and once that commits
 * the write finds no account and writes nothing. Insert only, as `insertEvent`.
 */
export async function insertAccountEvent(db: Executor, row: AccountEventRow): Promise<void> {
  // Literal identifiers: drizzle renders column references table-qualified, which INSERT's
  // column list does not accept. Only the values are parameters.
  await db.execute(sql`
    insert into analytics.event (name, at, user_id, segment, props, app_version)
    select ${row.name}, ${row.at.toISOString()}::timestamptz, u.id, ${row.segment},
      ${JSON.stringify(row.props)}::jsonb, ${row.appVersion}
    from core."user" u where u.id = ${row.userId}
    for key share`);
}

export async function segmentOf(db: Executor, userId: string): Promise<Segment> {
  const rows = await db
    .select({ segment: profile.segment })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1);
  return rows[0]?.segment ?? 'unknown';
}

/**
 * Re-keys an account's events to `randomId` on deletion (architecture §6.4): they still count,
 * and they no longer point at anyone. `randomId` is a fresh `usr_` id that belongs to no account.
 * Runs after the deletion's `delete` of the user row, so it reaches every event
 * `insertAccountEvent` wrote for the account.
 * Needs migration 0007's `SELECT (user_id), UPDATE (user_id)` grant — the WHERE reads the column,
 * the SET writes it — the only read `netnet_app` may do to this table. No `RETURNING`: nothing
 * else of the row may come back.
 */
export async function rekeyEvents(db: Executor, userId: string, randomId: string): Promise<void> {
  await db.update(event).set({ userId: randomId }).where(eq(event.userId, userId));
}

export function eventStore(db: Executor): EventStore {
  return {
    segmentOf: (userId) => segmentOf(db, userId),
    insert: (row) => insertEvent(db, row),
    insertForAccount: (row) => insertAccountEvent(db, row),
  };
}
