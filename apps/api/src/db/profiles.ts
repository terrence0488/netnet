import type { OnboardingState, Segment } from '@netnet/contracts';
import { and, eq, like, sql } from 'drizzle-orm';
import { AppError } from '../lib/errors';
import { isForeignKeyViolation, type Executor } from './client';
import { profile, user, verification } from './schema';

/**
 * A person's profile and account email (architecture §6.2): what `GET /api/me` shows and what
 * `notify()` addresses. Always looked up by the verified user id (CONVENTIONS §3).
 */

export interface Profile {
  country: string | null;
  timeZone: string;
  segment: Segment;
  onboardingState: OnboardingState;
}

export interface Account {
  email: string;
  emailVerified: boolean;
}

/**
 * The profile as it is when an account is created: nothing asked yet. Made only for an account
 * that exists, so a request whose session outlived its account (deleted a moment ago, PRD J10)
 * makes nothing.
 */
export async function createProfile(db: Executor, userId: string, timeZone: string): Promise<void> {
  try {
    await db.execute(sql`
      insert into core.profile (user_id, time_zone)
      select u.id, ${timeZone} from core."user" u where u.id = ${userId}
      on conflict (user_id) do nothing`);
  } catch (error) {
    // The account's deletion committed while this waited on its locks: nothing to make.
    if (!isForeignKeyViolation(error)) throw error;
  }
}

const PROFILE_COLUMNS = {
  country: profile.country,
  timeZone: profile.timeZone,
  segment: profile.segment,
  onboardingState: profile.onboardingState,
};

export async function getProfile(db: Executor, userId: string): Promise<Profile | null> {
  const rows = await db
    .select(PROFILE_COLUMNS)
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The profile, made with its defaults if sign-up did not get as far as making it (its after-commit
 * hook failed), so a person is never stuck without one. `UNAUTHENTICATED` when the account no
 * longer exists: its session outlived it, which is the same as no session.
 */
export async function ensureProfile(db: Executor, userId: string): Promise<Profile> {
  const found = await getProfile(db, userId);
  if (found) return found;
  await createProfile(db, userId, 'UTC');
  const made = await getProfile(db, userId);
  if (!made) throw new AppError('UNAUTHENTICATED', 'Sign in first: there is no such account.');
  return made;
}

export interface ProfileChange {
  country?: string;
  timeZone?: string;
  segment?: Segment;
  onboardingState?: OnboardingState;
}

/** The profile as the update left it, and the country it had just before (null before the first). */
export interface ProfileUpdate {
  profile: Profile;
  /**
   * The country the person had before this update, from the same statement's `RETURNING`: one
   * value, already decided under the profile row's lock, so two concurrent confirmations cannot
   * both read a `null` country and then both move the ledger (P4-T19, review L-1).
   */
  previousCountry: string | null;
}

/** `ProfileChange`'s fields as `core.profile`'s columns, for the one statement below. */
const PROFILE_COLUMN_NAMES: Record<keyof ProfileChange, string> = {
  country: 'country',
  timeZone: 'time_zone',
  segment: 'segment',
  onboardingState: 'onboarding_state',
};

/**
 * Applies `change` and returns the profile and its previous country, or `null` when a new segment
 * was refused because one is already set (it is set once, PRD §3.5): the check is in the UPDATE,
 * so two answers sent at once cannot both win.
 */
export async function updateProfile(
  db: Executor,
  userId: string,
  change: ProfileChange,
): Promise<ProfileUpdate | null> {
  if (Object.keys(change).length === 0) {
    const current = await ensureProfile(db, userId);
    return { profile: current, previousCountry: current.country };
  }
  await ensureProfile(db, userId);
  const { segment } = change;
  const assignments = Object.entries(change).map(
    ([field, value]) =>
      sql`${sql.identifier(PROFILE_COLUMN_NAMES[field as keyof ProfileChange])} = ${value}`,
  );
  // The CTE locks the row and reads its country first, so a concurrent update waits there and
  // this statement returns what that one committed, not a value from an earlier separate read.
  const result = await db.execute<{
    country: string | null;
    timeZone: string;
    segment: Segment;
    onboardingState: OnboardingState;
    previousCountry: string | null;
  }>(sql`
    with previous as (
      select country from core.profile where user_id = ${userId} for update
    )
    update core.profile
       set ${sql.join(assignments, sql`, `)}
      from previous
     where core.profile.user_id = ${userId}${
       segment === undefined
         ? sql``
         : sql` and (core.profile.segment = 'unknown' or core.profile.segment = ${segment})`
     }
    returning core.profile.country as country,
      core.profile.time_zone as "timeZone",
      core.profile.segment as segment,
      core.profile.onboarding_state as "onboardingState",
      previous.country as "previousCountry"`);
  const row = result.rows[0];
  if (!row) return null;
  return {
    profile: {
      country: row.country,
      timeZone: row.timeZone,
      segment: row.segment,
      onboardingState: row.onboardingState,
    },
    previousCountry: row.previousCountry,
  };
}

/**
 * Takes the account row's share lock for the rest of the transaction (`FOR SHARE`), before the
 * ledger lock. `DELETE /api/account` deletes this row before the ledger, so a write that asks
 * first makes the deletion wait and is swept by it, while one that asks after the deletion
 * committed finds no account and fails: no ledger row for an erased id outlives the deletion
 * (P4-T19, review L-2). `core` belongs in `db/**` (CONVENTIONS §3).
 */
export async function lockAccount(db: Executor, userId: string): Promise<void> {
  const { rows } = await db.execute<{ id: string }>(
    sql`select id from core."user" where id = ${userId} for share`,
  );
  if (rows.length === 0) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first: there is no such account.');
  }
}

/** The account's email and whether it is verified, or null when there is no such account. */
export async function accountOf(db: Executor, userId: string): Promise<Account | null> {
  const rows = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Deletes the profile (`DELETE /api/account`, PRD J10). */
export async function deleteProfile(db: Executor, userId: string): Promise<void> {
  await db.delete(profile).where(eq(profile.userId, userId));
}

/**
 * Deletes the identity (`DELETE /api/account`, PRD J10): the `user` row, whose foreign keys
 * delete with it the sessions, the sign-in accounts, the OAuth grants (refresh and access tokens,
 * consents) and every `core` row keyed by the person's id (profile, reminder state, agent
 * connections, connection attempts, push devices), plus any password-reset token waiting for the
 * person. OAuth clients stay: they are shared between accounts.
 */
export async function deleteUser(db: Executor, userId: string): Promise<void> {
  await db
    .delete(verification)
    .where(and(like(verification.identifier, 'reset-password:%'), eq(verification.value, userId)));
  await db.delete(user).where(eq(user.id, userId));
}
