import { sql, type SQL } from 'drizzle-orm';
import { isForeignKeyViolation, type Database } from './client';

/**
 * The daily run's OAuth sweep (architecture §6.2, §9.3; security review L-4): every artifact past
 * its life, deleted in one transaction per class and reported as counts only.
 *
 * A DCR or CIMD client goes once it has no access token, no refresh token and no consent and has
 * not been touched for {@link CLIENT_UNUSED_DAYS} days — a named guide's client is treated like any
 * other. A client an unrevoked agent connection still names stays, so a live connection keeps
 * working even if its tokens were swept. Expired authorization codes (`core.verification` rows the
 * OAuth provider stores hashed) and access tokens go; refresh tokens go once revoked or expired;
 * consents go once their client or their connection is gone. `oauth_client_resource` rows whose
 * client is gone are a backstop (the foreign key cascades), and so are consents whose client is
 * gone (the foreign key does not); neither can exist while its client does.
 *
 * Counts are numbers only: no id, token, name or address leaves the sweep.
 */

/** How long a client with no token and no consent may go untouched before the sweep deletes it. */
export const CLIENT_UNUSED_DAYS = 30;

/** {@link CLIENT_UNUSED_DAYS} in milliseconds. */
export const CLIENT_UNUSED_MS = CLIENT_UNUSED_DAYS * 24 * 60 * 60_000;

/** What one run deleted, one count per class. */
export interface OAuthPurgeCounts {
  /** DCR/CIMD clients with no token, no consent and no live connection, unused for 30 days. */
  clients: number;
  /** `oauth_client_resource` rows whose client is gone. */
  clientResources: number;
  /** Expired authorization codes. */
  codes: number;
  /** Expired access tokens. */
  accessTokens: number;
  /** Revoked or expired refresh tokens. */
  refreshTokens: number;
  /** Consents whose client or connection is gone. */
  consents: number;
}

/** Runs `statement` in a transaction of its own and counts the rows it removed. */
async function deleted(db: Database, statement: SQL): Promise<number> {
  return db.transaction(async (tx) => {
    const result = await tx.execute(statement);
    return result.rowCount ?? 0;
  });
}

/**
 * Deletes every OAuth artifact past its life at `now` and returns the counts, one transaction per
 * class. The order lets a class make another's rows eligible: expired tokens and stray consents go
 * before their now-unused client does.
 */
export async function purgeOAuthArtifacts(db: Database, now: Date): Promise<OAuthPurgeCounts> {
  const cutoff = new Date(now.getTime() - CLIENT_UNUSED_MS);

  const codes = await deleted(
    db,
    sql`delete from core.verification
        where expires_at <= ${now}
          and value like ${'{"type":"authorization_code"%'}`,
  );

  const accessTokens = await deleted(
    db,
    sql`delete from core.oauth_access_token where expires_at <= ${now}`,
  );

  // Deleting a refresh token cascades to the access tokens issued from it, as the schema says.
  const refreshTokens = await deleted(
    db,
    sql`delete from core.oauth_refresh_token
        where revoked is not null or expires_at <= ${now}`,
  );

  // A consent lives only inside the Allow that writes it (§7.6). One left behind knows a client
  // and a connection only while both exist: a null or dangling reference is nobody's consent.
  const consents = await deleted(
    db,
    sql`delete from core.oauth_consent n
        where not exists (
            select 1 from core.oauth_client c where c.client_id = n.client_id
          )
          or not exists (
            select 1 from core.agent_connection a where a.id = n.reference_id
          )`,
  );

  const clientResources = await deleted(
    db,
    sql`delete from core.oauth_client_resource r
        where not exists (
          select 1 from core.oauth_client c where c.client_id = r.client_id
        )`,
  );

  let clients: number;
  try {
    clients = await deleted(
      db,
      sql`delete from core.oauth_client c
          where coalesce(c.updated_at, c.created_at) <= ${cutoff}
            and not exists (
              select 1 from core.oauth_access_token t where t.client_id = c.client_id
            )
            and not exists (
              select 1 from core.oauth_refresh_token r where r.client_id = c.client_id
            )
            and not exists (
              select 1 from core.oauth_consent n where n.client_id = c.client_id
            )
            and not exists (
              select 1 from core.agent_connection a
              where a.client_id = c.client_id and a.revoked_at is null
            )`,
    );
  } catch (error) {
    // A token was issued for the client between the check and the delete: keep it for the next
    // run rather than fail the whole daily job (the check and the delete cannot be one lock).
    if (isForeignKeyViolation(error)) clients = 0;
    else throw error;
  }

  return { clients, clientResources, codes, accessTokens, refreshTokens, consents };
}
