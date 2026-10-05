import { describe, expect, it } from 'vitest';
import { ageOf, formatDate, since, todayIn } from './dates';

describe('todayIn', () => {
  it('is a calendar date in the given time zone, or UTC', () => {
    expect(todayIn('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIn('Asia/Singapore')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIn(null)).toBe(todayIn('UTC'));
  });

  it('falls back to UTC for a zone it never heard of', () => {
    expect(todayIn('Mars/Olympus')).toBe(todayIn('UTC'));
  });
});

describe('formatDate', () => {
  it('names the date the reader’s way', () => {
    expect(formatDate('2026-09-12', 'en-GB')).toBe('12 Sept 2026');
    expect(formatDate('2026-09-12', 'en-SG')).toBe('12 Sept 2026');
  });
});

describe('ageOf', () => {
  const today = '2026-09-23';
  it.each([
    ['2026-09-23', 'today'],
    ['2026-09-22', 'yesterday'],
    ['2026-09-20', '3 days ago'],
    ['2026-09-15', 'a week ago'],
    ['2026-08-30', '3 weeks ago'],
    ['2026-08-01', '2 months ago'],
    ['2025-06-01', 'a year ago'],
    ['2026-09-24', 'today'],
  ])('%s beside %s is %s', (date, expected) => {
    expect(ageOf(date, today)).toBe(expected);
  });
});

describe('since', () => {
  const now = new Date('2026-09-23T12:00:00Z').getTime();
  it.each([
    ['2026-09-23T11:59:40Z', 'just now'],
    ['2026-09-23T11:58:00Z', '2 minutes ago'],
    ['2026-09-23T11:00:00Z', 'an hour ago'],
    ['2026-09-23T09:00:00Z', '3 hours ago'],
    ['2026-09-20T12:00:00Z', '3 days ago'],
    ['2026-09-23T12:00:00Z', 'just now'],
  ])('%s is %s', (enteredAt, expected) => {
    expect(since(enteredAt, now)).toBe(expected);
  });
});
