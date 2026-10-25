import { and, desc, eq, gt, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { Database, Executor } from './client';
import { agentConnection, oauthConsent, oauthRefreshToken, type CLIENTS } from './schema';

/**
 * Agent connections (architecture §6.2, §7.6): one row per Allow, with the classification events
 * carry and the registered name only the person sees.
 */

export type ConnectionRow = typeof agentConnection.$inferSelect;
export type NewConnection = Pick<
  typeof agentConnection.$inferInsert,
  'id' | 'userId' | 'clientId' | 'clientName' | 'registration' | 'client' | 'createdAt'
>;

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

export async function insertConnection(db: Executor, row: NewConnection): Promise<void> {
  await db.insert(agentConnection).values(row);
}

/** Removes a connection whose approval did not go through, so it never shows. */
export async function deleteConnection(db: Executor, userId: string, id: string): Promise<void> {
  await db
    .delete(agentConnection)
    .where(and(eq(agentConnection.id, id), eq(agentConnection.userId, userId)));
}

/** `userId`'s connection `id`, revoked or not, or null when it is not theirs. */
export async function getConnection(
  db: Executor,
  userId: string,
  id: string,
): Promise<ConnectionRow | null> {
  const rows = await db
    .select()
    .from(agentConnection)
    .where(and(eq(agentConnection.id, id), eq(agentConnection.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** The Agent tab: `userId`'s connections that are not revoked, newest first. */
export async function activeConnections(db: Executor, userId: string): Promise<ConnectionRow[]> {
  return db
    .select()
    .from(agentConnection)
    .where(and(eq(agentConnection.userId, userId), isNull(agentConnection.revokedAt)))
    .orderBy(desc(agentConnection.createdAt), desc(agentConnection.id));
}

/**
 * Revokes `userId`'s connection `id` at `at`, with its refresh tokens and any consent left under
 * it: the row as it was, or null when there is no such active connection of theirs.
 */
export async function revokeConnection(
  db: Executor,
  userId: string,
  id: string,
  at: Date,
): Promise<ConnectionRow | null> {
  const [before] = await db
    .select()
    .from(agentConnection)
    .where(
      and(
        eq(agentConnection.id, id),
        eq(agentConnection.userId, userId),
        isNull(agentConnection.revokedAt),
      ),
    )
    .for('update')
    .limit(1);
  if (!before) return null;
  await db.update(agentConnection).set({ revokedAt: at }).where(eq(agentConnection.id, id));
  await db
    .update(oauthRefreshToken)
    .set({ revoked: at })
    .where(
      and(
        eq(oauthRefreshToken.referenceId, id),
        eq(oauthRefreshToken.userId, userId),
        isNull(oauthRefreshToken.revoked),
      ),
    );
  await deleteConsents(db, userId, id);
  return before;
}

/**
 * Revokes every active connection of an account at `at` (`DELETE /api/account`, PRD J10): each
 * row's `revoked_at`, and every refresh token not yet revoked. Returns the revoked connection ids.
 * Unlike `revokeConnection` it writes no audit entry: the audit log is deleted with the account.
 */
export async function revokeAllConnections(
  db: Executor,
  userId: string,
  at: Date,
): Promise<string[]> {
  const rows = await db
    .update(agentConnection)
    .set({ revokedAt: at })
    .where(and(eq(agentConnection.userId, userId), isNull(agentConnection.revokedAt)))
    .returning({ id: agentConnection.id });
  await db
    .update(oauthRefreshToken)
    .set({ revoked: at })
    .where(and(eq(oauthRefreshToken.userId, userId), isNull(oauthRefreshToken.revoked)));
  return rows.map((r) => r.id);
}

/** Deletes the consents an approval wrote under `referenceId`: none is ever reused (§7.6). */
export async function deleteConsents(
  db: Executor,
  userId: string,
  referenceId: string,
): Promise<void> {
  await db
    .delete(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.referenceId, referenceId)));
}

/**
 * Records a call on connection `id` at `at`: `last_used_at`, and `first_call_at` the first time.
 * At most one write a minute per connection, so a busy agent does not write on every call.
 */
export async function touchConnection(db: Executor, id: string, at: Date): Promise<void> {
  const minuteAgo = new Date(at.getTime() - 60_000);
  await db
    .update(agentConnection)
    .set({
      lastUsedAt: at,
      firstCallAt: sql`coalesce(${agentConnection.firstCallAt}, ${at})`,
    })
    .where(
      and(
        eq(agentConnection.id, id),
        or(isNull(agentConnection.lastUsedAt), lt(agentConnection.lastUsedAt, minuteAgo)),
      ),
    );
}

/**
 * The connections whose security email Resend has not accepted, made between `from` and `to`
 * (§7.10's retry: older than 10 minutes, younger than 7 days), oldest first.
 */
export async function unsentSecurityEmails(db: Executor, from: Date, to: Date): Promise<string[]> {
  const rows = await db
    .select({ id: agentConnection.id })
    .from(agentConnection)
    .where(
      and(
        isNull(agentConnection.securityEmailSentAt),
        gt(agentConnection.createdAt, from),
        lte(agentConnection.createdAt, to),
      ),
    )
    .orderBy(agentConnection.createdAt, agentConnection.id);
  return rows.map((r) => r.id);
}

/**
 * How many security emails have waited longer than `before` (24 hours, say) and are younger than
 * `after` (7 days): the health check's `security_email_unsent` (architecture §10, P4-T4). Unsent
 * means `security_email_sent_at` is still null, whatever happened to the connection since.
 */
export async function countUnsentSecurityEmails(
  db: Executor,
  after: Date,
  before: Date,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentConnection)
    .where(
      and(
        isNull(agentConnection.securityEmailSentAt),
        gt(agentConnection.createdAt, after),
        lt(agentConnection.createdAt, before),
      ),
    );
  return rows[0]?.n ?? 0;
}

/**
 * Sends connection `id`'s security email at most once: holds the row while `send` runs, skipping it
 * if another run holds it, and sets `security_email_sent_at` when `send` says it was accepted. The
 * row it sent for, or null when there was nothing to send.
 */
export async function sendSecurityEmailOnce(
  db: Database,
  id: string,
  at: () => Date,
  send: (row: ConnectionRow) => Promise<boolean>,
): Promise<{ row: ConnectionRow; accepted: boolean } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(agentConnection)
      .where(and(eq(agentConnection.id, id), isNull(agentConnection.securityEmailSentAt)))
      .for('update', { skipLocked: true })
      .limit(1);
    if (!row) return null;
    const accepted = await send(row);
    if (accepted) {
      await tx
        .update(agentConnection)
        .set({ securityEmailSentAt: at() })
        .where(eq(agentConnection.id, id));
    }
    return { row, accepted };
  });
}
