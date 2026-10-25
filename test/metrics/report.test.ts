import { describe, expect, it } from 'vitest';
import {
  METRIC_SPECS,
  bindMetricSql,
  parseExcludeUsers,
  parseWindow,
  renderReport,
  type MetricResult,
  type MetricRow,
} from '../../scripts/metrics';

/** The report is pure: the tables, targets, kill flags and the reading notes, with no database. */

const HEADER = {
  env: 'production',
  firstDay: '2026-01-01',
  lastDay: '2026-02-28',
  excluded: 1,
} as const;

function row(
  metric: string,
  segment: string,
  value: number | null,
  denominator: number | null = 100,
): MetricRow {
  return { metric, segment, numerator: value, denominator, value };
}

const SEGMENTS = ['starting_out', 'accumulating', 'established', 'unknown', 'blended'];

function ratio(metric: string, values: readonly (number | null)[]): MetricRow[] {
  return SEGMENTS.map((segment, index) => row(metric, segment, values[index] ?? null));
}

function channelRows(
  metric: string,
  channel: 'email' | 'push',
  values: readonly (number | null)[],
): MetricRow[] {
  return SEGMENTS.map((segment, index) => ({
    metric,
    segment,
    channel,
    numerator: values[index] ?? null,
    denominator: 100,
    value: values[index] ?? null,
  }));
}

function reportOf(...metrics: readonly MetricRow[][]): string {
  const results: MetricResult[] = metrics.map((rows, index) => ({
    file: `file-${index}.sql`,
    rows,
  }));
  return renderReport(results, HEADER);
}

describe('renderReport()', () => {
  it('prints the five segment columns, the target and the P-B/P-C kill reading', () => {
    const report = reportOf(
      ratio('M1', [5, 20, 30, 0, 55]),
      ratio('M3', [20, 10, 20, 0, 15]),
      ratio('M6', [20, 5, 10, 0, 15]),
      ratio('M7', [30, 19, 20, 0, 22]),
    );
    for (const title of [
      'M1 Signups',
      'M3 Agent connection rate',
      'M6 Return rate',
      'M7 Advice pull',
    ]) {
      expect(report).toContain(`### ${title}`);
    }
    expect(report).toContain('Target: 100 verified accounts in the window.');
    expect(report).toContain('Kill threshold: < 25 signups — read on P-B and P-C only (PRD §3.3).');
    // P-B below its threshold is a kill; P-C at or above is not; the blend is never read.
    expect(report).toContain('| kill | — | KILL | ok | — | never read |');
    expect(report.match(/\| kill \|/g)).toHaveLength(4);
    expect(report).toContain(
      '| Reading | P-A | P-B | P-C | Unknown | Blended |\n| --- | --- | --- | --- | --- | --- |',
    );
    expect(report).toContain('Environment: production · window 2026-01-01 → 2026-02-28');
    expect(report).toContain('excluded accounts: 1');
  });

  it('gives M13 one table per channel, and M10 the blended-only and daily-unique notes', () => {
    const report = reportOf(
      channelRows('M13 comeback', 'email', [80, 60, 50, 0, 70]),
      channelRows('M13 comeback', 'push', [50, 40, 30, 0, 45]),
      ratio('M13 push', [50, 40, 30, 0, 45]),
      [
        ...SEGMENTS.map((segment) =>
          row(
            'M10 visitors',
            segment,
            segment === 'unknown' || segment === 'blended' ? 4 : null,
            null,
          ),
        ),
      ],
      [...SEGMENTS.map((segment) => row('M10 account created', segment, 1, 1))],
      [row('M10 conversion', 'blended', 75)],
    );
    expect(report).toContain('### M13 Comeback rate (email)');
    expect(report).toContain('### M13 Comeback rate (push)');
    expect(report).toContain('### M13 Push on for ≥1 device (week-4 active)');
    expect(report).toContain(
      'Blended only: landing visitors are anonymous, so they cannot be split by segment.',
    );
    expect(report).toContain('a repeat visitor on another day counts again');
    expect(report).toContain('### M10 Funnel conversion');
    expect(report).toContain('Target: ≥ 8% on ≥ 1,200 visits.');
  });

  it('formats counts, percentages, days, minutes and milliseconds as their units', () => {
    const report = reportOf(
      ratio('M1', [1200, null, 0, null, 1200]),
      ratio('M8', [45.5, null, null, null, 45.5]),
      ratio('M9', [15, null, null, null, 15]),
      ratio('n1 p95', [1800, null, null, null, 1800]),
    );
    expect(report).toContain('| value | 1,200 | — | 0 | — | 1,200 |');
    expect(report).toContain('45.5 d');
    expect(report).toContain('15.0 min');
    expect(report).toContain('1,800 ms');
  });

  it('fails rather than printing a metric with no target', () => {
    expect(() => reportOf([row('M99', 'blended', 1)])).toThrow(/No target for metric "M99"/);
  });

  it('has a target and a reading for every metric a file may return', () => {
    for (const spec of Object.values(METRIC_SPECS)) {
      expect(spec.title).not.toBe('');
      expect(spec.target).not.toBe('');
    }
  });
});

describe('parseWindow()', () => {
  it('makes an inclusive --to into a half-open UTC window', () => {
    const window = parseWindow('2026-01-01', '2026-01-31', new Date('2026-06-01T10:00:00Z'));
    expect(window.lastDay).toBe('2026-01-31');
    expect(window.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('defaults --to to today in UTC', () => {
    const window = parseWindow('2026-01-01', undefined, new Date('2026-01-15T23:30:00Z'));
    expect(window.lastDay).toBe('2026-01-15');
    expect(window.to.toISOString()).toBe('2026-01-16T00:00:00.000Z');
  });

  it('refuses a date that is not a calendar day, and a to before the from', () => {
    expect(() => parseWindow('2026-02-30', undefined, new Date())).toThrow(/not a real/);
    expect(() => parseWindow('2026/01/01', undefined, new Date())).toThrow(/YYYY-MM-DD/);
    expect(() => parseWindow('2026-02-02', '2026-02-01', new Date())).toThrow(/on or after/);
  });
});

describe('parseExcludeUsers()', () => {
  const one = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
  const two = 'usr_01K1G4KX00BBBBBBBBBBBBBBBB';

  it('reads, trims, deduplicates and sorts the ids', () => {
    expect(parseExcludeUsers(undefined)).toStrictEqual([]);
    expect(parseExcludeUsers('')).toStrictEqual([]);
    expect(parseExcludeUsers(` ${two} , ${one},${two} `)).toStrictEqual([one, two]);
  });

  it('refuses anything that is not a usr_ id', () => {
    expect(() => parseExcludeUsers('kestrel@example.com')).toThrow(/METRICS_EXCLUDE_USERS/);
    expect(() => parseExcludeUsers('usr_short')).toThrow(/METRICS_EXCLUDE_USERS/);
  });
});

describe('bindMetricSql()', () => {
  it('binds the three parameters and leaves casts alone', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-02-01T00:00:00Z');
    const bound = bindMetricSql('select :from::text, :to, :exclude_users, e.at >= :from', {
      from,
      to,
      excludeUsers: ['usr_01K1G4KX00AAAAAAAAAAAAAAAA'],
    });
    expect(bound.text).toBe(
      'select $1::timestamptz::text, $2::timestamptz, $3::text[], e.at >= $1::timestamptz',
    );
    expect(bound.values).toStrictEqual([
      from.toISOString(),
      to.toISOString(),
      ['usr_01K1G4KX00AAAAAAAAAAAAAAAA'],
    ]);
  });
});
