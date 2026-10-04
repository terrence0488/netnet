import { eq } from 'drizzle-orm';
import { ledgerState } from './schema';
import type { LedgerTx } from './with-user';

/**
 * The ledger's `data_version` (architecture §7.2's snapshot ETag), or null before the ledger
 * exists: one indexed read, so `GET /api/snapshot` can answer `304` without loading the snapshot.
 * Inside the caller's `withUser` transaction, so row-level security applies to it too.
 */
export async function dataVersionOf(tx: LedgerTx): Promise<number | null> {
  const rows = await tx.db
    .select({ dataVersion: ledgerState.dataVersion })
    .from(ledgerState)
    .where(eq(ledgerState.userId, tx.userId))
    .limit(1);
  return rows[0]?.dataVersion ?? null;
}
