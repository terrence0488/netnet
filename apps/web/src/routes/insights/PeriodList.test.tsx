import type { Period } from '@netnet/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PeriodList } from './PeriodList';

/** Fictional months, newest first: a gain, a flat month, and the first, which opened owing. */
const PERIODS: Period[] = [
  {
    start: '2026-02-01',
    end: '2026-02-28',
    endValue: -6_000_00,
    change: 2_000_00,
    changePct: 25,
    carried: false,
    drivers: [{ holdingId: 'hld_cash', name: 'Everyday savings', contribution: 2_000_00 }],
  },
  {
    start: '2026-01-01',
    end: '2026-01-31',
    endValue: -8_000_00,
    change: 0,
    changePct: 0,
    carried: true,
    drivers: [],
  },
  {
    start: '2025-12-01',
    end: '2025-12-31',
    endValue: -8_000_00,
    change: null,
    changePct: null,
    carried: false,
    drivers: [],
  },
];

/** The list's markup with the period starting `open` opened, or none. */
function render(open: string | null, periods: readonly Period[] = PERIODS): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PeriodList
        periods={periods}
        view="monthly"
        currency="SGD"
        noun="month"
        typeLabelOf={() => 'Cash & savings'}
        expanded={open}
        onToggle={() => undefined}
      />
    </MemoryRouter>,
  );
}

/** The visible text of some markup, its elements' words spaced apart. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Each row's markup, newest first. */
function rowMarkup(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => match[1] ?? '');
}

/** Each row's visible text, newest first. */
function rows(html: string): string[] {
  return rowMarkup(html).map(text);
}

describe('PeriodList', () => {
  it('gives each later row its change in money and %, and a flat one a dash', () => {
    const [february, january] = rows(render(null));
    expect(february).toBe('February 2026 so far +$2K +25%');
    expect(january).toBe('January 2026 Carried —');
  });

  it('gives the first row its end value and says it is the first, with no change', () => {
    const first = rowMarkup(render(null)).at(-1) ?? '';
    expect(text(first)).toBe('December 2025 First month −$8K');
    // Neither a gain nor a loss: no sign of one, and no gain or loss colour.
    expect(text(first)).not.toMatch(/\+|%/);
    expect(first).not.toMatch(/gain|loss/);
  });

  it('opens the first period onto its end value, with nothing earlier to compare with', () => {
    const html = render('2025-12-01');
    expect(text(html)).toContain('December 2025 −$8,000 No earlier month to compare with.');
    expect(html).toContain('No earlier month to compare with.');
    expect(html).not.toContain('What drove it');
    expect(html).not.toContain('Nothing moved in this period.');
  });

  it('opens a later period onto its change and what drove it', () => {
    const html = render('2026-02-01');
    expect(text(html)).toContain('+$2,000 · +25%');
    expect(html).toContain('What drove it');
    expect(html).toContain('Everyday savings');
    expect(html).not.toContain('to compare with');
  });

  it('names the first period by the view', () => {
    const year = renderToStaticMarkup(
      <MemoryRouter>
        <PeriodList
          periods={[{ ...PERIODS[2]!, start: '2025-01-01' }]}
          view="yearly"
          currency="SGD"
          noun="year"
          typeLabelOf={() => 'Cash & savings'}
          expanded="2025-01-01"
          onToggle={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(rows(year)[0]).toBe('2025 so far First year −$8K');
    expect(year).toContain('No earlier year to compare with.');
  });
});
