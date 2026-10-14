import type { Segment } from '@netnet/contracts';
import { eq } from 'drizzle-orm';
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

/** What `track()` needs from the database: the segment to attach, and the insert. */
export interface EventStore {
  /** The person's segment: `unknown` until onboarding sets it, or when there is no profile yet. */
  segmentOf(userId: string): Promise<Segment>;
  insert(row: EventRow): Promise<void>;
}

/**
 * Writes one event. Insert only, with no RETURNING: `netnet_app` cannot read `analytics` back
 * (§6.1). `visitor` stays null; the landing page's hash is P4's.
 */
export async function insertEvent(db: Executor, row: EventRow): Promise<void> {
  await db.insert(event).values({ ...row, visitor: null });
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
  };
}
