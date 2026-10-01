import { sql } from 'drizzle-orm';
import { isConnectionActive } from '../db/agent-connections';
import { database, type Database, type Transaction } from '../db/client';

/** Who is acting: the person on the web, an agent through one of their connections, or NetNet. */
export type Actor = {
  kind: 'user' | 'agent' | 'system';
  connectionId?: string;
  clientName?: string;
};

/**
 * What `withUser` hands its callback: the Drizzle transaction (`db`), with `app.user_id` set for
 * it alone, plus the actor and the clock. `now()` is the instant the transaction got under way
 * (after the write lock, for a write), the same on every call, so one write's rows share it.
 * P1-T10 builds the `Ledger` interface on this.
 */
export interface LedgerTx {
  readonly db: Transaction;
  readonly userId: string;
  readonly actor: Actor;
  now(): Date;
}

/**
 * The agent's connection is not one of the user's, or it has been revoked. The MCP route maps it
 * to `401 invalid_token`, so the agent has to be reconnected.
 */
export class ConnectionRevoked extends Error {
  override readonly name = 'ConnectionRevoked';
  readonly connectionId: string | undefined;

  constructor(connectionId: string | undefined) {
    super('This agent connection has been revoked or does not belong to this user.');
    this.connectionId = connectionId;
  }
}

export interface WithUserDeps {
  /** Connected as `netnet_app`, which cannot bypass row-level security. */
  db: Database;
  /** The clock behind `LedgerTx.now()`; tests pass a fixed one. */
  clock: () => Date;
}

export type WithUser = <T>(
  userId: string,
  actor: Actor,
  fn: (tx: LedgerTx) => Promise<T>,
  opts?: { write?: boolean },
) => Promise<T>;

/**
 * Builds `withUser` over a given database and clock. The app uses `withUser` below; tests and
 * scripts build their own.
 */
export function createWithUser(deps: () => WithUserDeps): WithUser {
  return async (userId, actor, fn, opts) => {
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('withUser(): userId must be the verified user id');
    }
    const { db, clock } = deps();
    return db.transaction(async (tx) => {
      // Transaction-local (`true`): it ends with the transaction, which is what makes it safe on
      // a pooled connection that the next request will reuse.
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      if (opts?.write) {
        // The per-user write lock: one user's writes run one at a time (architecture §6.1).
        await tx.execute(
          sql`select user_id from ledger.ledger_state where user_id = ${userId} for update`,
        );
      }
      // After the lock, so a revocation that committed while this write waited is seen.
      if (actor.kind === 'agent') {
        const { connectionId } = actor;
        if (!connectionId || !(await isConnectionActive(tx, userId, connectionId))) {
          throw new ConnectionRevoked(connectionId);
        }
      }
      const startedAt = clock().getTime();
      return fn({ db: tx, userId, actor, now: () => new Date(startedAt) });
    });
  };
}

/**
 * The only way into the `ledger` schema (architecture §7.3). Opens a transaction as `netnet_app`,
 * sets `app.user_id` for that transaction alone, checks an agent's connection on every call, and
 * for a write takes the user's `ledger_state` row lock. `userId` comes only from the verified
 * session or token, never from a request body, path or query (CONVENTIONS §3).
 */
export const withUser: WithUser = createWithUser(() => ({
  db: database(),
  clock: () => new Date(),
}));
