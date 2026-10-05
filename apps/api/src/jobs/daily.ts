import type { Handler } from 'hono';
import { agent, type Agent } from '../auth/agent';
import type { AppEnv } from '../lib/context';
import { log } from '../lib/log';
import { routeOf } from '../lib/request-context';

/**
 * `GET /api/cron/daily`, at 01:00 UTC (architecture §9.3): the connection-attempt timeout sweep,
 * and the retry of security emails Resend has not accepted, from 10 minutes to 7 days old
 * (§7.10; P3 moves the retry into the reminder runs). A failed send stays unsent for the next run;
 * the run then answers 502, so the cron shows it failed.
 */
export function dailyJob(service: () => Agent = agent): Handler<AppEnv> {
  return async (c) => {
    const { attempts, connections } = service();
    const attemptsFailed = await attempts.sweep();
    const securityEmails = await connections.retrySecurityEmails();
    if (securityEmails.failed > 0) {
      log('security_email_retry_failed', { requestId: c.get('requestId'), route: routeOf(c) });
    }
    return c.json({ attemptsFailed, securityEmails }, securityEmails.failed > 0 ? 502 : 200);
  };
}
