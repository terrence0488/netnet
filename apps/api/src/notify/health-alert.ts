/**
 * The Founder's daily health alert (architecture §7.10, §9.3, §9.4; P4-T4): the typed parameters of
 * an `ops.health_alert` message, the label and §9.4 action each trigger carries, and the one line a
 * trigger contributes to the email. Pure: the thresholds live in `jobs/health.ts`, and this file
 * only names and formats what it is told. There is no field for a user id, an address, a name or an
 * amount: counts, sizes, percentages and dates only.
 */

/** A figure the check could not read. It fires its own `unreadable_<source>` trigger. */
export interface Unavailable {
  unavailable: true;
}

/** A figure, or the fact that it could not be read. */
export type Reading<T> = T | Unavailable;

/** Narrows a reading to the unreadable case, primitives included. */
export function isUnavailable<T>(reading: Reading<T>): reading is Unavailable {
  return (
    typeof reading === 'object' &&
    reading !== null &&
    (reading as { unavailable?: unknown }).unavailable === true
  );
}

/** `GET /projects/{id}`'s billing-period compute, and the project's storage in GB. */
export interface NeonFigures {
  /** The billing period's compute, in CU-hours (Neon's `compute_time_seconds` / 3600). */
  computeCuHours: number;
  /** The project's storage, in GB (Neon Free's limit is 0.5 GB). */
  storageGb: number;
}

/** The Neon Free limits the figures are read against (architecture §9.4). */
export const NEON_COMPUTE_CU_HOURS_LIMIT = 100;
export const NEON_STORAGE_GB_LIMIT = 0.5;

/** The N1 SLO over 7 days, from `ops/metrics/n1-slo.sql`. */
export interface SloFigures {
  calls: number;
  /** Percent, 0–100; null when there were no calls. */
  successRate: number | null;
  /** Milliseconds; null when there were no calls. */
  p95Ms: number | null;
}

/** Vercel's Hobby usage, when the API reports it (it does not today: see `ops/health.md`). */
export interface VercelFigures {
  limits: { name: string; percent: number }[];
}

/** Emails Resend accepted, per UTC day, in `core` (architecture §7.10). */
export interface EmailFigures {
  today: number;
  yesterday: number;
  month: number;
}

/** The newest rate each FX source has, as `YYYY-MM-DD`; null when it has none. */
export interface FxLatest {
  ecb: string | null;
  fallback: string | null;
}

/**
 * Every trigger, in the order the response and the email list them. The `unreadable_*` ids come
 * last: a figure that cannot be read is reported alongside the triggers that could be read.
 */
export const HEALTH_TRIGGER_IDS = [
  'neon_compute',
  'neon_storage',
  'slo_latency',
  'slo_success',
  'emails_day',
  'emails_month',
  'reminder_cap',
  'security_email_unsent',
  'fx_stale',
  'vercel_limit',
  'unreadable_neon',
  'unreadable_slo',
  'unreadable_vercel',
  'unreadable_emails',
  'unreadable_reminders',
  'unreadable_security',
  'unreadable_fx',
  'unreadable_ops_email',
] as const;

export type HealthTriggerId = (typeof HEALTH_TRIGGER_IDS)[number];

/** Everything the check read, plus whether it has somewhere to send the alert. */
export interface HealthFigures {
  neon: Reading<NeonFigures>;
  slo: Reading<SloFigures>;
  /** Absent when Vercel's usage is not read at all (checked on the dashboard instead). */
  vercel?: Reading<VercelFigures>;
  emails: Reading<EmailFigures>;
  reminderCapReachedYesterday: Reading<boolean>;
  securityEmailsUnsent24h: Reading<number>;
  fxLatest: Reading<FxLatest>;
  /** `OPS_EMAIL` is set: without it the alert has nowhere to go (F25). */
  opsEmailConfigured: boolean;
}

/** What the workflow posts to `POST /api/cron/health`. */
export interface HealthReport {
  neon: Reading<NeonFigures>;
  slo: Reading<SloFigures>;
  vercel?: Reading<VercelFigures>;
  testAlert: boolean;
}

/** What the handler answers: the triggers that fired and the figures they were read from. */
export interface HealthResponse {
  triggers: HealthTriggerId[];
  figures: HealthFigures;
}

/** Each trigger's name in the email, and the action architecture §9.4 (or §10, §6.6) prescribes. */
export const HEALTH_TRIGGERS: Record<HealthTriggerId, { label: string; action: string }> = {
  neon_compute: {
    label: 'Neon compute',
    action: 'Move netnet-prod to Neon Launch (a plan change).',
  },
  neon_storage: {
    label: 'Neon storage',
    action: 'Move netnet-prod to Neon Launch.',
  },
  slo_latency: {
    label: 'Agent latency',
    action: 'Move netnet-prod to Neon Launch with scale-to-zero off.',
  },
  slo_success: {
    label: 'Agent success rate',
    action: 'Check the MCP probe and the failing tool calls (ops/probe.md).',
  },
  emails_day: {
    label: 'Emails sent yesterday',
    action: 'Move to Resend’s paid plan.',
  },
  emails_month: {
    label: 'Emails sent this month',
    action: 'Move to Resend’s paid plan.',
  },
  reminder_cap: {
    label: 'Reminder email cap',
    action: 'Move to Resend’s paid plan; reminders resume when the day turns.',
  },
  security_email_unsent: {
    label: 'Security emails unsent',
    action: 'Check Resend and the reminder runs; the security email must go out.',
  },
  fx_stale: {
    label: 'Exchange rates',
    action: 'Check the FX sources; the previous rate stays in use with its date.',
  },
  vercel_limit: {
    label: 'Vercel usage',
    action: 'Move to Vercel Pro.',
  },
  unreadable_neon: {
    label: 'Neon usage',
    action: 'Check NEON_API_KEY and the Neon API (ops/health.md).',
  },
  unreadable_slo: {
    label: 'N1 SLO',
    action: 'Check DATABASE_METRICS_URL and ops/metrics/n1-slo.sql.',
  },
  unreadable_vercel: {
    label: 'Vercel usage',
    action: 'Check the Vercel dashboard by hand (ops/health.md).',
  },
  unreadable_emails: {
    label: 'Email count',
    action: 'Check the database; the day’s email count could not be read.',
  },
  unreadable_reminders: {
    label: 'Reminder cap',
    action: 'Check the database; whether the cap was reached could not be read.',
  },
  unreadable_security: {
    label: 'Unsent security emails',
    action: 'Check the database; the unsent count could not be read.',
  },
  unreadable_fx: {
    label: 'Exchange rates',
    action: 'Check the FX rows; a source has no rate at all (ops/health.md).',
  },
  unreadable_ops_email: {
    label: 'Alert address',
    action: 'Set OPS_EMAIL in Vercel Production (F25).',
  },
};

const COUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ONE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const TWO = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * How many whole UTC days old a `YYYY-MM-DD` date is at `today`, or null when it is not a date.
 * Calendar days, not instants: the check runs at 01:00 UTC and a rate dated yesterday is one day
 * old whatever the hour.
 */
export function daysOld(date: string | null, today: Date): number | null {
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) return null;
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((day - at.getTime()) / 86_400_000);
}

/** The trigger's figure, as the email says it: a count, a size, a percentage or a rate date. */
export function healthFigure(id: HealthTriggerId, figures: HealthFigures): string {
  switch (id) {
    case 'neon_compute':
      return isUnavailable(figures.neon)
        ? 'could not be read'
        : `${ONE.format(figures.neon.computeCuHours)} of ${NEON_COMPUTE_CU_HOURS_LIMIT} CU-hours this month`;
    case 'neon_storage':
      return isUnavailable(figures.neon)
        ? 'could not be read'
        : `${TWO.format(figures.neon.storageGb)} GB of ${NEON_STORAGE_GB_LIMIT} GB`;
    case 'slo_latency':
      return isUnavailable(figures.slo) || figures.slo.p95Ms === null
        ? 'could not be read'
        : `p95 ${COUNT.format(figures.slo.p95Ms)} ms over 7 days`;
    case 'slo_success':
      return isUnavailable(figures.slo) || figures.slo.successRate === null
        ? 'could not be read'
        : `${ONE.format(figures.slo.successRate)}% of ${COUNT.format(figures.slo.calls)} calls over 7 days`;
    case 'emails_day':
      return isUnavailable(figures.emails)
        ? 'could not be read'
        : `${COUNT.format(figures.emails.yesterday)} emails yesterday`;
    case 'emails_month':
      return isUnavailable(figures.emails)
        ? 'could not be read'
        : `${COUNT.format(figures.emails.month)} emails this month`;
    case 'reminder_cap':
      return 'the 60-a-day cap was reached yesterday';
    case 'security_email_unsent':
      return isUnavailable(figures.securityEmailsUnsent24h)
        ? 'could not be read'
        : `${COUNT.format(figures.securityEmailsUnsent24h)} unsent for over 24 hours`;
    case 'fx_stale':
      return isUnavailable(figures.fxLatest) ||
        figures.fxLatest.ecb === null ||
        figures.fxLatest.fallback === null
        ? 'could not be read'
        : `latest ECB ${figures.fxLatest.ecb}, fallback ${figures.fxLatest.fallback}`;
    case 'vercel_limit': {
      if (figures.vercel === undefined || isUnavailable(figures.vercel)) {
        return 'could not be read';
      }
      return figures.vercel.limits
        .filter((limit) => limit.percent >= 70)
        .map((limit) => `${limit.name} ${Math.round(limit.percent)}%`)
        .join(', ');
    }
    case 'unreadable_neon':
    case 'unreadable_slo':
    case 'unreadable_vercel':
    case 'unreadable_emails':
    case 'unreadable_reminders':
    case 'unreadable_security':
    case 'unreadable_fx':
      return 'could not be read';
    case 'unreadable_ops_email':
      return 'OPS_EMAIL is not set';
  }
}

/** One line per trigger: its name, its figure, and the action §9.4 prescribes. */
export function healthAlertLines(
  triggers: readonly HealthTriggerId[],
  figures: HealthFigures,
): string[] {
  return triggers.map(
    (id) =>
      `${HEALTH_TRIGGERS[id].label}: ${healthFigure(id, figures)}. ${HEALTH_TRIGGERS[id].action}`,
  );
}
