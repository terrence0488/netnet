import { and, gte, like, lt } from 'drizzle-orm';
import type { Executor } from './client';
import { countHit } from './rate-limits';
import { rateLimit } from './schema';

/**
 * The day's email count (architecture §7.10, §9.3, §9.4; P4-T4): every email Resend accepted,
 * whatever its kind (verification, reset, security, reminder, health alert), in the fixed
 * `core.rate_limit` window of its UTC day. A captured or refused send is not counted. Rows are
 * kept indefinitely, so yesterday's and the month's readings may be read back at any time; the
 * check needs at least 35 days. Only `apps/api/src/db/**` touches `core` (CONVENTIONS §3).
 */

export const EMAIL_COUNT_PREFIX = 'email:sent:';
const DAY_MS = 86_400_000;

/** Emails Resend accepted: today, yesterday, and this UTC month to date. */
export interface EmailCounts {
  today: number;
  yesterday: number;
  month: number;
}

/** Midnight UTC of `at`'s day. */
export function utcDayStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** The counter key for `at`'s UTC day: `email:sent:YYYY-MM-DD`. */
export function emailCountKey(at: Date): string {
  return `${EMAIL_COUNT_PREFIX}${utcDayStart(at).toISOString().slice(0, 10)}`;
}

/** Counts one email Resend accepted at `at`, in that UTC day's fixed window. */
export async function recordEmailSent(db: Executor, at: Date): Promise<void> {
  await countHit(db, emailCountKey(at), utcDayStart(at));
}

/**
 * The emails Resend accepted today, yesterday and this UTC month. It reads only the counter's own
 * keys, from the month's first day (or yesterday, when that is in the previous month) through
 * today inclusive: no other `core.rate_limit` row is looked at, and no future day is summed.
 */
export async function emailCounts(db: Executor, at: Date): Promise<EmailCounts> {
  const todayStart = utcDayStart(at);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const from = new Date(Math.min(monthStart.getTime(), yesterdayStart.getTime()));
  const rows = await db
    .select({ key: rateLimit.key, count: rateLimit.count })
    .from(rateLimit)
    .where(
      and(
        gte(rateLimit.windowStart, from),
        lt(rateLimit.windowStart, tomorrowStart),
        like(rateLimit.key, `${EMAIL_COUNT_PREFIX}%`),
      ),
    );
  const todayKey = emailCountKey(todayStart);
  const yesterdayKey = emailCountKey(yesterdayStart);
  const monthPrefix = `${EMAIL_COUNT_PREFIX}${todayStart.toISOString().slice(0, 7)}`;
  let today = 0;
  let yesterday = 0;
  let month = 0;
  for (const row of rows) {
    if (row.key === todayKey) today += row.count;
    if (row.key === yesterdayKey) yesterday += row.count;
    if (row.key.startsWith(monthPrefix)) month += row.count;
  }
  return { today, yesterday, month };
}
