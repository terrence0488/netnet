import type { Interval } from '@netnet/contracts';

/**
 * Calendar dates as `YYYY-MM-DD` strings, with integer arithmetic only: no `Date`, so no clock
 * and no time zone can leak in. Such strings sort in date order, so they compare as strings.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Ymd {
  y: number;
  /** 1 to 12 */
  m: number;
  d: number;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function parse(date: string): Ymd | undefined {
  const match = DATE.exec(date);
  if (!match) return undefined;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? { y, m, d } : undefined;
}

function ymd(date: string): Ymd {
  const parsed = parse(date);
  if (!parsed) throw new RangeError(`"${date}" is not a calendar date in the form YYYY-MM-DD.`);
  return parsed;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');
const format = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;

/** Days since 1970-01-01 (H. Hinnant's days_from_civil). */
function toDays({ y, m, d }: Ymd): number {
  const year = m <= 2 ? y - 1 : y;
  const era = Math.floor(year / 400);
  const yoe = year - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse of `toDays` (civil_from_days). */
function fromDays(days: number): Ymd {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** True for a real calendar date in the form `YYYY-MM-DD`. */
export function isCalendarDate(date: string): boolean {
  return parse(date) !== undefined;
}

export function addDays(date: string, days: number): string {
  return format(fromDays(toDays(ymd(date)) + days));
}

/** Moves by whole months, keeping the day where the month has it, else its last day. */
export function addMonths(date: string, months: number): string {
  const { y, m, d } = ymd(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return format({ y: year, m: month, d: Math.min(d, daysInMonth(year, month)) });
}

/** Whole days from `from` to `to`: negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return toDays(ymd(to)) - toDays(ymd(from));
}

/** The first day of the calendar bucket that holds `date`. */
export function bucketStart(date: string, interval: Interval): string {
  const { y, m, d } = ymd(date);
  switch (interval) {
    case 'day':
      return format({ y, m, d });
    case 'month':
      return format({ y, m, d: 1 });
    case 'quarter':
      return format({ y, m: Math.floor((m - 1) / 3) * 3 + 1, d: 1 });
    case 'year':
      return format({ y, m: 1, d: 1 });
  }
}

/** The last day of the calendar bucket that holds `date`. */
export function bucketEnd(date: string, interval: Interval): string {
  const { y, m, d } = ymd(date);
  switch (interval) {
    case 'day':
      return format({ y, m, d });
    case 'month':
      return format({ y, m, d: daysInMonth(y, m) });
    case 'quarter': {
      const last = Math.ceil(m / 3) * 3;
      return format({ y, m: last, d: daysInMonth(y, last) });
    }
    case 'year':
      return format({ y, m: 12, d: 31 });
  }
}
