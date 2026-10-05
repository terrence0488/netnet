import { eq, sql } from 'drizzle-orm';
import { newId } from '../lib/ids';
import { audit, ledgerState } from './schema';
import type { LedgerTx } from './with-user';

/**
 * Agent connections in the person's own record (PRD J5, architecture §7.6): revoking one is an
 * audit entry, so it shows in Activity beside what the agent wrote. A connection lives in `core`;
 * only its audit entry is in the ledger, written here, in the `withUser(…, {write: true})`
 * transaction that revokes it, with `data_version + 1` like every other entry.
 */

/** The audit entry's action and entity. */
export const CONNECTION_REVOKE = 'connection.revoke';
export const CONNECTION_ENTITY = 'connection';

/**
 * Records that the person revoked connection `connectionId`, with the connection as it was and as
 * it is. Returns the data version after it, or null when the person has no ledger yet (nothing to
 * audit against: the agent could not have written anything).
 */
export async function recordConnectionRevoke(
  tx: LedgerTx,
  connectionId: string,
  before: unknown,
  after: unknown,
): Promise<number | null> {
  if (!tx.write || tx.actor.kind !== 'user') {
    throw new Error('recordConnectionRevoke(): the person revokes, in a write transaction.');
  }
  const at = tx.now();
  const [state] = await tx.db
    .select({ userId: ledgerState.userId })
    .from(ledgerState)
    .where(eq(ledgerState.userId, tx.userId))
    .limit(1);
  if (!state) return null;
  await tx.db.insert(audit).values({
    userId: tx.userId,
    id: newId('aud', at.getTime()),
    at,
    actor: 'user',
    clientName: null,
    connectionId: null,
    batchId: null,
    action: CONNECTION_REVOKE,
    entity: CONNECTION_ENTITY,
    entityId: connectionId,
    before,
    after,
  });
  const [row] = await tx.db
    .update(ledgerState)
    .set({ dataVersion: sql`${ledgerState.dataVersion} + 1` })
    .where(eq(ledgerState.userId, tx.userId))
    .returning({ dataVersion: ledgerState.dataVersion });
  if (!row) throw new Error('The ledger state vanished inside its own write.');
  return row.dataVersion;
}
