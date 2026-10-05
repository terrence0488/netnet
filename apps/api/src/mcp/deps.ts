import { markAttemptLive, touchConnection } from '../auth/agent';
import { verifyAccessToken, type VerifyAccessToken } from '../auth/mcp-token';
import { crossRate, type Fx } from '../content/fx';
import { contentStore, type ContentStore } from '../content/store';
import { database, type Database } from '../db/client';
import { ensureProfile, type Profile } from '../db/profiles';
import { appVersion } from '../events/app-version';
import { track, type Track } from '../events/track';
import { withUser, type WithUser } from '../ledger/with-user';
import { publicOrigin } from '../lib/env';
import { rateLimit, type RateLimit } from '../lib/rate-limit';

/**
 * What the MCP server is built over (architecture §7.4): the token check, the database as
 * `netnet_app`, the person's profile, exchange rates, published content, rate limits, analytics
 * and the clock. Tests build their own; the running app uses `appMcpDeps`.
 */
export interface McpDeps {
  /** The agent's token check: issuer, audience, expiry and scope, no database lookup. */
  verify: VerifyAccessToken;
  /** Connected as `netnet_app`, which cannot bypass row-level security. */
  db: () => Database;
  withUser: WithUser;
  /** The person's profile (country, time zone, segment), made with defaults if missing. */
  profile: (userId: string) => Promise<Profile>;
  /** Rates for a value's date; tests pass a fake. */
  fx: Pick<Fx, 'crossRate'>;
  content: () => ContentStore;
  rateLimit: RateLimit;
  track: Track;
  appVersion: () => string;
  clock: () => Date;
  /** NetNet's origin: the `/mcp` audience's base, named in the 401 challenge. */
  origin: () => string;
  /**
   * The connection's attempt goes `live`: after the first successful tool call (J5). False when
   * it already was.
   */
  markLive: (userId: string, connectionId: string) => Promise<boolean>;
  /** A tool call on the connection: `last_used_at`, and `first_call_at` the first time. */
  touch: (connectionId: string) => Promise<void>;
  /**
   * P3 (J12) HOOK: `touchChecked(userId)` — the person has checked NetNet today — goes here. It
   * runs after a `tools/call`, read or write, and only there: `tools/list` and the handshake
   * must never reach it. A no-op until P3 implements it.
   */
  touchChecked: (userId: string) => Promise<void>;
}

export const appMcpDeps: McpDeps = {
  verify: verifyAccessToken,
  db: database,
  withUser,
  profile: (userId) => ensureProfile(database(), userId),
  fx: { crossRate },
  content: contentStore,
  rateLimit,
  track,
  appVersion,
  clock: () => new Date(),
  origin: publicOrigin,
  markLive: markAttemptLive,
  touch: touchConnection,
  touchChecked: () => Promise.resolve(),
};
