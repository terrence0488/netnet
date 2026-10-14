import { eq } from 'drizzle-orm';
import { ledgerState } from './schema';
import type { Scope } from './scope';
import { requireWrite } from './write';

/**
 * `destroy` (PRD J10, architecture §7.3): deletes every ledger row for this user. Deleting the
 * `ledger_state` row deletes the rest with it — every table hangs off it with `onDelete: cascade`
 * — in one statement, so there is no half-deleted ledger. It writes no audit row and bumps no
 * version: the log it would write to is among what it deletes. Before the ledger exists it deletes
 * nothing. Only `DELETE /api/account` calls it, inside the account's deletion.
 */
export async function destroy(s: Scope): Promise<void> {
  requireWrite(s, 'destroy');
  await s.db.delete(ledgerState).where(eq(ledgerState.userId, s.userId));
}
