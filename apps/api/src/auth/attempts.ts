import type { Database } from '../db/client';
import {
  STEP_TIMEOUT_MS,
  approveAttempt,
  expireAttempts,
  failOpenAttempt,
  failTokenExchange,
  getAttempt,
  insertApprovedAttempt,
  insertAttempt,
  latestOpenAttempt,
  markAttemptLive,
  markAuthorizeSeen,
  markTokenIssued,
  type AttemptCause,
  type AttemptRow,
  type FailedAttempt,
  type FailedStep,
} from '../db/connection-attempts';
import type { CodeGrant } from '../db/oauth';
import type { ATTEMPT_ENTRIES, ATTEMPT_PLATFORMS, ATTEMPT_STATES } from '../db/schema';
import type { Track } from '../events/track';
import { newId } from '../lib/ids';
import { AppError } from '../lib/errors';
import type { Client } from './classify';

/**
 * Connection attempts (PRD J5, architecture §7.2, §7.7): the web app starts one when it shows the
 * steps and polls it every 2 s, so its screen moves on by itself. The OAuth server moves it on:
 * the agent's authorize request, Allow or Cancel, the code exchange, and (P1-T15) the first
 * successful tool call. An approval or a refusal belongs to the person's latest open attempt from
 * the last 15 minutes; with none (they connected from the agent, without NetNet's flow), the
 * connection is still made and its attempt is recorded with `entry: agent`.
 */

export type Entry = (typeof ATTEMPT_ENTRIES)[number];
export type Platform = (typeof ATTEMPT_PLATFORMS)[number];
export type AttemptState = (typeof ATTEMPT_STATES)[number];

export interface AttemptInput {
  client: Client;
  entry: Entry;
  platform: Platform;
}

/** `GET /api/agent/attempts/:id` (§7.2). */
export interface AttemptView {
  id: string;
  state: AttemptState;
  failedStep?: FailedStep;
  cause?: AttemptCause;
}

/** What the attempts, connections and approval share. */
export interface AgentDeps {
  /** Connected as `netnet_app`. */
  db: () => Database;
  clock: () => Date;
  track: Track;
  appVersion: () => string;
  /** Runs work after the response: events and the security email. */
  background: (task: Promise<unknown>) => void;
}

export interface Attempts {
  start(userId: string, input: AttemptInput): Promise<AttemptView>;
  /** The attempt, after any timeout it has reached. `NOT_FOUND` if it is not the person's. */
  read(userId: string, id: string): Promise<AttemptView>;
  /** The agent's authorize request reached NetNet for this person. */
  authorizeSeen(userId: string): Promise<void>;
  /** The agent's authorize request was refused: the open attempt fails at `authorise`. */
  authorizeRefused(userId: string): Promise<void>;
  /** Cancel on the approval page. `client` is the refused client's classification. */
  cancelled(userId: string, client: Client): Promise<void>;
  /** Allow: the attempt the connection belongs to, made if there is none. Returns its entry. */
  approved(userId: string, connectionId: string, client: Client): Promise<Entry>;
  /** The agent exchanged (or failed to exchange) the code for connection `grant.connectionId`. */
  codeExchanged(grant: CodeGrant, ok: boolean): Promise<void>;
  /** The connection's first successful tool call (P1-T15). */
  markLive(userId: string, connectionId: string): Promise<boolean>;
  /** The daily sweep: fails every attempt that has timed out. Returns how many. */
  sweep(): Promise<number>;
}

export function view(row: AttemptRow): AttemptView {
  return {
    id: row.id,
    state: row.state,
    ...(row.failedStep === null ? {} : { failedStep: row.failedStep }),
    ...(row.cause === null ? {} : { cause: row.cause }),
  };
}

export function createAttempts(deps: AgentDeps): Attempts {
  const since = () => new Date(deps.clock().getTime() - STEP_TIMEOUT_MS);

  const failedEvent = (userId: string, step: FailedStep, client: Client, entry: Entry) =>
    deps.background(
      deps.track(
        'agent_connection_failed',
        { step, client, entry },
        { userId, appVersion: deps.appVersion() },
      ),
    );

  const fired = (failed: FailedAttempt[]) => {
    for (const { row, client } of failed) {
      if (row.failedStep !== null) failedEvent(row.userId, row.failedStep, client, row.entry);
    }
  };

  return {
    async start(userId, input) {
      const at = deps.clock();
      const row = await insertAttempt(deps.db(), {
        id: newId('att', at.getTime()),
        userId,
        ...input,
        at,
      });
      return view(row);
    },

    async read(userId, id) {
      const db = deps.db();
      fired(await expireAttempts(db, deps.clock(), { userId, id }));
      const row = await getAttempt(db, userId, id);
      if (!row) throw new AppError('NOT_FOUND', 'There is no such connection attempt.');
      return view(row);
    },

    async authorizeSeen(userId) {
      const db = deps.db();
      const open = await latestOpenAttempt(db, userId, since());
      if (open) await markAuthorizeSeen(db, open.id, deps.clock());
    },

    async authorizeRefused(userId) {
      const db = deps.db();
      const open = await latestOpenAttempt(db, userId, since());
      if (!open) return;
      const row = await failOpenAttempt(db, open.id, 'invalid_request', deps.clock());
      if (row) failedEvent(userId, 'authorise', row.client, row.entry);
    },

    async cancelled(userId, client) {
      const db = deps.db();
      const open = await latestOpenAttempt(db, userId, since());
      const row = open ? await failOpenAttempt(db, open.id, 'cancelled', deps.clock()) : null;
      failedEvent(userId, 'authorise', client, row?.entry ?? 'agent');
    },

    async approved(userId, connectionId, client) {
      const db = deps.db();
      const at = deps.clock();
      const open = await latestOpenAttempt(db, userId, since());
      if (open && (await approveAttempt(db, open.id, connectionId, at))) return open.entry;
      await insertApprovedAttempt(db, {
        id: newId('att', at.getTime()),
        userId,
        client,
        entry: 'agent',
        platform: 'any',
        connectionId,
        at,
      });
      return 'agent';
    },

    async codeExchanged(grant, ok) {
      const db = deps.db();
      const at = deps.clock();
      if (ok) await markTokenIssued(db, grant.userId, grant.connectionId, at);
      else fired(await failTokenExchange(db, grant.userId, grant.connectionId, at));
    },

    markLive(userId, connectionId) {
      return markAttemptLive(deps.db(), userId, connectionId, deps.clock());
    },

    async sweep() {
      const failed = await expireAttempts(deps.db(), deps.clock());
      fired(failed);
      return failed.length;
    },
  };
}
