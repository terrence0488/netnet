import { eq } from 'drizzle-orm';
import { ledgerState } from './schema';
import type { WithUser } from './with-user';

/**
 * The currency totals are shown in (`ledger_state.base_currency`), or null until the ledger
 * exists: it is made when the person first confirms where they live (P1-T12). A read-only
 * `withUser` transaction, so row-level security applies as to every ledger read.
 */
export async function baseCurrencyOf(withUser: WithUser, userId: string): Promise<string | null> {
  return withUser(userId, { kind: 'user' }, async ({ db }) => {
    const rows = await db
      .select({ baseCurrency: ledgerState.baseCurrency })
      .from(ledgerState)
      .where(eq(ledgerState.userId, userId))
      .limit(1);
    return rows[0]?.baseCurrency ?? null;
  });
}
