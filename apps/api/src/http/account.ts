import { ERASED_WITHIN_DAYS } from '@netnet/contracts';
import { Hono } from 'hono';
import { revokeAllConnections } from '../db/agent-connections';
import { rekeyEvents } from '../db/analytics';
import { database, type Executor } from '../db/client';
import { deleteAttemptsForUser } from '../db/connection-attempts';
import { deleteEndpointsForUser } from '../db/endpoints';
import { deleteProfile, deleteUser, ensureProfile, type Profile } from '../db/profiles';
import { deleteReminderState } from '../db/reminders';
import { requireRecentSignIn } from '../auth/session';
import { appVersion } from '../events/app-version';
import { track, type Track } from '../events/track';
import { appLedgerOptions } from '../ledger/content';
import { openLedger, type LedgerOptions } from '../ledger/ledger';
import { withUser, type WithUser } from '../ledger/with-user';
import type { AppEnv } from '../lib/context';
import { newId } from '../lib/ids';

/**
 * `DELETE /api/account` (architecture §7.2, §8, PRD J10): the account, gone. It needs a sign-in
 * from the last 10 minutes (`REAUTH_REQUIRED` otherwise), then, in one operation: every agent
 * connection revoked, the ledger rows, identity, sessions, OAuth grants, connections, endpoints
 * and reminder state deleted, the analytics events re-keyed to a random id, and `account_deleted`
 * fired — with no `push_disabled`. No row in `core` or `ledger` carries the id afterwards, and
 * none can come back: every `core` table keyed by a person's id references the user row, so a
 * request that races the deletion (this one's own `touchChecked`, after the response) cannot
 * write one. The user is the session's, never one named in the request (CONVENTIONS §3).
 */

export interface AccountDeps {
  db: () => Executor;
  withUser: WithUser;
  /** The person's profile (country, time zone, segment), made with its defaults if missing. */
  profile: (userId: string) => Promise<Profile>;
  /** The Ledger's options for this person. */
  options: (profile: Profile) => LedgerOptions;
  track: Track;
  appVersion: () => string;
  clock: () => Date;
}

export function accountRoutes(
  deps: AccountDeps = {
    db: database,
    withUser,
    profile: (userId) => ensureProfile(database(), userId),
    options: appLedgerOptions,
    track,
    appVersion,
    clock: () => new Date(),
  },
): Hono<AppEnv> {
  return new Hono<AppEnv>().delete('/', async (c) => {
    const { userId } = await requireRecentSignIn(c, deps.clock);
    const profile = await deps.profile(userId);
    const options = deps.options(profile);
    // The id the re-keyed events (and `account_deleted` itself) point at: fresh, and no account's.
    const randomId = newId('usr');
    await deps.withUser(
      userId,
      { kind: 'user' },
      async (tx) => {
        const at = tx.now();
        // The account row first, under its exclusive lock: a write that reached `withUser` before
        // this point holds the share lock and this delete waits for it, then the ledger destroy
        // below sweeps what it wrote; one that comes after finds no account and fails. Running it
        // before `destroy()` is what leaves no ledger row for an erased id (review L-2).
        await deleteUser(tx.db, userId);
        await revokeAllConnections(tx.db, userId, at);
        await openLedger(tx, options).destroy();
        await deleteEndpointsForUser(tx.db, userId);
        await deleteReminderState(tx.db, userId);
        await deleteAttemptsForUser(tx.db, userId);
        await deleteProfile(tx.db, userId);
        // After the user row's delete: an event write that held the row first has committed, so
        // this reaches it, and one that comes later finds no account and writes nothing.
        await rekeyEvents(tx.db, userId, randomId);
      },
      { write: true },
    );
    // After the deletion commits, on the random id, with the segment read before: nothing emitted
    // points at the deleted account, and the event still counts.
    await deps.track(
      'account_deleted',
      {},
      { rekeyedUserId: randomId, segment: profile.segment, appVersion: deps.appVersion() },
    );
    return c.json({ erasedWithinDays: ERASED_WITHIN_DAYS });
  });
}
