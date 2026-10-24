import type { OnboardingState, Segment } from '@netnet/contracts';
import { and, eq, like, or, sql } from 'drizzle-orm';
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

/**
 * Applies `change` and returns the profile, or `null` when a new segment was refused because one
 * is already set (it is set once, PRD §3.5): the check is in the UPDATE, so two answers sent at
 * once cannot both win.
 */
export async function updateProfile(
  db: Executor,
  userId: string,
  change: ProfileChange,
): Promise<Profile | null> {
  if (Object.keys(change).length === 0) return ensureProfile(db, userId);
  await ensureProfile(db, userId);
  const { segment } = change;
  const rows = await db
    .update(profile)
    .set(change)
    .where(
      and(
        eq(profile.userId, userId),
        segment === undefined
          ? undefined
          : or(eq(profile.segment, 'unknown'), eq(profile.segment, segment)),
      ),
    )
    .returning(PROFILE_COLUMNS);
  return rows[0] ?? null;
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
