import type { Holding, Snapshot, ValueTuple } from '@netnet/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PeriodCard } from './PeriodCard';

const HOLDING: Holding = {
  id: 'hld_1',
  name: 'Everyday savings',
  kind: 'asset',
  typeId: 'typ_cash',
  currency: 'SGD',
  cadenceDays: null,
  archived: false,
  archivedAt: null,
  createdAt: '2026-06-01T00:00:00Z',
  rowVersion: 1,
  access: 'accessible',
  accessReason: null,
  accessUntil: null,
  accessBasis: null,
  tagIds: [],
};

const value = (date: string, minor: number): ValueTuple => [
  date,
  minor,
  'SGD',
  minor,
  'web',
  null,
  `val_${date}`,
];

/** The card over fictional values for one holding, read on 20 August 2026. */
function render(values: ValueTuple[]): string {
  const snapshot: Snapshot = {
    dataVersion: 2,
    baseCurrency: 'SGD',
    packRef: [{ key: 'generic', version: 1 }],
    prefs: {},
    types: [
      {
        id: 'typ_cash',
        universal: 'cash',
        packTypeKey: null,
        customName: null,
        sort: 0,
        archived: false,
      },
    ],
    tags: [],
    holdings: [HOLDING],
    values: { hld_1: values },
  };
  return renderToStaticMarkup(
    <PeriodCard snapshot={snapshot} holding={HOLDING} universal="cash" today="2026-08-20" />,
  );
}

/** The figures carried above the bars, oldest first. */
function barValues(html: string): string[] {
  const row = /<div class="[^"]*values[^"]*"[^>]*>(.*?)<\/div><div[^>]*data-testid/.exec(html);
  return [...(row?.[1] ?? '').matchAll(/<div[^>]*>([^<]*)<\/div>/g)].map((m) => m[1] ?? '');
}

describe('PeriodCard', () => {
  it('draws no bar for the first period, only the later changes', () => {
    const html = render([
      value('2026-06-15', 100_000),
      value('2026-07-15', 105_000),
      value('2026-08-15', 103_000),
    ]);
    expect(html).toContain('data-testid="period-chart"');
    expect(barValues(html)).toStrictEqual(['—', '+$50', '−$20']);
    expect(html.match(/fill="var\(--rule-strong\)"/g)).toHaveLength(1);
  });

  it('keeps the shared placeholder with one period only', () => {
    const html = render([value('2026-08-15', 103_000)]);
    expect(html).toContain('data-testid="period-chart-placeholder"');
    expect(html).toContain('Need more data');
    expect(html).not.toContain('data-testid="period-chart"');
  });
});
