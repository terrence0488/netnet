import {
  activeConnections,
  revokeConnection,
  sendSecurityEmailOnce,
  touchConnection,
  unsentSecurityEmails,
  type ConnectionRow,
} from '../db/agent-connections';
import { getProfile } from '../db/profiles';
import type { REGISTRATIONS } from '../db/schema';
import { recordConnectionRevoke } from '../ledger/connections';
import type { WithUser } from '../ledger/with-user';
import { AppError } from '../lib/errors';
import { log } from '../lib/log';
import type { Notify } from '../notify/message';
import { cleanAgentName, SHOWN_NAME_LENGTH } from './agent-name';
import type { AgentDeps } from './attempts';
import type { Client } from './classify';

/**
 * Agent connections (PRD J5, architecture §7.6, §7.10): the Agent tab's list, revocation, the
 * security email every Allow sends, and what each tool call records (P1-T15).
 */

/** `GET /api/agent/connections` (§7.2): active connections only. */
export interface ConnectionView {
  id: string;
  /** The name it registered with: untrusted, cleaned and cut here, escaped by the web app. */
  clientName: string;
  client: Client;
  registration: (typeof REGISTRATIONS)[number];
  /** False for a DCR client, whose name NetNet cannot check. */
  nameVerified: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** §7.10: retried when older than 10 minutes and younger than 7 days. */
export const SECURITY_EMAIL_RETRY_AFTER_MS = 10 * 60_000;
export const SECURITY_EMAIL_RETRY_FOR_MS = 7 * 24 * 60 * 60_000;

export interface ConnectionDeps extends AgentDeps {
  withUser: WithUser;
  notify: Notify;
}

export interface Connections {
  list(userId: string): Promise<ConnectionView[]>;
  /**
   * Revokes `userId`'s connection `id`: `revoked_at`, its refresh tokens, and an audit entry. The
   * ledger's data version after it (null without a ledger), or `NOT_FOUND`.
   */
  revoke(userId: string, id: string): Promise<{ dataVersion: number | null }>;
  /** A tool call on the connection (P1-T15): `last_used_at`, and `first_call_at` the first time. */
  touch(connectionId: string): Promise<void>;
  /** Sends connection `id`'s security email unless Resend has already accepted it. */
  sendSecurityEmail(id: string): Promise<'sent' | 'failed' | 'none'>;
  /** The retry (§7.10 step 4): every unsent security email from 10 minutes to 7 days old. */
  retrySecurityEmails(): Promise<{ sent: number; failed: number }>;
}

export function connectionView(row: ConnectionRow): ConnectionView {
  return {
    id: row.id,
    clientName: cleanAgentName(row.clientName, SHOWN_NAME_LENGTH),
    client: row.client,
    registration: row.registration,
    nameVerified: row.registration === 'cimd',
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

/** What the audit entry keeps of a connection: never a token. */
function audited(row: ConnectionRow, revokedAt: Date | null) {
  return {
    id: row.id,
    client: row.client,
    clientName: row.clientName,
    registration: row.registration,
    createdAt: row.createdAt.toISOString(),
    revokedAt: revokedAt?.toISOString() ?? null,
  };
}

export function createConnections(deps: ConnectionDeps): Connections {
  const sendSecurityEmail = async (id: string): Promise<'sent' | 'failed' | 'none'> => {
    const db = deps.db();
    const outcome = await sendSecurityEmailOnce(db, id, deps.clock, async (row) => {
      const profile = await getProfile(db, row.userId);
      const delivery = await deps.notify(row.userId, {
        kind: 'security.agent_connected',
        agentName: row.clientName,
        nameVerified: row.registration === 'cimd',
        connectedAt: row.createdAt.toISOString(),
        timeZone: profile?.timeZone ?? 'UTC',
      });
      return delivery.channel === 'email';
    });
    if (outcome === null) return 'none';
    if (!outcome.accepted) {
      log('security_email_failed', { userId: outcome.row.userId, connectionId: id });
      return 'failed';
    }
    deps.background(
      deps.track(
        'security_email_sent',
        { client: outcome.row.client },
        { userId: outcome.row.userId, appVersion: deps.appVersion() },
      ),
    );
    return 'sent';
  };

  return {
    async list(userId) {
      return (await activeConnections(deps.db(), userId)).map(connectionView);
    },

    async revoke(userId, id) {
      const dataVersion = await deps.withUser(
        userId,
        { kind: 'user' },
        async (tx) => {
          const at = tx.now();
          const before = await revokeConnection(tx.db, userId, id, at);
          if (!before) throw new AppError('NOT_FOUND', 'There is no such active connection.');
          return recordConnectionRevoke(tx, id, audited(before, null), audited(before, at));
        },
        { write: true },
      );
      return { dataVersion };
    },

    touch(connectionId) {
      return touchConnection(deps.db(), connectionId, deps.clock());
    },

    sendSecurityEmail,

    async retrySecurityEmails() {
      const now = deps.clock().getTime();
      const ids = await unsentSecurityEmails(
        deps.db(),
        new Date(now - SECURITY_EMAIL_RETRY_FOR_MS),
        new Date(now - SECURITY_EMAIL_RETRY_AFTER_MS),
      );
      let sent = 0;
      let failed = 0;
      for (const id of ids) {
        const outcome = await sendSecurityEmail(id);
        if (outcome === 'sent') sent += 1;
        if (outcome === 'failed') failed += 1;
      }
      return { sent, failed };
    },
  };
}
