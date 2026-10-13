import type { Handler } from 'hono';
import { agent, type Agent } from '../auth/agent';
import type { AppEnv } from '../lib/context';

/**
 * `GET /api/cron/daily` (architecture §9.3): the connection-attempt timeout sweep, called from
 * GitHub Actions. The security-email retry used to run here too; P3 moved it into the reminder
 * runs (`/api/cron/reminders`, §7.10 step 4), which run three times a day.
 */
export function dailyJob(service: () => Agent = agent): Handler<AppEnv> {
  return async (c) => {
    const { attempts } = service();
    const attemptsFailed = await attempts.sweep();
    return c.json({ attemptsFailed });
  };
}
