import type { NotificationPlatform } from '@netnet/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { newId } from '../lib/ids';
import type { Executor } from './client';
import { notificationEndpoint, profile } from './schema';

/**
 * The push endpoints (architecture §6.2, PRD J12): one row per device where push is on. Only this
 * module touches `core.notification_endpoint` (CONVENTIONS §3). Active = not revoked.
 */

export interface EndpointRow {
  id: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  platform: NotificationPlatform;
  deviceLabel: string;
  lastSeenAt: Date;
  lastSuccessAt: Date | null;
  failureCount: number;
  revokedAt: Date | null;
}

type EndpointSelect = typeof notificationEndpoint.$inferSelect;

function keysOf(row: { keys: unknown }): { p256dh: string; auth: string } {
  const keys = row.keys as { p256dh?: unknown; auth?: unknown };
  const p256dh = keys.p256dh;
  const auth = keys.auth;
  return {
    p256dh: typeof p256dh === 'string' ? p256dh : '',
    auth: typeof auth === 'string' ? auth : '',
  };
}

function toRow(row: EndpointSelect): EndpointRow {
  return {
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    keys: keysOf(row),
    platform: row.platform,
    deviceLabel: row.deviceLabel,
    lastSeenAt: row.lastSeenAt,
    lastSuccessAt: row.lastSuccessAt,
    failureCount: row.failureCount,
    revokedAt: row.revokedAt,
  };
}

/** The person's active devices, oldest first: what `GET /api/notifications/prefs` lists. */
export async function listActiveEndpoints(db: Executor, userId: string): Promise<EndpointRow[]> {
  const rows = await db
    .select()
    .from(notificationEndpoint)
    .where(and(eq(notificationEndpoint.userId, userId), isNull(notificationEndpoint.revokedAt)))
    .orderBy(notificationEndpoint.createdAt, notificationEndpoint.id);
  return rows.map(toRow);
}

/** An active device of the person's, or null when it is missing, revoked or another's. */
export async function getActiveEndpoint(
  db: Executor,
  userId: string,
  id: string,
): Promise<EndpointRow | null> {
  const rows = await db
    .select()
    .from(notificationEndpoint)
    .where(
      and(
        eq(notificationEndpoint.id, id),
        eq(notificationEndpoint.userId, userId),
        isNull(notificationEndpoint.revokedAt),
      ),
    )
    .limit(1);
  return rows[0] === undefined ? null : toRow(rows[0]);
}

export interface SaveEndpointInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  platform: NotificationPlatform;
  deviceLabel: string;
}

export interface SavedEndpoint {
  id: string;
  /** A row was made. */
  created: boolean;
  /** A revoked row was turned back on. */
  reactivated: boolean;
}

/**
 * Saves a subscription (`POST /api/notifications/endpoints`): idempotent per endpoint URL. A new
 * URL is inserted; a revoked row for the URL is re-activated with the new keys and label, its
 * failures forgotten; an active row keeps its id, with the keys and label refreshed. `push_enabled`
 * fires on a created or re-activated row — never on an active duplicate, which changed nothing.
 */
export async function saveEndpoint(
  db: Executor,
  userId: string,
  input: SaveEndpointInput,
  at: Date,
): Promise<SavedEndpoint> {
  const existing = await db
    .select({ id: notificationEndpoint.id, revokedAt: notificationEndpoint.revokedAt })
    .from(notificationEndpoint)
    .where(
      and(
        eq(notificationEndpoint.userId, userId),
        eq(notificationEndpoint.endpoint, input.endpoint),
      ),
    )
    .limit(1);
  const row = existing[0];
  if (row === undefined) {
    const id = newId('nep', at.getTime());
    await db.insert(notificationEndpoint).values({
      id,
      userId,
      endpoint: input.endpoint,
      keys: input.keys,
      platform: input.platform,
      deviceLabel: input.deviceLabel,
      createdAt: at,
      lastSeenAt: at,
    });
    return { id, created: true, reactivated: false };
  }
  await db
    .update(notificationEndpoint)
    .set({
      keys: input.keys,
      platform: input.platform,
      deviceLabel: input.deviceLabel,
      lastSeenAt: at,
      lastSuccessAt: null,
      failureCount: 0,
      revokedAt: null,
    })
    .where(eq(notificationEndpoint.id, row.id));
  return { id: row.id, created: false, reactivated: row.revokedAt !== null };
}

/**
 * A session's check-in (`PUT …/endpoints/:id`): the device is still here, with this subscription —
 * the browser rotates it — so `last_seen_at` moves and the subscription follows. Null when the
 * device was removed, revoked or is another's: then the app unsubscribes locally and shows the
 * switch off. When the rotated URL already names another of the person's rows, that row is revoked
 * first: one URL belongs to one row, and the device keeps this id.
 */
export async function touchEndpoint(
  db: Executor,
  userId: string,
  id: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
  at: Date,
): Promise<boolean> {
  const current = await getActiveEndpoint(db, userId, id);
  if (current === null) return false;
  if (input.endpoint !== current.endpoint) {
    await db
      .update(notificationEndpoint)
      .set({ revokedAt: at })
      .where(
        and(
          eq(notificationEndpoint.userId, userId),
          eq(notificationEndpoint.endpoint, input.endpoint),
          isNull(notificationEndpoint.revokedAt),
        ),
      );
  }
  await db
    .update(notificationEndpoint)
    .set({ endpoint: input.endpoint, keys: input.keys, lastSeenAt: at })
    .where(eq(notificationEndpoint.id, id));
  return true;
}

/**
 * Turns a device off (`DELETE …/endpoints/:id`): the row is revoked, and its platform is what
 * `push_disabled {by}` names. Null when it was already gone or is another's.
 */
export async function revokeEndpoint(
  db: Executor,
  userId: string,
  id: string,
  at: Date,
): Promise<{ platform: NotificationPlatform } | null> {
  const rows = await db
    .update(notificationEndpoint)
    .set({ revokedAt: at })
    .where(
      and(
        eq(notificationEndpoint.id, id),
        eq(notificationEndpoint.userId, userId),
        isNull(notificationEndpoint.revokedAt),
      ),
    )
    .returning({ platform: notificationEndpoint.platform });
  return rows[0] ?? null;
}

/** A push reached the device: the failure count goes back to nothing. */
export async function recordPushSuccess(db: Executor, id: string, at: Date): Promise<void> {
  await db
    .update(notificationEndpoint)
    .set({ lastSuccessAt: at, failureCount: 0 })
    .where(and(eq(notificationEndpoint.id, id), isNull(notificationEndpoint.revokedAt)));
}

/** Failures in a row that revoke a device, unless the push service said it was gone first. */
export const PUSH_FAILURES_TO_REVOKE = 5;

export interface PushFailureOutcome {
  userId: string;
  platform: NotificationPlatform;
  /** The device was revoked by this failure: `push_disabled {by: browser}` fires. */
  revoked: boolean;
}

/**
 * A push did not reach the device (§7.10 step 6): `404`/`410` means the subscription is gone, so
 * the device is revoked at once; any other failure counts, and the fifth in a row revokes. Null
 * when the row was already revoked: the event fires once. A success in between resets the count.
 */
export async function recordPushFailure(
  db: Executor,
  id: string,
  status: number | undefined,
  at: Date,
): Promise<PushFailureOutcome | null> {
  const rows = await db
    .select({
      userId: notificationEndpoint.userId,
      platform: notificationEndpoint.platform,
      failureCount: notificationEndpoint.failureCount,
    })
    .from(notificationEndpoint)
    .where(and(eq(notificationEndpoint.id, id), isNull(notificationEndpoint.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const gone = status === 404 || status === 410;
  const failures = row.failureCount + 1;
  const revoked = gone || failures >= PUSH_FAILURES_TO_REVOKE;
  await db
    .update(notificationEndpoint)
    .set({ failureCount: failures, ...(revoked ? { revokedAt: at } : {}) })
    .where(eq(notificationEndpoint.id, id));
  return { userId: row.userId, platform: row.platform, revoked };
}

/**
 * Deletes every endpoint of an account (P3-T4's `DELETE /api/account`, PRD J12): every reminder
 * stops at once, and no `push_disabled` fires.
 */
export async function deleteEndpointsForUser(db: Executor, userId: string): Promise<number> {
  const rows = await db
    .delete(notificationEndpoint)
    .where(eq(notificationEndpoint.userId, userId))
    .returning({ id: notificationEndpoint.id });
  return rows.length;
}

export interface PushTarget {
  id: string;
  userId: string;
  platform: NotificationPlatform;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Seconds until 21:00 in the person's zone: the push's TTL (§7.10). */
  ttlSeconds: number;
}

/**
 * Seconds from `at` until 21:00 in `timeZone`, never negative: past 21:00 (only clock skew away —
 * the run sends in the daytime) the push is tried at once and expires with the day.
 */
export function secondsUntil2100(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? 0);
    return Math.max(0, 21 * 3600 - (part('hour') * 3600 + part('minute') * 60 + part('second')));
  } catch {
    const elapsed = at.getUTCHours() * 3600 + at.getUTCMinutes() * 60 + at.getUTCSeconds();
    return Math.max(0, 21 * 3600 - elapsed);
  }
}

/**
 * Every device a reminder goes to: the person's active endpoints with each send's TTL. The time
 * zone is the profile's; without a profile the day is read in UTC.
 */
export async function activePushTargets(
  db: Executor,
  userId: string,
  at: Date,
): Promise<PushTarget[]> {
  const rows = await db
    .select({
      id: notificationEndpoint.id,
      platform: notificationEndpoint.platform,
      endpoint: notificationEndpoint.endpoint,
      keys: notificationEndpoint.keys,
      timeZone: profile.timeZone,
    })
    .from(notificationEndpoint)
    .leftJoin(profile, eq(profile.userId, notificationEndpoint.userId))
    .where(and(eq(notificationEndpoint.userId, userId), isNull(notificationEndpoint.revokedAt)))
    .orderBy(notificationEndpoint.createdAt, notificationEndpoint.id);
  return rows.map((row) => ({
    id: row.id,
    userId,
    platform: row.platform,
    endpoint: row.endpoint,
    keys: keysOf(row),
    ttlSeconds: secondsUntil2100(row.timeZone ?? 'UTC', at),
  }));
}

/** Whether the person has anywhere for a push to go: the claim's device disjunct, read in code. */
export async function hasActiveEndpoints(db: Executor, userId: string): Promise<boolean> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notificationEndpoint)
    .where(and(eq(notificationEndpoint.userId, userId), isNull(notificationEndpoint.revokedAt)));
  return (rows[0]?.n ?? 0) > 0;
}
