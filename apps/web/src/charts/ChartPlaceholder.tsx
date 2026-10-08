import { useId, type CSSProperties, type ReactNode } from 'react';
import styles from './ChartPlaceholder.module.css';

/**
 * Which shape the sample takes: one trend line, three lines (assets vs liabilities), growth
 * bars, or stacked bars. The sample is fixed — never random, never the person's figures.
 */
export type PlaceholderKind = 'line' | 'lines' | 'bars' | 'stacked';

export interface ChartPlaceholderProps {
  readonly kind: PlaceholderKind;
  /** The chart's height in px: the placeholder keeps its place, so the screen holds its shape. */
  readonly height: number;
  /**
   * The sticker's words. "Need more data" when the chart cannot be drawn yet; "Pick a longer
   * range" when history exists but the range holds too little; "Nothing to show" when filters
   * leave nothing (design-system §6).
   */
  readonly label?: string;
  /** The single line saying what makes the chart appear, where the screen says it nowhere else. */
  readonly sub?: string;
  readonly testId?: string;
}

/** The fixed sample waveform, freed from the prototype: ten rises, never the person's data. */
const SAMPLE = [28, 40, 35, 50, 44, 58, 53, 66, 62, 78];

const fx = (i: number): string => ((i / (SAMPLE.length - 1)) * 100).toFixed(2);

function pathOf(values: readonly number[], k: number): string {
  return values.map((v, i) => `${i ? 'L' : 'M'}${fx(i)} ${(100 - v * k).toFixed(2)}`).join(' ');
}

interface WashSampleProps {
  readonly fade: ReactNode;
  readonly grid: ReactNode;
  readonly wash: string;
}

function LineSample({ fade, grid, wash }: WashSampleProps) {
  const d = pathOf(SAMPLE, 1);
  return (
    <>
      {fade}
      {grid}
      <path d={`${d} L100 100 L0 100 Z`} fill={wash} />
      <path className={styles.line} d={d} stroke="currentColor" />
    </>
  );
}

function LinesSample({ fade, grid, wash }: WashSampleProps) {
  const up = pathOf(SAMPLE, 1);
  const down = pathOf(
    SAMPLE.map((v) => 30 - v / 6),
    1,
  );
  const net = pathOf(
    SAMPLE.map((v) => v * 0.72),
    1,
  );
  return (
    <>
      {fade}
      {grid}
      <path d={`${up} L100 100 L0 100 Z`} fill={wash} opacity="0.8" />
      <path d={`${down} L100 100 L0 100 Z`} fill={wash} opacity="0.6" />
      <path className={styles.line} d={up} stroke="currentColor" />
      <path className={styles.line} d={down} stroke="currentColor" strokeOpacity="0.75" />
      <path className={styles.line} d={net} stroke="currentColor" strokeOpacity="0.5" />
    </>
  );
}

const BAR_VALUES = [38, 55, -16, 44, 66];
const STACKED_COLUMNS = [
  [26, 16, 9],
  [29, 17, 10],
  [31, 19, 10],
  [35, 21, 11],
  [40, 22, 12],
];
const STACK_OPACITY = [0.72, 0.48, 0.28];

function columnX(i: number, columns: number): number {
  return (100 / columns) * i + 100 / columns / 2 - 4.5;
}

function BarsSample() {
  const zero = 72;
  return (
    <>
      {BAR_VALUES.map((v, i) => (
        <rect
          key={i}
          x={columnX(i, BAR_VALUES.length).toFixed(2)}
          y={v > 0 ? zero - v : zero}
          width="9"
          height={Math.abs(v)}
          fill="currentColor"
          fillOpacity={v > 0 ? 0.7 : 0.4}
        />
      ))}
      <line className={styles.zero} x1="0" y1={zero} x2="100" y2={zero} />
    </>
  );
}

function StackedSample() {
  const zero = 84;
  return (
    <>
      {STACKED_COLUMNS.map((segments, i) => {
        let y = zero;
        return (
          <g key={i}>
            {segments.map((v, j) => {
              y -= v ?? 0;
              return (
                <rect
                  key={j}
                  x={columnX(i, STACKED_COLUMNS.length).toFixed(2)}
                  y={y}
                  width="9"
                  height={(v ?? 0) - 1}
                  fill="currentColor"
                  fillOpacity={STACK_OPACITY[j] ?? 0.3}
                />
              );
            })}
            <rect
              x={columnX(i, STACKED_COLUMNS.length).toFixed(2)}
              y={zero + 1}
              width="9"
              height="12"
              fill="currentColor"
              fillOpacity="0.3"
            />
          </g>
        );
      })}
      <line className={styles.zero} x1="0" y1={zero} x2="100" y2={zero} />
    </>
  );
}

/** Frosted glass holds where the blur does; server markup assumes it, as browsers do. */
const FROSTED =
  typeof CSS === 'undefined' ||
  CSS.supports('backdrop-filter', 'blur(4px)') ||
  CSS.supports('-webkit-backdrop-filter', 'blur(4px)');

const FROSTED_VEIL: CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--card) 55%, transparent)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
};

/**
 * Too little data is a placeholder, never a gap (design-system §5, §6): the chart's own shape in
 * neutral ink under frosted glass, labelled, with one line saying what makes it appear. No
 * figures, no dates, no data colours. The sample hides from screen readers; the words are read.
 */
export function ChartPlaceholder({
  kind,
  height,
  label = 'Need more data',
  sub,
  testId = 'chart-placeholder',
}: ChartPlaceholderProps) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fade = (
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="currentColor" stopOpacity="0.5" />
        <stop offset="1" stopColor="currentColor" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
  const grid = (
    <>
      {[25, 50, 75].map((y) => (
        <line key={y} className={styles.grid} x1="0" y1={y} x2="100" y2={y} />
      ))}
    </>
  );
  return (
    <div className={styles.placeholder} style={{ height }} data-testid={testId}>
      <svg
        className={styles.sample}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {kind === 'line' ? (
          <LineSample fade={fade} grid={grid} wash={`url(#${gradientId})`} />
        ) : kind === 'lines' ? (
          <LinesSample fade={fade} grid={grid} wash={`url(#${gradientId})`} />
        ) : kind === 'bars' ? (
          <BarsSample />
        ) : (
          <StackedSample />
        )}
      </svg>
      <div className={styles.veil} style={FROSTED ? FROSTED_VEIL : undefined}>
        <p className={styles.label}>{label}</p>
        {sub ? <p className={styles.sub}>{sub}</p> : null}
      </div>
    </div>
  );
}
