import type { OnboardingState, Segment } from '@netnet/contracts';
import { and, eq, like, or } from 'drizzle-orm';
import type { Executor } from './client';
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

/** The profile as it is when an account is created: nothing asked yet. */
export async function createProfile(db: Executor, userId: string, timeZone: string): Promise<void> {
  await db.insert(profile).values({ userId, timeZone }).onConflictDoNothing();
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
 * hook failed), so a person is never stuck without one.
 */
export async function ensureProfile(db: Executor, userId: string): Promise<Profile> {
  const found = await getProfile(db, userId);
  if (found) return found;
  await createProfile(db, userId, 'UTC');
  const made = await getProfile(db, userId);
  if (!made) throw new Error('ensureProfile(): the profile could not be made');
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
 * delete the sessions, the sign-in accounts and the OAuth grants (refresh and access tokens,
 * consents) with it, plus any password-reset token waiting for the person. OAuth clients stay:
 * they are shared between accounts.
 */
export async function deleteUser(db: Executor, userId: string): Promise<void> {
  await db
    .delete(verification)
    .where(and(like(verification.identifier, 'reset-password:%'), eq(verification.value, userId)));
  await db.delete(user).where(eq(user.id, userId));
}
