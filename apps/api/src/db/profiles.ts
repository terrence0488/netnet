import { eq } from 'drizzle-orm';
import type { Executor } from './client';
import { user } from './schema';

/**
 * A person's account email (architecture §6.2): what `notify()` addresses. Always looked up by the
 * verified user id (CONVENTIONS §3).
 */

export interface Account {
  email: string;
  emailVerified: boolean;
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
