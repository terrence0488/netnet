import type { Handler } from 'hono';
import { agent, type Agent } from '../auth/agent';
import { database } from '../db/client';
import { purgeOAuthArtifacts, type OAuthPurgeCounts } from '../db/oauth-purge';
import { deleteSaltsBefore, utcDay } from '../db/visitor';
import type { AppEnv } from '../lib/context';

/**
 * `GET /api/cron/daily` (architecture §9.3), called from GitHub Actions: the connection-attempt
 * timeout sweep, the OAuth artifacts past their life deleted (§6.2, P4-T20), and the landing
 * page's past salts deleted (§6.4), for a day with no `landing_view` to delete them on its first
 * read. It answers counts only: attempts failed, salts deleted, one count per OAuth class. The
 * security-email retry used to run here too; P3 moved it into the reminder runs
 * (`/api/cron/reminders`, §7.10 step 4), which run three times a day.
 */
export function dailyJob(
  service: () => Agent = agent,
  sweepSalts: () => Promise<number> = () => deleteSaltsBefore(database(), utcDay(new Date())),
  purgeOAuth: () => Promise<OAuthPurgeCounts> = () => purgeOAuthArtifacts(database(), new Date()),
): Handler<AppEnv> {
  return async (c) => {
    const { attempts } = service();
    const attemptsFailed = await attempts.sweep();
    const saltsDeleted = await sweepSalts();
    const oauthPurged = await purgeOAuth();
    return c.json({ attemptsFailed, saltsDeleted, oauthPurged });
  };
}
