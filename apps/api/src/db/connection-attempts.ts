import { and, desc, eq, gte, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { Executor } from './client';
import {
  agentConnection,
  connectionAttempt,
  type ATTEMPT_CAUSES,
  type ATTEMPT_ENTRIES,
  type ATTEMPT_FAILED_STEPS,
  type ATTEMPT_PLATFORMS,
  type CLIENTS,
} from './schema';

/**
 * Connection attempts (architecture §6.2, PRD J5): what the web app polls so its connect flow moves
 * on by itself. `started` → `approved` (Allow) → `live` (the first successful tool call), or
 * `failed` at one step. Timeouts are applied when an attempt is read and by the daily sweep, each
 * by one conditional UPDATE, so an attempt fails once however many readers race.
 */

export type AttemptRow = typeof connectionAttempt.$inferSelect;
type Client = (typeof CLIENTS)[number];
export type FailedStep = (typeof ATTEMPT_FAILED_STEPS)[number];
export type AttemptCause = (typeof ATTEMPT_CAUSES)[number];

export interface NewAttempt {
  id: string;
  userId: string;
  client: Client;
  entry: (typeof ATTEMPT_ENTRIES)[number];
  platform: (typeof ATTEMPT_PLATFORMS)[number];
  at: Date;
}

/** How long each step may take before the attempt fails (PRD J5, architecture §7.7). */
export const STEP_TIMEOUT_MS = 15 * 60_000;

/** A failed attempt, with the client its event names: the guide chosen, or the connection's. */
export interface FailedAttempt {
  row: AttemptRow;
  client: Client;
}

export async function insertAttempt(db: Executor, a: NewAttempt): Promise<AttemptRow> {
  const [row] = await db
    .insert(connectionAttempt)
    .values({
      id: a.id,
      userId: a.userId,
      client: a.client,
      entry: a.entry,
      platform: a.platform,
      startedAt: a.at,
      updatedAt: a.at,
    })
    .returning();
  if (!row) throw new Error('insertAttempt(): no row came back');
  return row;
}

/** An approved attempt for a connection made from the agent, with no NetNet flow open. */
export async function insertApprovedAttempt(
  db: Executor,
  a: NewAttempt & { connectionId: string },
): Promise<AttemptRow> {
  const [row] = await db
    .insert(connectionAttempt)
    .values({
      id: a.id,
      userId: a.userId,
      client: a.client,
      entry: a.entry,
      platform: a.platform,
      state: 'approved',
      connectionId: a.connectionId,
      authorizeSeenAt: a.at,
      startedAt: a.at,
      updatedAt: a.at,
    })
    .returning();
  if (!row) throw new Error('insertApprovedAttempt(): no row came back');
  return row;
}

export async function getAttempt(
  db: Executor,
  userId: string,
  id: string,
): Promise<AttemptRow | null> {
  const rows = await db
    .select()
    .from(connectionAttempt)
    .where(and(eq(connectionAttempt.id, id), eq(connectionAttempt.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * `userId`'s latest attempt still `started` whose last sign of life (its start, or the agent's
 * authorize request) was at or after `since`: the one an approval or a refusal belongs to.
 */
export async function latestOpenAttempt(
  db: Executor,
  userId: string,
  since: Date,
): Promise<AttemptRow | null> {
  const rows = await db
    .select()
    .from(connectionAttempt)
    .where(
      and(
        eq(connectionAttempt.userId, userId),
        eq(connectionAttempt.state, 'started'),
        gte(
          sql`coalesce(${connectionAttempt.authorizeSeenAt}, ${connectionAttempt.startedAt})`,
          since,
        ),
      ),
    )
    .orderBy(desc(connectionAttempt.startedAt), desc(connectionAttempt.id))
    .limit(1);
  return rows[0] ?? null;
}

/** The agent's authorize request reached NetNet for this attempt: no `discovery` timeout now. */
export async function markAuthorizeSeen(db: Executor, id: string, at: Date): Promise<void> {
  await db
    .update(connectionAttempt)
    .set({ authorizeSeenAt: at, updatedAt: at })
    .where(
      and(
        eq(connectionAttempt.id, id),
        eq(connectionAttempt.state, 'started'),
        isNull(connectionAttempt.authorizeSeenAt),
      ),
    );
}

/** Allow: the attempt moves on to `approved` with its connection. False if it was not open. */
export async function approveAttempt(
  db: Executor,
  id: string,
  connectionId: string,
  at: Date,
): Promise<boolean> {
  const rows = await db
    .update(connectionAttempt)
    .set({
      state: 'approved',
      connectionId,
      authorizeSeenAt: sql`coalesce(${connectionAttempt.authorizeSeenAt}, ${at})`,
      updatedAt: at,
    })
    .where(and(eq(connectionAttempt.id, id), eq(connectionAttempt.state, 'started')))
    .returning({ id: connectionAttempt.id });
  return rows.length === 1;
}

/** Fails attempt `id` while it is still `started` (Cancel, or an invalid authorize request). */
export async function failOpenAttempt(
  db: Executor,
  id: string,
  cause: AttemptCause,
  at: Date,
): Promise<AttemptRow | null> {
  const [row] = await db
    .update(connectionAttempt)
    .set({ state: 'failed', failedStep: 'authorise', cause, updatedAt: at })
    .where(and(eq(connectionAttempt.id, id), eq(connectionAttempt.state, 'started')))
    .returning();
  return row ?? null;
}

/** The connection's approved attempt, waiting for its token. */
function awaitingToken(userId: string, connectionId: string): SQL | undefined {
  return and(
    eq(connectionAttempt.userId, userId),
    eq(connectionAttempt.connectionId, connectionId),
    eq(connectionAttempt.state, 'approved'),
    isNull(connectionAttempt.tokenIssuedAt),
  );
}

/** The agent exchanged its code: the `first_call` timeout counts from now. */
export async function markTokenIssued(
  db: Executor,
  userId: string,
  connectionId: string,
  at: Date,
): Promise<void> {
  await db
    .update(connectionAttempt)
    .set({ tokenIssuedAt: at, updatedAt: at })
    .where(awaitingToken(userId, connectionId));
}

/** The agent's code exchange was refused: the attempt fails at `callback`. */
export async function failTokenExchange(
  db: Executor,
  userId: string,
  connectionId: string,
  at: Date,
): Promise<FailedAttempt[]> {
  const rows = await db
    .update(connectionAttempt)
    .set({ state: 'failed', failedStep: 'callback', cause: 'token_rejected', updatedAt: at })
    .where(awaitingToken(userId, connectionId))
    .returning();
  return withClients(db, rows);
}

/** The first successful tool call: `approved` → `live`. False if no attempt was waiting for it. */
export async function markAttemptLive(
  db: Executor,
  userId: string,
  connectionId: string,
  at: Date,
): Promise<boolean> {
  const rows = await db
    .update(connectionAttempt)
    .set({ state: 'live', updatedAt: at })
    .where(
      and(
        eq(connectionAttempt.userId, userId),
        eq(connectionAttempt.connectionId, connectionId),
        eq(connectionAttempt.state, 'approved'),
      ),
    )
    .returning({ id: connectionAttempt.id });
  return rows.length > 0;
}

/**
 * The timeouts, each one condition: `discovery`, no authorize request within 15 minutes of the
 * start; `callback`, no token within 15 minutes of the Allow (the code has expired by then);
 * `first_call`, no successful call within 15 minutes of the token.
 */
function timeouts(cutoff: Date): { step: FailedStep; when: SQL | undefined }[] {
  const a = connectionAttempt;
  return [
    {
      step: 'discovery',
      when: and(eq(a.state, 'started'), isNull(a.authorizeSeenAt), lte(a.startedAt, cutoff)),
    },
    {
      step: 'callback',
      when: and(eq(a.state, 'approved'), isNull(a.tokenIssuedAt), lte(a.updatedAt, cutoff)),
    },
    {
      step: 'first_call',
      when: and(eq(a.state, 'approved'), isNotNull(a.tokenIssuedAt), lte(a.tokenIssuedAt, cutoff)),
    },
  ];
}

/**
 * Fails the attempts that have timed out at `now`: one (`scope` names a user and an attempt, as a
 * read does) or every user's (the daily sweep). Returns what it failed.
 */
export async function expireAttempts(
  db: Executor,
  now: Date,
  scope?: { userId: string; id: string },
): Promise<FailedAttempt[]> {
  const cutoff = new Date(now.getTime() - STEP_TIMEOUT_MS);
  const within = scope
    ? and(eq(connectionAttempt.userId, scope.userId), eq(connectionAttempt.id, scope.id))
    : undefined;
  const failed: AttemptRow[] = [];
  for (const { step, when } of timeouts(cutoff)) {
    failed.push(
      ...(await db
        .update(connectionAttempt)
        .set({ state: 'failed', failedStep: step, cause: 'timed_out', updatedAt: now })
        .where(and(when, within))
        .returning()),
    );
  }
  return withClients(db, failed);
}

/**
 * The client each failure's event names (architecture §7.7): the connection's classification once
 * there is one, else the guide the person chose.
 */
async function withClients(db: Executor, rows: AttemptRow[]): Promise<FailedAttempt[]> {
  const out: FailedAttempt[] = [];
  for (const row of rows) {
    let client = row.client;
    if (row.connectionId !== null) {
      const [connection] = await db
        .select({ client: agentConnection.client })
        .from(agentConnection)
        .where(eq(agentConnection.id, row.connectionId))
        .limit(1);
      client = connection?.client ?? client;
    }
    out.push({ row, client });
  }
  return out;
}
