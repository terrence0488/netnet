import { canonicalTimeZone } from '@netnet/contracts';
import { daysBetween } from '@netnet/core';

/**
 * Dates at the edge (CONVENTIONS §5): "today" is computed in the person's time zone and passed
 * into core. Relative time answers "how recent?", absolute time "exactly when?" (§2.1 rules 5–6).
 */

/** Today's date, `YYYY-MM-DD`, where the person is (the profile's time zone, else UTC). */
export function todayIn(timeZone: string | null | undefined): string {
  const zone = timeZone ? canonicalTimeZone(timeZone) : null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
}

/** `12 Sep 2026`: a value's date, in the reader's own conventions. */
export function formatDate(date: string, locale?: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "today", "yesterday", "3 weeks ago": how old a value's date is, beside `today`. */
export function ageOf(date: string, today: string): string {
  const n = Math.max(0, daysBetween(date, today));
  if (n < 1) return 'today';
  if (n < 2) return 'yesterday';
  if (n < 7) return `${n} days ago`;
  if (n < 45) {
    const weeks = Math.round(n / 7);
    return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
  }
  if (n < 400) {
    const months = Math.round(n / 30);
    return months === 1 ? 'a month ago' : `${months} months ago`;
  }
  const years = n / 365;
  return `${years < 1.5 ? 'a year' : `${Math.round(years)} years`} ago`;
}

/** "just now", "3 days ago": when something was entered, from its instant. */
export function since(enteredAt: string, now: number = Date.now()): string {
  const minutes = Math.max(0, (now - new Date(enteredAt).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) {
    const n = Math.round(minutes);
    return n === 1 ? 'a minute ago' : `${n} minutes ago`;
  }
  if (minutes < 1440) {
    const n = Math.round(minutes / 60);
    return n === 1 ? 'an hour ago' : `${n} hours ago`;
  }
  const days = Math.floor(minutes / 1440);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 45) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
  }
  if (days < 400) {
    const months = Math.round(days / 30);
    return months === 1 ? 'a month ago' : `${months} months ago`;
  }
  const years = days / 365;
  return `${years < 1.5 ? 'a year' : `${Math.round(years)} years`} ago`;
}
