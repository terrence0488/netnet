import { eq } from 'drizzle-orm';
import type { Executor } from './client';
import { oauthClient, verification } from './schema';

/**
 * What the agents' OAuth server stores that NetNet reads itself (architecture §6.2): a client's
 * registration, for the approval page, and an unexchanged code's grant, for the token route.
 * Better Auth writes these tables through its adapter.
 */

export interface OAuthClientView {
  clientId: string;
  /** The name it registered with: untrusted text. */
  name: string | null;
  /** `cimd` for a client discovered from its metadata document; null for one registered by DCR. */
  clientDiscoveryId: string | null;
  redirectUris: string[];
  disabled: boolean;
}

export async function findOAuthClient(
  db: Executor,
  clientId: string,
): Promise<OAuthClientView | null> {
  const rows = await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      clientDiscoveryId: oauthClient.clientDiscoveryId,
      redirectUris: oauthClient.redirectUris,
      disabled: oauthClient.disabled,
    })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, disabled: row.disabled === true } : null;
}

/** Whose code it is and the connection it was approved for. */
export interface CodeGrant {
  userId: string;
  connectionId: string;
}

/**
 * The grant behind an authorization code, found by the code's stored form (`hashToken(code)`), or
 * null when there is none (unknown, used or expired) or it carries no connection.
 */
export async function codeGrant(db: Executor, storedCode: string): Promise<CodeGrant | null> {
  const rows = await db
    .select({ value: verification.value })
    .from(verification)
    .where(eq(verification.identifier, storedCode))
    .limit(1);
  const value = rows[0]?.value;
  if (value === undefined) return null;
  try {
    const parsed = JSON.parse(value) as { type?: unknown; userId?: unknown; referenceId?: unknown };
    if (
      parsed.type === 'authorization_code' &&
      typeof parsed.userId === 'string' &&
      typeof parsed.referenceId === 'string'
    ) {
      return { userId: parsed.userId, connectionId: parsed.referenceId };
    }
  } catch {
    // Not a code's grant.
  }
  return null;
}
