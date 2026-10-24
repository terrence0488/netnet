import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GrowthChart } from './GrowthChart';

/** The visible text of some markup, its elements' words spaced apart. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('GrowthChart', () => {
  it('draws no bar for the first period, which has nothing earlier to compare with', () => {
    const html = renderToStaticMarkup(
      <GrowthChart
        values={[null, 2_000_00, -500_00, 0]}
        shorts={['Dec', 'Jan', 'Feb', 'Mar']}
        currency="SGD"
        height={180}
      />,
    );
    expect(text(html)).toBe('— +$2K −$500 — Dec Jan Feb Mar');
    const heights = [...html.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(heights).toHaveLength(4);
    // The first and the flat period are the same tick on the zero line, never a bar.
    expect(heights[0]).toBe(heights[3]);
    expect(heights[0]).toBeLessThan(1);
    expect(heights[1]).toBeGreaterThan(50);
  });
});
