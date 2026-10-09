import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  bucketEnd,
  bucketStart,
  daysBetween,
  isCalendarDate,
  trendRangeStart,
} from './dates';

const DAY_MS = 86_400_000;

/** The reference: what the platform's own calendar says (tests may use Date; core may not). */
const isoDay = (days: number) => new Date(days * DAY_MS).toISOString().slice(0, 10);

describe('calendar dates', () => {
  it.each(['2026-09-27', '2024-02-29', '2000-02-29', '1999-12-31', '0001-01-01'])(
    'accepts %s',
    (date) => {
      expect(isCalendarDate(date)).toBe(true);
    },
  );

  it.each(['2023-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-9-27', ''])(
    'rejects %j',
    (date) => {
      expect(isCalendarDate(date)).toBe(false);
      expect(() => addDays(date, 1)).toThrow(RangeError);
    },
  );

  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-09-27', 4)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2023-03-01', -1)).toBe('2023-02-28');
  });

  it('adds months, keeping the day where the month has it', () => {
    expect(addMonths('2026-09-27', -1)).toBe('2026-08-27');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -3)).toBe('2025-10-15');
    expect(addMonths('2024-02-29', -12)).toBe('2023-02-28');
    expect(addMonths('2026-11-30', 14)).toBe('2028-01-30');
  });

  it('counts the days between two dates', () => {
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
    expect(daysBetween('2026-09-27', '2026-09-20')).toBe(-7);
  });

  it.each([
    ['day', '2026-08-14', '2026-08-14', '2026-08-14'],
    ['month', '2026-02-14', '2026-02-01', '2026-02-28'],
    ['month', '2024-02-14', '2024-02-01', '2024-02-29'],
    ['quarter', '2026-01-01', '2026-01-01', '2026-03-31'],
    ['quarter', '2026-05-20', '2026-04-01', '2026-06-30'],
    ['quarter', '2026-09-30', '2026-07-01', '2026-09-30'],
    ['quarter', '2026-11-02', '2026-10-01', '2026-12-31'],
    ['year', '2026-08-14', '2026-01-01', '2026-12-31'],
  ] as const)('puts %s bucket of %s from %s to %s', (interval, date, start, end) => {
    expect(bucketStart(date, interval)).toBe(start);
    expect(bucketEnd(date, interval)).toBe(end);
  });

  it('starts a trend range at All, YTD, or that many months back', () => {
    expect(trendRangeStart(0, '2026-10-09')).toBeUndefined();
    expect(trendRangeStart(-1, '2026-10-09')).toBe('2026-01-01');
    expect(trendRangeStart(6, '2026-10-09')).toBe('2026-04-09');
    expect(trendRangeStart(12, '2026-10-09')).toBe('2025-10-09');
    expect(trendRangeStart(96, '2026-10-09')).toBe('2018-10-09');
    expect(trendRangeStart(1, '2026-03-31')).toBe('2026-02-28');
    expect(() => trendRangeStart(6, 'not-a-date')).toThrow(RangeError);
  });

  it('agrees with the platform calendar on any day from 1900 to 2200', () => {
    const from = Date.UTC(1900, 0, 1) / DAY_MS;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 109_572 }),
        fc.integer({ min: -400, max: 400 }),
        (n, k) => {
          const date = isoDay(from + n);
          expect(isCalendarDate(date)).toBe(true);
          expect(addDays(date, k)).toBe(isoDay(from + n + k));
          expect(daysBetween(date, addDays(date, k))).toBe(k);
        },
      ),
    );
  });
});
