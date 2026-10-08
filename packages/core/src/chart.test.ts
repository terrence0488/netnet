import { describe, expect, it } from 'vitest';
import { allocation, bars, chart, linePath, nearestPoint, scales, stacked, ticks } from './chart';

describe('scales', () => {
  it('spreads point indices across the plot and values bottom-up', () => {
    const s = scales([0, 100], 5);
    expect(s.count).toBe(5);
    expect(s.x(0)).toBe(0);
    expect(s.x(4)).toBe(100);
    expect(s.x(2)).toBe(50);
    expect(s.y(0)).toBe(100);
    expect(s.y(100)).toBe(0);
  });

  it('nices the domain outward and ticks it with round ascending values inside', () => {
    const s = scales([12, 87], 4);
    expect(s.min).toBeLessThanOrEqual(12);
    expect(s.max).toBeGreaterThanOrEqual(87);
    expect(s.yTicks.length).toBeGreaterThanOrEqual(2);
    const sorted = [...s.yTicks].sort((a, b) => a - b);
    expect([...s.yTicks]).toStrictEqual(sorted);
    for (const t of s.yTicks) {
      expect(t).toBeGreaterThanOrEqual(s.min);
      expect(t).toBeLessThanOrEqual(s.max);
    }
  });

  it('covers every series when values are flattened across them', () => {
    const s = scales([10, 20, 5, 90], 2);
    expect(s.min).toBeLessThanOrEqual(5);
    expect(s.max).toBeGreaterThanOrEqual(90);
  });

  it('stretches to zero when asked, from either side', () => {
    expect(scales([10, 20], 2, { includeZero: true }).min).toBe(0);
    expect(scales([-20, -10], 2, { includeZero: true }).max).toBe(0);
    expect(scales([-10, 20], 2).min).toBeLessThan(0);
  });

  it('pads a flat series so its line draws mid-plot', () => {
    const s = scales([50, 50, 50], 3);
    expect(s.min).toBeLessThan(50);
    expect(s.max).toBeGreaterThan(50);
    expect(s.y(50)).toBeCloseTo(50, 5);
  });

  it('pads an all-zero series to a unit domain', () => {
    const s = scales([0, 0], 2);
    expect(s.min).toBeLessThan(0);
    expect(s.max).toBeGreaterThan(0);
  });

  it('centres x with under two points, and defaults an empty domain to unit', () => {
    expect(scales([7], 1).x(0)).toBe(50);
    const empty = scales([], 0);
    expect(empty.x(3)).toBe(50);
    expect(empty.min).toBe(0);
    expect(empty.max).toBe(1);
    expect(empty.yTicks.length).toBeGreaterThan(0);
  });

  it('rejects non-finite values', () => {
    expect(() => scales([1, Number.NaN], 2)).toThrow(RangeError);
    expect(() => scales([Number.POSITIVE_INFINITY], 1)).toThrow(RangeError);
  });
});

describe('linePath', () => {
  it('draws the line through the points and closes the wash along the foot', () => {
    const s = scales([0, 100], 2);
    expect(linePath([0, 100], s)).toStrictEqual({
      line: 'M0,100L100,0',
      area: 'M0,100L100,0L100,100L0,100Z',
    });
  });

  it('rounds to two decimals and centres a single point', () => {
    const s = scales([0, 30], 3);
    const paths = linePath([0, 15, 30], s);
    expect(paths.line).toBe('M0,100L50,50L100,0');
    const one = scales([5], 1);
    expect(linePath([5], one).line).toMatch(/^M50,/);
  });

  it('draws nothing without points', () => {
    expect(linePath([], scales([], 0))).toStrictEqual({ line: '', area: '' });
  });

  it('rejects a length mismatch and non-finite values', () => {
    const s = scales([0, 100], 2);
    expect(() => linePath([0], s)).toThrow(RangeError);
    expect(() => linePath([0, Number.NaN], s)).toThrow(RangeError);
  });
});

describe('bars', () => {
  it('lays an empty plot with zero at its foot', () => {
    expect(bars([])).toStrictEqual({ zero: 100, top: 2, cells: [] });
  });

  it('gives an all-positive run the full height from a zero line at the foot', () => {
    const layout = bars([10, 20]);
    expect(layout.zero).toBe(98);
    expect(layout.cells).toHaveLength(2);
    expect(layout.cells[0]).toMatchObject({ sign: 1 });
    expect(layout.cells[1]).toMatchObject({ sign: 1 });
    // The taller bar reaches the head; both stand on the zero line.
    expect(layout.cells[1]?.y).toBe(2);
    expect((layout.cells[0]?.y ?? 0) + (layout.cells[0]?.height ?? 0)).toBeCloseTo(98, 5);
    expect(layout.top).toBe(2);
  });

  it('hangs negative bars below an interior zero line', () => {
    const layout = bars([10, -10]);
    expect(layout.zero).toBe(50);
    expect(layout.cells[0]).toMatchObject({ sign: 1, y: 2 });
    expect(layout.cells[1]).toMatchObject({ sign: -1, y: 50, height: 48 });
  });

  it('marks a null or zero value as a tick on the line, never a bar', () => {
    const layout = bars([null, 0, 5]);
    expect(layout.cells[0]).toMatchObject({ sign: 0, height: 0.7 });
    expect(layout.cells[1]).toMatchObject({ sign: 0 });
    expect(layout.cells[0]?.y).toBe(layout.zero);
  });

  it('caps bar width, and centres cells', () => {
    const wide = bars([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const cell of wide.cells) expect(cell.width).toBeLessThanOrEqual(9);
    const narrow = bars([1, 2]);
    expect(narrow.cells[0]?.width).toBe(9);
    const one = bars([1]);
    expect(one.cells[0]?.width).toBe(9);
    expect(one.cells[0]?.x).toBeCloseTo(45.5, 5);
  });

  it('rejects non-finite values', () => {
    expect(() => bars([1, Number.NaN])).toThrow(RangeError);
  });
});

describe('stacked', () => {
  it('lays an empty plot with zero mid-plot', () => {
    expect(stacked([])).toStrictEqual({ zero: 50, columns: [] });
  });

  it('stacks positives upward, largest at the foot, sharing one scale', () => {
    const layout = stacked([
      [
        { key: 'a', value: 30 },
        { key: 'b', value: 70 },
      ],
    ]);
    expect(layout.columns).toHaveLength(1);
    const column = layout.columns[0];
    expect(column?.total).toBe(100);
    // Largest first from the zero line upward.
    expect(column?.segments.map((s) => s.key)).toStrictEqual(['b', 'a']);
    const heights = column?.segments.map((s) => s.height) ?? [];
    expect((heights[0] ?? 0) / (heights[1] ?? 1)).toBeCloseTo(70 / 30, 2);
    expect(heights[0]).toBeGreaterThan(0);
    // The stack's foot sits on the zero line.
    const foot = column?.segments[0];
    expect((foot?.y ?? 0) + (foot?.height ?? 0)).toBeCloseTo(layout.zero, 1);
  });

  it('stacks negatives downward in the order given', () => {
    const layout = stacked([
      [
        { key: 'a', value: -20 },
        { key: 'b', value: -30 },
      ],
    ]);
    const column = layout.columns[0];
    expect(column?.segments.map((s) => s.key)).toStrictEqual(['a', 'b']);
    expect(column?.segments[0]?.y).toBe(layout.zero);
    expect(column?.segments[1]?.y).toBeGreaterThan(layout.zero);
    expect(column?.total).toBe(-50);
  });

  it('mixes signs around the zero line and scales columns together', () => {
    const layout = stacked([[{ key: 'up', value: 100 }], [{ key: 'down', value: -100 }]]);
    expect(layout.zero).toBe(50);
    const [first, second] = layout.columns;
    expect(first?.segments[0]).toMatchObject({ y: 0, height: 50 });
    expect(second?.segments[0]).toMatchObject({ y: 50, height: 50 });
  });

  it('holds the zero line steady when one side is empty', () => {
    const upOnly = stacked([[{ key: 'a', value: 50 }]]);
    expect(upOnly.zero).toBeGreaterThan(90);
    const downOnly = stacked([[{ key: 'a', value: -50 }]]);
    expect(downOnly.zero).toBeLessThan(10);
  });

  it('rejects non-finite values', () => {
    expect(() => stacked([[{ key: 'a', value: Number.NaN }]])).toThrow(RangeError);
  });
});

describe('ticks', () => {
  it('labels three dates on a phone plot and four on a wider one', () => {
    expect(ticks(12, 300)).toStrictEqual([0, 6, 11]);
    expect(ticks(12, 600)).toStrictEqual([0, 4, 7, 11]);
  });

  it('thins out as the plot narrows', () => {
    expect(ticks(12, 200)).toStrictEqual([0, 11]);
    expect(ticks(12, 100)).toStrictEqual([0]);
    expect(ticks(12, 0)).toStrictEqual([0]);
  });

  it('always keeps the first and last point, deduplicated when points are few', () => {
    expect(ticks(3, 800)).toStrictEqual([0, 1, 2]);
    expect(ticks(2, 800)).toStrictEqual([0, 1]);
    expect(ticks(1, 800)).toStrictEqual([0]);
    expect(ticks(4, 800)).toStrictEqual([0, 1, 2, 3]);
  });

  it('labels nothing without points', () => {
    expect(ticks(0, 800)).toStrictEqual([]);
  });
});

describe('nearestPoint', () => {
  it('snaps to the closest index', () => {
    expect(nearestPoint(0, 5)).toBe(0);
    expect(nearestPoint(100, 5)).toBe(4);
    expect(nearestPoint(24, 5)).toBe(1);
    expect(nearestPoint(26, 5)).toBe(1);
    expect(nearestPoint(37, 5)).toBe(1);
    expect(nearestPoint(38, 5)).toBe(2);
    expect(nearestPoint(50, 5)).toBe(2);
  });

  it('clamps off-plot positions to the nearer end', () => {
    expect(nearestPoint(-30, 5)).toBe(0);
    expect(nearestPoint(130, 5)).toBe(4);
    expect(nearestPoint(Number.NEGATIVE_INFINITY, 5)).toBe(0);
    expect(nearestPoint(Number.POSITIVE_INFINITY, 5)).toBe(4);
  });

  it('reads index 0 with under two points, or no position at all', () => {
    expect(nearestPoint(60, 1)).toBe(0);
    expect(nearestPoint(60, 0)).toBe(0);
    expect(nearestPoint(Number.NaN, 5)).toBe(0);
  });
});

describe('allocation', () => {
  const seg = (name: string, minor: number, slot: number) => ({ name, minor, slot });

  it('ranks largest first with shares summing to 10000', () => {
    const slices = allocation([
      seg('Cash', 100, 0),
      seg('Listed', 300, 1),
      seg('Property', 600, 2),
    ]);
    expect(slices.map((s) => s.name)).toStrictEqual(['Property', 'Listed', 'Cash']);
    expect(slices.map((s) => s.shareBp)).toStrictEqual([6000, 3000, 1000]);
    expect(slices.every((s) => !s.other)).toBe(true);
  });

  it('splits remainders largest-first so shares always sum exactly', () => {
    const slices = allocation([seg('A', 1, 0), seg('B', 1, 1), seg('C', 1, 2)]);
    expect(slices.map((s) => s.shareBp).reduce((a, b) => a + b, 0)).toBe(10000);
    expect(slices[0]?.shareBp).toBe(3334);
  });

  it('keeps colour slots untouched while ranking by size', () => {
    const slices = allocation([seg('Cash', 100, 3), seg('Listed', 900, 0)]);
    expect(slices[0]).toMatchObject({ name: 'Listed', slot: 0 });
    expect(slices[1]).toMatchObject({ name: 'Cash', slot: 3 });
  });

  it('folds every segment past the eighth into one Other pinned last', () => {
    const segments = Array.from({ length: 10 }, (_, i) => seg(`T${i}`, 100 * (10 - i), i));
    const slices = allocation(segments);
    expect(slices).toHaveLength(9);
    expect(slices[8]).toMatchObject({ name: 'Other', minor: 300, slot: 8, other: true });
    expect(slices.map((s) => s.shareBp).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('holds nothing without segments, and zero shares on a zero total', () => {
    expect(allocation([])).toStrictEqual([]);
    const slices = allocation([seg('Cash', 0, 0)]);
    expect(slices).toStrictEqual([{ name: 'Cash', minor: 0, slot: 0, shareBp: 0, other: false }]);
  });

  it('rejects negative or non-finite totals and bad slots', () => {
    expect(() => allocation([seg('Cash', -1, 0)])).toThrow(RangeError);
    expect(() => allocation([seg('Cash', Number.NaN, 0)])).toThrow(RangeError);
    expect(() => allocation([seg('Cash', 1, -1)])).toThrow(RangeError);
    expect(() => allocation([seg('Cash', 1, 1.5)])).toThrow(RangeError);
  });
});

describe('chart', () => {
  it('exposes the geometry as one namespace (architecture §7.9)', () => {
    expect(chart).toStrictEqual({
      scales,
      linePath,
      bars,
      stacked,
      ticks,
      nearestPoint,
      allocation,
    });
  });
});
