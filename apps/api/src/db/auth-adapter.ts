import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Database } from './client';
import {
  account,
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  session,
  user,
  verification,
} from './schema';

/**
 * Better Auth's way into its tables in `core` (architecture §6.2): its Drizzle adapter over the
 * app's `netnet_app` connection, for accounts and for the agents' OAuth server. Sign-up runs in
 * one transaction, so a person never exists without their password or their session.
 */
export function authAdapter(db: Database) {
  return drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
      jwks,
      oauthClient,
      oauthResource,
      oauthClientResource,
      oauthRefreshToken,
      oauthAccessToken,
      oauthConsent,
      oauthClientAssertion,
    },
    transaction: true,
  });
}
