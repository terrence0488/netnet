import { createHash, randomBytes } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { database, type Executor } from './client';
import { visitorSalt } from './schema';

/**
 * The landing page's `visitor` (architecture §6.4): `sha256(daily salt ‖ ip ‖ user agent)`,
 * truncated, so M10 counts unique visitors without a cookie or anything stored in the browser.
 * Each UTC day's salt is a random value in `core.visitor_salt`, shared by every function instance
 * so one browser hashes alike all day, and deleted once the day has passed: on the next day's
 * first read, and by the daily sweep. A past day's hashes can then never be recomputed.
 */

/** The salt's length: 256 random bits. */
export const SALT_BYTES = 32;

/** How much of the hash `visitor` keeps: 16 hex characters, 64 bits. */
export const VISITOR_LENGTH = 16;

/** A `visitor` as `analytics.event` holds it. */
export const VISITOR = /^[0-9a-f]{16}$/;

/** The UTC calendar day `at` falls on, `YYYY-MM-DD`: the day a salt belongs to. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * `day`'s salt, and earlier days' deleted on the way. The day's first call stores `fresh` (a new
 * random value unless a test gives one); every later call, on any instance, reads that one back.
 * Two first calls at once keep whichever was stored first, so both hash alike.
 */
export async function saltFor(
  db: Executor,
  day: string,
  fresh: () => Buffer = () => randomBytes(SALT_BYTES),
): Promise<Buffer> {
  const { rows } = await db.execute<{ salt: Buffer }>(sql`
    with past as (delete from core.visitor_salt where day < ${day}::date)
    select salt from core.visitor_salt where day = ${day}::date`);
  const found = rows[0]?.salt;
  if (found) return found;
  // A no-op update on a conflict, so the row stored first is the one returned.
  const made = await db.execute<{ salt: Buffer }>(sql`
    insert into core.visitor_salt (day, salt) values (${day}::date, ${fresh()})
    on conflict (day) do update set salt = core.visitor_salt.salt
    returning salt`);
  const salt = made.rows[0]?.salt;
  if (!salt) throw new Error('saltFor(): the upsert returned no row');
  return salt;
}

/** Deletes every salt for a day before `day` (the daily sweep, §9.3); returns how many went. */
export async function deleteSaltsBefore(db: Executor, day: string): Promise<number> {
  const gone = await db
    .delete(visitorSalt)
    .where(lt(visitorSalt.day, day))
    .returning({ day: visitorSalt.day });
  return gone.length;
}

/**
 * The hash itself. The address and the user agent are separated by a NUL, which neither header
 * can contain, so no two pairs run together into the same input.
 */
export function visitorHash(salt: Buffer, ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(salt)
    .update(ip)
    .update('\0')
    .update(userAgent)
    .digest('hex')
    .slice(0, VISITOR_LENGTH);
}

/** The request's address and user agent, as the events route reads them. */
export interface VisitorRequest {
  ip: string;
  userAgent: string;
}

/** Today's `visitor` for a request. */
export type Visitor = (request: VisitorRequest) => Promise<string>;

export interface VisitorDeps {
  db: () => Executor;
  clock: () => Date;
}

/** Builds `visitor` over a given database and clock. The app uses `visitor` below. */
export function createVisitor(deps: () => VisitorDeps): Visitor {
  return async ({ ip, userAgent }) => {
    const { db, clock } = deps();
    const salt = await saltFor(db(), utcDay(clock()));
    return visitorHash(salt, ip, userAgent);
  };
}

export const visitor: Visitor = createVisitor(() => ({ db: database, clock: () => new Date() }));
