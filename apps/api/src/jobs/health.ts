import type { Handler } from 'hono';
import { countUnsentSecurityEmails } from '../db/agent-connections';
import { database, type Executor } from '../db/client';
import { emailCounts } from '../db/emails';
import { latestRateDate } from '../db/fx-rates';
import { countReminderEmailsToday } from '../db/reminders';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import {
  HEALTH_TRIGGER_IDS,
  daysOld,
  isUnavailable,
  type EmailFigures,
  type FxLatest,
  type HealthFigures,
  type HealthReport,
  type HealthResponse,
  type HealthTriggerId,
  type NeonFigures,
  type Reading,
  type SloFigures,
  type VercelFigures,
} from '../notify/health-alert';
import type { NotifyOperator } from '../notify/message';
import { REMINDER_EMAILS_PER_DAY, notifyOperator } from '../notify/notify';

/**
 * The daily health check (architecture §9.3, §9.4, §10; P4-T4). The workflow gathers the two
 * figures only it can read — Neon's consumption with `NEON_API_KEY`, the N1 SLO as `netnet_metrics`
 * — and posts them to `POST /api/cron/health`. This handler adds the figures only the function can
 * read from `core` (the day's email count, the reminder cap, unsent security emails and the FX
 * dates), evaluates every trigger with the pure `evaluateHealth`, and sends one `ops.health_alert`
 * when any fired, or when the run is a dispatched test. It answers counts, sizes, percentages and
 * dates only.
 */

/** The free-tier and SLO thresholds, from architecture §9.4 and §10. */
export const NEON_COMPUTE_CU_HOURS_TRIGGER = 60;
export const NEON_STORAGE_GB_TRIGGER = 0.35;
export const SLO_P95_MS_TRIGGER = 1_500;
export const SLO_SUCCESS_TRIGGER = 99.5;
export const SLO_MIN_CALLS = 50;
export const EMAILS_DAY_TRIGGER = 70;
export const EMAILS_MONTH_TRIGGER = 2_100;
export const REMINDER_CAP_TRIGGER = REMINDER_EMAILS_PER_DAY;
export const SECURITY_EMAIL_UNSENT_AFTER_MS = 24 * 60 * 60_000;
export const SECURITY_EMAIL_UNSENT_FOR_MS = 7 * 24 * 60 * 60_000;
export const FX_ECB_MAX_AGE_DAYS = 4;
export const FX_FALLBACK_MAX_AGE_DAYS = 2;
export const VERCEL_PERCENT_TRIGGER = 70;

/** The figures the function reads from `core`; each may be unreadable on its own. */
export interface LocalFigures {
  emails: Reading<EmailFigures>;
  reminderCapReachedYesterday: Reading<boolean>;
  securityEmailsUnsent24h: Reading<number>;
  fxLatest: Reading<FxLatest>;
}

/** The empty reading: the database could not be reached at all. */
function allUnavailable(): LocalFigures {
  const unavailable = { unavailable: true } as const;
  return {
    emails: unavailable,
    reminderCapReachedYesterday: unavailable,
    securityEmailsUnsent24h: unavailable,
    fxLatest: unavailable,
  };
}

async function settled<T>(read: () => Promise<T>): Promise<Reading<T>> {
  try {
    return await read();
  } catch {
    return { unavailable: true };
  }
}

/**
 * The four figures from `core` (CONVENTIONS §3: only `db/**` touches those tables). Each read
 * stands alone: one failing query reports its own `unreadable_*` trigger, and the alert still goes.
 */
export async function readLocalFigures(db: Executor, today: Date): Promise<LocalFigures> {
  const day = 24 * 60 * 60_000;
  const [emails, reminders, security, fx] = await Promise.all([
    settled(() => emailCounts(db, today)),
    settled(() => countReminderEmailsToday(db, new Date(today.getTime() - day))),
    settled(() =>
      countUnsentSecurityEmails(
        db,
        new Date(today.getTime() - SECURITY_EMAIL_UNSENT_FOR_MS),
        new Date(today.getTime() - SECURITY_EMAIL_UNSENT_AFTER_MS),
      ),
    ),
    settled(async () => ({
      ecb: await latestRateDate(db, 'ecb'),
      fallback: await latestRateDate(db, 'fallback'),
    })),
  ]);
  return {
    emails,
    reminderCapReachedYesterday:
      typeof reminders === 'number' ? reminders >= REMINDER_CAP_TRIGGER : reminders,
    securityEmailsUnsent24h: security,
    fxLatest: fx,
  };
}

/**
 * Every trigger that fired, in `HEALTH_TRIGGER_IDS` order (architecture §9.4, §10, §6.6). Pure:
 * the clock is `today`, and every reading is fixed input. A source that could not be read fires
 * its own `unreadable_<source>` and none of its thresholds, so silence still means every limit is
 * fine. The thresholds are «at or above» for the free-tier figures and «within» for the SLO and
 * FX ages.
 */
export function evaluateHealth(figures: HealthFigures, today: Date): HealthTriggerId[] {
  const found = new Set<HealthTriggerId>();

  if (isUnavailable(figures.neon)) found.add('unreadable_neon');
  else {
    if (figures.neon.computeCuHours >= NEON_COMPUTE_CU_HOURS_TRIGGER) found.add('neon_compute');
    if (figures.neon.storageGb >= NEON_STORAGE_GB_TRIGGER) found.add('neon_storage');
  }

  if (isUnavailable(figures.slo)) found.add('unreadable_slo');
  else {
    const { calls, successRate, p95Ms } = figures.slo;
    // A p95 is a reading even on a quiet week: the §9.4 action is about cold starts.
    if (p95Ms !== null && p95Ms > SLO_P95_MS_TRIGGER) found.add('slo_latency');
    // The success rate is a reading only over enough calls (§10: 50 calls for a reading).
    if (calls >= SLO_MIN_CALLS && successRate !== null && successRate < SLO_SUCCESS_TRIGGER) {
      found.add('slo_success');
    }
    if (calls >= SLO_MIN_CALLS && (successRate === null || p95Ms === null)) {
      found.add('unreadable_slo');
    }
  }

  if (figures.vercel !== undefined) {
    if (isUnavailable(figures.vercel)) found.add('unreadable_vercel');
    else if (figures.vercel.limits.some((limit) => limit.percent >= VERCEL_PERCENT_TRIGGER)) {
      found.add('vercel_limit');
    }
  }

  if (isUnavailable(figures.emails)) found.add('unreadable_emails');
  else {
    if (figures.emails.yesterday >= EMAILS_DAY_TRIGGER) found.add('emails_day');
    if (figures.emails.month >= EMAILS_MONTH_TRIGGER) found.add('emails_month');
  }

  if (isUnavailable(figures.reminderCapReachedYesterday)) found.add('unreadable_reminders');
  else if (figures.reminderCapReachedYesterday) found.add('reminder_cap');

  if (isUnavailable(figures.securityEmailsUnsent24h)) found.add('unreadable_security');
  else if (figures.securityEmailsUnsent24h > 0) found.add('security_email_unsent');

  if (isUnavailable(figures.fxLatest)) found.add('unreadable_fx');
  else {
    const ecb = daysOld(figures.fxLatest.ecb, today);
    const fallback = daysOld(figures.fxLatest.fallback, today);
    if (ecb === null || fallback === null) found.add('unreadable_fx');
    else if (ecb > FX_ECB_MAX_AGE_DAYS || fallback > FX_FALLBACK_MAX_AGE_DAYS) {
      found.add('fx_stale');
    }
  }

  // Without OPS_EMAIL there is nowhere to send the alert (F25): the gap is itself a trigger.
  if (!figures.opsEmailConfigured) found.add('unreadable_ops_email');

  return HEALTH_TRIGGER_IDS.filter((id) => found.has(id));
}

/* ------------------------------------------------------------- the request */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, minimum = 0): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : null;
}

function parseReading<T>(
  value: unknown,
  parse: (object: Record<string, unknown>) => T | null,
): Reading<T> | null {
  if (!isObject(value)) return null;
  if (value.unavailable === true) return { unavailable: true };
  return parse(value);
}

function parseNeon(value: Record<string, unknown>): NeonFigures | null {
  const computeCuHours = finiteNumber(value.computeCuHours);
  const storageGb = finiteNumber(value.storageGb);
  if (computeCuHours === null || storageGb === null) return null;
  return { computeCuHours, storageGb };
}

function parseSlo(value: Record<string, unknown>): SloFigures | null {
  const calls = finiteNumber(value.calls);
  if (calls === null || !Number.isInteger(calls)) return null;
  const successRate = value.successRate === null ? null : finiteNumber(value.successRate);
  const p95Ms = value.p95Ms === null ? null : finiteNumber(value.p95Ms);
  if (value.successRate !== null && (successRate === null || successRate > 100)) return null;
  if (value.p95Ms !== null && p95Ms === null) return null;
  return { calls, successRate, p95Ms };
}

function parseVercel(value: Record<string, unknown>): VercelFigures | null {
  if (!Array.isArray(value.limits)) return null;
  const limits: VercelFigures['limits'] = [];
  for (const limit of value.limits) {
    if (!isObject(limit) || typeof limit.name !== 'string') return null;
    const percent = finiteNumber(limit.percent);
    if (percent === null) return null;
    limits.push({ name: limit.name, percent });
  }
  return { limits };
}

/**
 * Validates the workflow's body at the boundary (CONVENTIONS §11). A source may be
 * `{unavailable: true}`; anything else malformed is a `VALIDATION_FAILED`, never a half report.
 */
export function parseHealthReport(value: unknown): HealthReport | null {
  if (!isObject(value)) return null;
  const neon = parseReading(value.neon, parseNeon);
  const slo = parseReading(value.slo, parseSlo);
  if (neon === null || slo === null) return null;
  let vercel: Reading<VercelFigures> | undefined;
  if (value.vercel !== undefined) {
    const parsed = parseReading(value.vercel, parseVercel);
    if (parsed === null) return null;
    vercel = parsed;
  }
  if (typeof value.testAlert !== 'boolean') return null;
  return {
    neon,
    slo,
    ...(vercel === undefined ? {} : { vercel }),
    testAlert: value.testAlert,
  };
}

/* ---------------------------------------------------------------- the job */

export interface HealthJobDeps {
  clock: () => Date;
  /** The `core` figures, or `unavailable` for each one that could not be read. */
  readFigures: (today: Date) => Promise<LocalFigures>;
  /** Whether `OPS_EMAIL` is set (F25). */
  opsEmailConfigured: () => boolean;
  notifyOperator: NotifyOperator;
}

function liveReadFigures(today: Date): Promise<LocalFigures> {
  try {
    return readLocalFigures(database(), today);
  } catch {
    return Promise.resolve(allUnavailable());
  }
}

function liveHealthDeps(): HealthJobDeps {
  return {
    clock: () => new Date(),
    readFigures: liveReadFigures,
    opsEmailConfigured: () => (process.env.OPS_EMAIL ?? '').trim() !== '',
    notifyOperator,
  };
}

/** `POST /api/cron/health` (architecture §9.3), called by `.github/workflows/cron-health.yml`. */
export function healthJob(deps: () => HealthJobDeps = liveHealthDeps): Handler<AppEnv> {
  return async (c) => {
    let body: unknown;
    try {
      body = await c.req.json<unknown>();
    } catch {
      body = undefined;
    }
    const report = parseHealthReport(body);
    if (report === null) {
      throw new AppError('VALIDATION_FAILED', 'The health report is not the expected JSON.', {
        fields: { body: 'Send {neon, slo, vercel?, testAlert} from `pnpm health`.' },
      });
    }

    const service = deps();
    const today = service.clock();
    const local = await service.readFigures(today);
    const figures: HealthFigures = {
      neon: report.neon,
      slo: report.slo,
      ...(report.vercel === undefined ? {} : { vercel: report.vercel }),
      emails: local.emails,
      reminderCapReachedYesterday: local.reminderCapReachedYesterday,
      securityEmailsUnsent24h: local.securityEmailsUnsent24h,
      fxLatest: local.fxLatest,
      opsEmailConfigured: service.opsEmailConfigured(),
    };
    const triggers = evaluateHealth(figures, today);
    // One email per run at most, and none when nothing fired unless this is a dispatched test.
    if (triggers.length > 0 || report.testAlert) {
      await service.notifyOperator({
        kind: 'ops.health_alert',
        triggers,
        figures,
        test: report.testAlert,
      });
    }
    const response: HealthResponse = { triggers, figures };
    return c.json(response);
  };
}
