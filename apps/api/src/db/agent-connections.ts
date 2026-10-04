import { and, eq, isNull } from 'drizzle-orm';
import type { Executor } from './client';
import { agentConnection, type CLIENTS } from './schema';

/**
 * Whether `connectionId` is one of `userId`'s connections and has not been revoked. `withUser`
 * asks on every agent call, inside its transaction, so a revocation applies to the next call
 * whatever the life left on the access token (architecture §7.6).
 */
export async function isConnectionActive(
  db: Executor,
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: agentConnection.id })
    .from(agentConnection)
    .where(
      and(
        eq(agentConnection.id, connectionId),
        eq(agentConnection.userId, userId),
        isNull(agentConnection.revokedAt),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

/**
 * Every one of `userId`'s agent connections, revoked ones included, oldest first: the Ledger's
 * context lists them (architecture §7.5) with their classification, never their registered name.
 */
export async function listConnections(
  db: Executor,
  userId: string,
): Promise<{ id: string; client: (typeof CLIENTS)[number] }[]> {
  return db
    .select({ id: agentConnection.id, client: agentConnection.client })
    .from(agentConnection)
    .where(eq(agentConnection.userId, userId))
    .orderBy(agentConnection.createdAt, agentConnection.id);
}
