import { describe, expect, it } from 'vitest';
import { renderCss } from './css';
import { chart, color, hit, scale, tokens, type ColorName, type Theme } from './index';

const THEMES: Theme[] = ['light', 'dark'];

/** WCAG 2 relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('tokens', () => {
  it('tokens.css is generated from tokens.ts', async () => {
    await expect(renderCss(tokens)).toMatchFileSnapshot('./tokens.css');
  });

  it('authors both themes in full, with no colour shared by accident across the grounds', () => {
    expect(Object.keys(color.dark)).toStrictEqual(Object.keys(color.light));
    for (const name of ['paper', 'card', 'ink', 'edge', 'brand'] as const) {
      expect(color.dark[name]).not.toBe(color.light[name]);
    }
  });

  it('ports the prototype values, not re-derived ones', () => {
    expect(color.light.paper).toBe('#F2EADB');
    expect(color.dark.paper).toBe('#1B1712');
    expect(color.light['brand-on']).toBe(color.dark['brand-on']);
    expect(hit).toStrictEqual({ touch: 44, fine: 36 });
    expect(scale).toStrictEqual({ phone: 1.15, phoneFloor: 11 });
  });

  it('keeps the chart palette in its fixed order, eight slots per theme (design-system §5)', () => {
    expect(chart.light).toHaveLength(8);
    expect(chart.dark).toHaveLength(8);
    expect([chart.light[0], chart.light[7]]).toStrictEqual(['#2A78D6', '#E34948']);
    expect([chart.dark[0], chart.dark[7]]).toStrictEqual(['#3987E5', '#E66767']);
    const ui = new Set(Object.values(color.light).concat(Object.values(color.dark)));
    expect([...chart.light, ...chart.dark].filter((hue) => ui.has(hue))).toStrictEqual([]);
  });

  describe.each(THEMES)('%s theme: text meets WCAG AA (4.5:1)', (theme) => {
    const c = color[theme];
    const text: ColorName[] = [
      'ink',
      'ink-2',
      'ink-3',
      'brand-text',
      'agent-text',
      'gain',
      'loss',
      'attention',
    ];
    it.each(text)('%s on card and on paper', (name) => {
      expect(contrast(c[name], c.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c[name], c.paper)).toBeGreaterThanOrEqual(4.5);
    });

    it('ink on tomato, attention on its note, ink on mustard', () => {
      expect(contrast(c['brand-on'], c.brand)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.attention, c['warn-bg'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c['sun-on'], c.sun)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('scales every text size for a phone and floors it, so nothing reads below 11px', () => {
    const sizes = renderCss(tokens).match(/--size-[a-z-]+: [^;]+/g) ?? [];
    expect(sizes.length).toBe(Object.keys(tokens.type).length);
    for (const size of sizes.filter((s) => !s.startsWith('--size-display:'))) {
      expect(size).toMatch(/: max\(var\(--fs-min\), calc\([\d.]+px \* var\(--fs\)\)\)$/);
    }
    expect(scale.phoneFloor).toBe(11);
  });

  it('keeps form fields at 16px or more, or iOS zooms into them (design-system §6.1)', () => {
    expect(tokens.type.field.size).toBeGreaterThanOrEqual(16);
  });
});
