import { addDays } from '@netnet/core';
import { and, desc, eq, gt, gte, isNull, lt, or, sql } from 'drizzle-orm';
import type { Executor } from './client';
import { ensureProfile } from './profiles';
import { agentConnection, reminderState } from './schema';

/**
 * The comeback reminder's state (architecture §7.10, PRD J12): `touchChecked`, the run's claim
 * and release, the opened watermark, and the switches. Only this module touches
 * `core.reminder_state` (CONVENTIONS §3). Dates are calendar dates in the person's `time_zone`.
 */

export interface ReminderState {
  userId: string;
  enabled: boolean;
  emailEnabled: boolean;
  lastCheckedOn: string | null;
  nextDueOn: string | null;
  sentSinceCheck: number;
  lastSentAt: Date | null;
  lastChannel: 'push' | 'email' | null;
  lastOpenedAt: Date | null;
}

type ReminderRow = typeof reminderState.$inferSelect;

function toState(row: ReminderRow): ReminderState {
  return {
    userId: row.userId,
    enabled: row.enabled,
    emailEnabled: row.emailEnabled,
    lastCheckedOn: row.lastCheckedOn,
    nextDueOn: row.nextDueOn,
    sentSinceCheck: row.sentSinceCheck,
    lastSentAt: row.lastSentAt,
    lastChannel: row.lastChannel === 'push' || row.lastChannel === 'email' ? row.lastChannel : null,
    lastOpenedAt: row.lastOpenedAt,
  };
}

export async function getReminderState(
  db: Executor,
  userId: string,
): Promise<ReminderState | null> {
  const rows = await db
    .select()
    .from(reminderState)
    .where(eq(reminderState.userId, userId))
    .limit(1);
  return rows[0] === undefined ? null : toState(rows[0]);
}

/** The calendar date at `at` in `timeZone` (CONVENTIONS §5), or the UTC date for an unknown zone. */
export function todayInZone(timeZone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/**
 * Starts a new account's clock on `today`: as if they checked, so their first reminder is due in
 * 30 days. Runs with the profile creation on sign-up; a row that exists is left alone.
 */
export async function createReminderState(
  db: Executor,
  userId: string,
  today: string,
): Promise<void> {
  await db
    .insert(reminderState)
    .values({ userId, lastCheckedOn: today, nextDueOn: addDays(today, 30) })
    .onConflictDoNothing();
}

/**
 * `touchChecked(userId)` (§7.10): the person checked NetNet, so the clock restarts from their
 * today. One upsert, writing at most once per person per day; a missing row is made. Runs after
 * the response, never before it.
 */
export async function touchChecked(db: Executor, userId: string, at: Date): Promise<void> {
  const profile = await ensureProfile(db, userId);
  const today = todayInZone(profile.timeZone, at);
  // Literal identifiers: drizzle renders column references table-qualified, which INSERT's
  // column list and the conflict target do not accept. Only the values are parameters.
  await db.execute(sql`
    insert into core.reminder_state (user_id, last_checked_on, next_due_on, sent_since_check)
    values (${userId}, ${today}::date, (${today}::date + 30), 0)
    on conflict (user_id) do update set
      last_checked_on = excluded.last_checked_on,
      next_due_on = excluded.next_due_on,
      sent_since_check = 0
    where reminder_state.last_checked_on is null
      or reminder_state.last_checked_on < excluded.last_checked_on`);
}

export interface ClaimedReminder {
  userId: string;
  timeZone: string;
  /** The person's local date at the claim: a release sets `next_due_on` back to it. */
  claimedOn: string;
  /** `last_sent_at` the claim set: a release only lands on this claim. */
  lastSentAt: Date;
}

/**
 * Claims everyone due and awake in one `UPDATE … RETURNING` (§7.10 step 2): `enabled`, fewer than
 * three reminders since the check, `next_due_on` on or before their local today, local time
 * 08:00–21:00, and somewhere to send — an active device, or a verified address with email
 * reminders on. The claim moves `next_due_on` 30 days out and counts the send, so two overlapping
 * runs cannot both send to one person and nobody gets a fourth.
 */
export async function claimDueReminders(db: Executor, at: Date): Promise<ClaimedReminder[]> {
  const instant = at.toISOString();
  const local = sql`(${instant}::timestamptz at time zone p.time_zone)`;
  // `execute` returns the driver's raw rows, so the instant comes back as text.
  const result = await db.execute<{
    user_id: string;
    time_zone: string;
    claimed_on: string;
    last_sent_at: string;
  }>(sql`
    update core.reminder_state rs
    set next_due_on = ((${local}::date) + 30),
      sent_since_check = rs.sent_since_check + 1,
      last_sent_at = ${instant}::timestamptz
    from core.profile p join core."user" u on u.id = p.user_id
    where rs.user_id = p.user_id
      and rs.enabled
      and (exists (
             select 1 from core.notification_endpoint ne
             where ne.user_id = rs.user_id and ne.revoked_at is null
           )
           or (rs.email_enabled and u.email_verified))
      and rs.sent_since_check < 3
      and rs.next_due_on <= (${local}::date)
      and extract(hour from ${local}) between 8 and 20
    returning rs.user_id as user_id, p.time_zone as time_zone,
      (${local}::date)::text as claimed_on,
      rs.last_sent_at as last_sent_at`);
  return result.rows.map((row) => ({
    userId: row.user_id,
    timeZone: row.time_zone,
    claimedOn: row.claimed_on,
    lastSentAt: new Date(row.last_sent_at),
  }));
}

/**
 * Releases a claim (§7.10 step 3): nothing could be delivered, so the next run tries again. Only
 * lands when the row still holds this claim (`last_sent_at` matches and the count is up), so a
 * check or a newer claim in between is never undone.
 */
export async function releaseReminder(
  db: Executor,
  userId: string,
  claim: Pick<ClaimedReminder, 'claimedOn' | 'lastSentAt'>,
): Promise<void> {
  await db
    .update(reminderState)
    .set({
      nextDueOn: claim.claimedOn,
      sentSinceCheck: sql`${reminderState.sentSinceCheck} - 1`,
    })
    .where(
      and(
        eq(reminderState.userId, userId),
        eq(reminderState.lastSentAt, claim.lastSentAt),
        gt(reminderState.sentSinceCheck, 0),
      ),
    );
}

/** Records what a delivered reminder went by: `reminder_sent {channel}`'s sibling on the row. */
export async function recordReminderSent(
  db: Executor,
  userId: string,
  channel: 'push' | 'email',
): Promise<void> {
  await db
    .update(reminderState)
    .set({ lastChannel: channel })
    .where(eq(reminderState.userId, userId));
}

/** How many reminder emails went out this UTC day: the run stops at 60 (§7.10). */
export async function countReminderEmailsToday(db: Executor, at: Date): Promise<number> {
  const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reminderState)
    .where(
      and(
        eq(reminderState.lastChannel, 'email'),
        gte(reminderState.lastSentAt, dayStart),
        lt(reminderState.lastSentAt, dayEnd),
      ),
    );
  return rows[0]?.n ?? 0;
}

/**
 * Marks reminder `sentAt` opened: true, and the watermark moved, only for a reminder newer than
 * any opened before — each reminder's first open fires `reminder_opened` exactly once, in
 * whichever order reminders are opened.
 */
export async function markReminderOpened(
  db: Executor,
  userId: string,
  sentAt: Date,
): Promise<boolean> {
  const rows = await db
    .update(reminderState)
    .set({ lastOpenedAt: sql`greatest(${reminderState.lastOpenedAt}, ${sentAt})` })
    .where(
      and(
        eq(reminderState.userId, userId),
        or(isNull(reminderState.lastOpenedAt), lt(reminderState.lastOpenedAt, sentAt)),
      ),
    )
    .returning({ userId: reminderState.userId });
  return rows.length === 1;
}

/** Turns Reminders off or back on (Settings → Notifications), making the row if missing. */
export async function setRemindersEnabled(
  db: Executor,
  userId: string,
  on: boolean,
): Promise<void> {
  await db
    .insert(reminderState)
    .values({ userId, enabled: on })
    .onConflictDoUpdate({
      target: reminderState.userId,
      set: { enabled: on },
    });
}

/**
 * Deletes the reminder state (`DELETE /api/account`, PRD J10): every reminder stops at once, and
 * no `push_disabled` fires.
 */
export async function deleteReminderState(db: Executor, userId: string): Promise<void> {
  await db.delete(reminderState).where(eq(reminderState.userId, userId));
}

/** Turns email reminders off (the unsubscribe) or back on, making the row if it is missing. */
export async function setEmailReminders(db: Executor, userId: string, on: boolean): Promise<void> {
  await db
    .insert(reminderState)
    .values({ userId, emailEnabled: on })
    .onConflictDoUpdate({
      target: reminderState.userId,
      set: { emailEnabled: on },
    });
}

/** The connected (not revoked) agent used most recently, for the "Just ask" line. */
export async function mostRecentlyUsedConnection(
  db: Executor,
  userId: string,
): Promise<{ client: 'claude' | 'chatgpt' | 'other'; clientName: string } | null> {
  const rows = await db
    .select({ client: agentConnection.client, clientName: agentConnection.clientName })
    .from(agentConnection)
    .where(and(eq(agentConnection.userId, userId), isNull(agentConnection.revokedAt)))
    .orderBy(
      desc(sql`coalesce(${agentConnection.lastUsedAt}, ${agentConnection.createdAt})`),
      desc(agentConnection.id),
    )
    .limit(1);
  return rows[0] ?? null;
}
