import { ticks as d3ticks } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';

/**
 * Chart geometry (architecture §7.9): pure d3 maths over a normalised 0–100 plot box, shared by
 * the web's SVG components and, later, native. No clock, randomness or I/O: `today` never enters
 * here. Every coordinate is rounded to two decimals, so SVG output is compact and stable.
 *
 * The plot box follows the prototype (docs/02-prototype/app.js): SVG carries geometry only in a
 * 0–100 by 0–100 box with `preserveAspectRatio="none"`, and every piece of text is HTML positioned
 * over or under it, so nothing is ever stretched.
 */

/** Two decimals: exact on the page, stable in snapshots. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function assertFinite(values: readonly number[], name: string): void {
  for (const value of values) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must hold finite numbers.`);
  }
}

/** The x/y mappings of one plot, with the domain they were built from and its gridlines. */
export interface ChartScales {
  /** Points per series; the x positions are the indices `0..count-1`. */
  readonly count: number;
  /** The niced domain: the lowest and highest values the plot covers. */
  readonly min: number;
  readonly max: number;
  /** Point index to horizontal position, 0–100. Always 50 when there is under one point. */
  readonly x: (index: number) => number;
  /** Value to vertical position, 0–100 counting down. */
  readonly y: (value: number) => number;
  /** Round values within the domain for gridlines and y-axis labels, ascending. */
  readonly yTicks: readonly number[];
}

export interface ScalesOptions {
  /** Stretch the domain to include zero, for charts read against it (assets vs liabilities). */
  readonly includeZero?: boolean;
}

/**
 * The mappings of a line chart over `count` points. `values` holds every plotted value across
 * every series, so one domain covers them all. The domain is niced outward (d3), so gridlines sit
 * on round numbers; a flat series is padded by 5% so its line still draws mid-plot.
 */
export function scales(
  values: readonly number[],
  count: number,
  options: ScalesOptions = {},
): ChartScales {
  assertFinite(values, 'scales');
  let lo = values.length ? Infinity : 0;
  let hi = values.length ? -Infinity : 1;
  for (const value of values) {
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  if (options.includeZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.05;
    lo -= pad;
    hi += pad;
  }
  const yScale = scaleLinear().domain([lo, hi]).nice(3).range([100, 0]);
  const domain = yScale.domain();
  const min = domain[0] ?? lo;
  const max = domain[1] ?? hi;
  const xScale =
    count >= 2
      ? scaleLinear()
          .domain([0, count - 1])
          .range([0, 100])
      : null;
  return {
    count,
    min,
    max,
    x: xScale ? (index: number) => xScale(index) : () => 50,
    y: (value: number) => yScale(value),
    yTicks: d3ticks(min, max, 3),
  };
}

interface IndexedValue {
  readonly index: number;
  readonly value: number;
}

/** A series' line and the wash beneath it, as SVG path strings in the plot box. */
export interface LinePaths {
  readonly line: string;
  /** The line closed along the plot's foot: the tomato wash under a trend. */
  readonly area: string;
}

/**
 * One series' paths from its values in point order. `values.length` must match the scales'
 * `count`: a mismatch is a wiring bug, not a shorter series.
 */
export function linePath(values: readonly number[], s: ChartScales): LinePaths {
  assertFinite(values, 'linePath');
  if (values.length !== s.count) {
    throw new RangeError(`linePath needs ${s.count} values, one per point.`);
  }
  const points: IndexedValue[] = values.map((value, index) => ({ index, value }));
  const x = (d: IndexedValue): number => round2(s.x(d.index));
  const y = (d: IndexedValue): number => round2(s.y(d.value));
  return {
    line: line<IndexedValue>().x(x).y(y)(points) ?? '',
    area: area<IndexedValue>().x(x).y0(100).y1(y)(points) ?? '',
  };
}

/** One growth bar: its cell and, when it has a value, its signed rectangle. */
export interface BarCell {
  /** The cell's left edge and width: labels centre on `x + width / 2`. */
  readonly x: number;
  readonly width: number;
  readonly y: number;
  readonly height: number;
  /** The bar's side of zero: 1 above, -1 below, 0 a tick on the line (a null value). */
  readonly sign: 1 | 0 | -1;
}

/** Growth bars (design-system §5): no axis, so each bar carries its own value beside the plot. */
export interface BarLayout {
  /** The zero line's vertical position; bars rise from it or hang from it. */
  readonly zero: number;
  /** The gridline's position at the scale's top, drawn only with zero bounds on. */
  readonly top: number;
  readonly cells: readonly BarCell[];
}

/**
 * Vertical change bars over `values` in order. The scale covers only the side the bars use, so an
 * all-positive run gets the full height; null is no value for the period (labelled "—" beside a
 * tick on the zero line, never a bar).
 */
export function bars(values: readonly (number | null)[]): BarLayout {
  assertFinite(
    values.filter((v): v is number => v !== null),
    'bars',
  );
  const cells: BarCell[] = [];
  if (!values.length) return { zero: 100, top: 2, cells };
  const drawn = values.map((v) => v ?? 0);
  const top = Math.max(0, ...drawn);
  const bottom = Math.min(0, ...drawn);
  const span = top - bottom || 1;
  const fy = (v: number): number => round2(2 + ((top - v) / span) * 96);
  const zero = fy(0);
  const cellWidth = 100 / values.length;
  const width = round2(Math.min(cellWidth * 0.52, 9));
  values.forEach((v, i) => {
    const value = v ?? 0;
    const y = value >= 0 ? fy(value) : zero;
    cells.push({
      x: round2(cellWidth * i + cellWidth / 2 - width / 2),
      width,
      y,
      height: round2(Math.max(0.7, Math.abs(fy(value) - zero))),
      sign: v === null || value === 0 ? 0 : value > 0 ? 1 : -1,
    });
  });
  return { zero, top: fy(top), cells };
}

/** One stacked piece: its series key and its signed value. */
export interface StackedValue {
  readonly key: string;
  readonly value: number;
}

/** One stacked rectangle, in the plot box. */
export interface StackedSegment {
  readonly key: string;
  readonly y: number;
  readonly height: number;
}

/** One column of stacked bars, with the total its top label shows. */
export interface StackedColumn {
  readonly x: number;
  readonly width: number;
  readonly total: number;
  readonly segments: readonly StackedSegment[];
}

/** Distribution over time (design-system §5): stacked bars, liabilities below the zero line. */
export interface StackedLayout {
  readonly zero: number;
  readonly columns: readonly StackedColumn[];
}

/**
 * Stacked columns in order. Non-negative values stack upward from zero, largest at the foot;
 * negative values stack downward in the order given. Every column shares one scale, so heights
 * compare across the plot.
 */
export function stacked(columns: readonly (readonly StackedValue[])[]): StackedLayout {
  assertFinite(
    columns.flatMap((c) => c.map((s) => s.value)),
    'stacked',
  );
  if (!columns.length) return { zero: 50, columns: [] };
  let maxUp = 1;
  let maxDown = 1;
  const ups = columns.map((segments) =>
    segments.filter((s) => s.value >= 0).reduce((sum, s) => sum + s.value, 0),
  );
  const downs = columns.map((segments) =>
    segments.filter((s) => s.value < 0).reduce((sum, s) => sum - s.value, 0),
  );
  for (const up of ups) maxUp = Math.max(maxUp, up);
  for (const down of downs) maxDown = Math.max(maxDown, down);
  const total = maxUp + maxDown;
  const exactZero = (maxUp / total) * 100;
  const zero = round2(exactZero);
  const unit = 100 / total;
  const cellWidth = 100 / columns.length;
  const width = round2(Math.min(cellWidth * 0.5, 9));
  return {
    zero,
    columns: columns.map((segments, i) => {
      const x = round2(cellWidth * i + cellWidth / 2 - width / 2);
      let up = exactZero;
      let down = exactZero;
      const rects: StackedSegment[] = [];
      for (const s of [...segments].filter((s) => s.value >= 0).sort((a, b) => b.value - a.value)) {
        const height = s.value * unit;
        up -= height;
        rects.push({ key: s.key, y: round2(up), height: round2(height) });
      }
      for (const s of segments.filter((s) => s.value < 0)) {
        const height = -s.value * unit;
        rects.push({ key: s.key, y: round2(down), height: round2(height) });
        down += height;
      }
      return {
        x,
        width,
        total: segments.reduce((sum, s) => sum + s.value, 0),
        segments: rects,
      };
    }),
  };
}

/**
 * About 140 px per date label ("May 2026" in meta, with room to breathe): a phone plot fits
 * three, a wider one four — the prototype's density, driven by the plot's own width.
 */
const TICK_GAP_PX = 140;

/** At most four date labels: more would collide once the text scales up on a phone. */
const MAX_TICKS = 4;

/**
 * Which points to label on a date axis of `count` points in `width` px: up to four evenly spaced
 * indices, always the first and the last, deduplicated when points are few.
 */
export function ticks(count: number, width: number): readonly number[] {
  if (count <= 0) return [];
  const labels = Math.min(MAX_TICKS, Math.max(1, Math.floor(width / TICK_GAP_PX) + 1), count);
  if (labels === 1) return [0];
  const last = count - 1;
  const gaps = labels - 1;
  const picked = Array.from({ length: labels }, (_, k) => Math.round((last * k) / gaps));
  return [...new Set(picked)];
}

/**
 * The point a reading lands on: the index nearest horizontal position `x` in the plot box,
 * clamped to the ends. Off-plot positions read their nearer end; without points there is no
 * reading, so index 0.
 */
export function nearestPoint(x: number, count: number): number {
  if (count <= 1 || Number.isNaN(x)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round((x / 100) * (count - 1))));
}

/** One allocation row in: its name, its minor-unit total, and its fixed palette slot. */
export interface AllocationSegment {
  readonly name: string;
  readonly minor: number;
  /**
   * The entity's slot in the categorical palette's fixed order (design-system §5): the type's
   * index in the person's type list, never its rank. Colour follows the entity, so filtering
   * never repaints the survivors.
   */
  readonly slot: number;
}

/** One allocation row out: its share in basis points, ranked largest first. */
export interface AllocationSlice extends AllocationSegment {
  /** Basis points of the total (Σ 10000); 0 for every slice when the total is 0. */
  readonly shareBp: number;
  /** True only for the folded remainder of every segment past the eighth. */
  readonly other: boolean;
}

/** Eight hues, never cycled: a ninth category folds into "Other" (design-system §5). */
const PALETTE_SLOTS = 8;

/**
 * The allocation ranked list from per-entity totals in any order. Segments past the eighth slot
 * fold into one "Other" slice pinned last; the rest rank largest first with colour slots
 * untouched. Shares are integers by largest remainder, so they always sum to 10000. Assets only:
 * a negative total is a wiring bug.
 */
export function allocation(segments: readonly AllocationSegment[]): readonly AllocationSlice[] {
  for (const s of segments) {
    if (!Number.isFinite(s.minor) || s.minor < 0) {
      throw new RangeError('allocation holds asset totals: finite, never negative.');
    }
    if (!Number.isInteger(s.slot) || s.slot < 0) {
      throw new RangeError('allocation slots are the entity order: integers from 0.');
    }
  }
  const ranked = segments
    .filter((s) => s.slot < PALETTE_SLOTS)
    .map((s) => ({ ...s, other: false }) as AllocationSlice)
    .sort((a, b) => b.minor - a.minor);
  const rest = segments.filter((s) => s.slot >= PALETTE_SLOTS);
  if (rest.length) {
    ranked.push({
      name: 'Other',
      minor: rest.reduce((sum, s) => sum + s.minor, 0),
      slot: PALETTE_SLOTS,
      shareBp: 0,
      other: true,
    });
  }
  const total = ranked.reduce((sum, s) => sum + s.minor, 0);
  if (!ranked.length || total === 0) return ranked.map((s) => ({ ...s, shareBp: 0 }));
  const floors = ranked.map((s) => Math.floor((s.minor / total) * 10000));
  let left = 10000 - floors.reduce((sum, f) => sum + f, 0);
  const remainders = ranked
    .map((s, i) => ({ i, frac: (s.minor / total) * 10000 - (floors[i] ?? 0) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const r of remainders) {
    if (left <= 0) break;
    floors[r.i] = (floors[r.i] ?? 0) + 1;
    left -= 1;
  }
  return ranked.map((s, i) => ({ ...s, shareBp: floors[i] ?? 0 }));
}

/** Chart geometry over the normalised plot box (architecture §7.9). */
export const chart = { scales, linePath, bars, stacked, ticks, nearestPoint, allocation };
