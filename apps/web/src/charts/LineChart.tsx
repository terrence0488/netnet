import { linePath, nearestPoint, scales, ticks } from '@netnet/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../components/cx';
import { formatDate } from '../components/dates';
import { formatMoney } from '../components/money';
import { formatAxisDate, formatCompactMoney } from './format';
import styles from './LineChart.module.css';

/** One plotted line: a name for the readout, one value per date, and its token colour. */
export interface LineSeries {
  readonly name: string;
  readonly values: readonly number[];
  /** A token reference, such as `var(--brand)`: series colours never name a colour. */
  readonly color: string;
  /** Whether the wash fills beneath the line. */
  readonly fill: boolean;
}

export interface LineChartProps {
  /** One `YYYY-MM-DD` per point, oldest first; every series holds one value per date. */
  readonly dates: readonly string[];
  readonly series: readonly LineSeries[];
  /** The ISO code every value is denominated in. */
  readonly currency: string;
  /** The plot's height in px, without the date axis. */
  readonly height: number;
  /** The chart's name, read first by a screen reader ("Trend", "Assets vs liabilities"). */
  readonly label: string;
  /** Gridlines and y-axis labels (the "Show zero bounds" view setting). On by default. */
  readonly showGrid?: boolean;
  /** Stretch the domain to include zero, for charts read against it. */
  readonly includeZero?: boolean;
  readonly testId: string;
  /** Rendered when under two points can be read: the chart's placeholder. */
  readonly fallback?: ReactNode;
}

/** Press-and-hold before a touch scrubs the chart; a plain swipe still scrolls. */
const HOLD_MS = 180;
/** Drift that cancels the hold: the touch was a scroll, not a reading. */
const MOVE_PX = 10;
/** A phone plot's width, until measured: three date labels on first paint. */
const DEFAULT_WIDTH = 320;

/**
 * Every line chart, read point by point (design-system §5): a dashed crosshair snaps to the
 * nearest date, a dot marks each series there, and the readout gives the date and each value,
 * value first, largest first. Mouse: hover. Touch: tap a point, or press and hold, then drag, to
 * scrub; a plain swipe still scrolls and never traps the page. Keyboard: focus, then arrows (Home,
 * End, Esc). Screen readers hear each reading through a live region; the readout adds precision,
 * never a figure the page does not already show.
 */
export function LineChart({
  dates,
  series,
  currency,
  height,
  label,
  showGrid = true,
  includeZero = false,
  testId,
  fallback,
}: LineChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const count = dates.length;
  const s = useMemo(
    () =>
      scales(
        series.flatMap((sr) => sr.values),
        count,
        { includeZero },
      ),
    [series, count, includeZero],
  );
  const paths = useMemo(() => series.map((sr) => linePath(sr.values, s)), [series, s]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);

  const indexAt = useCallback(
    (clientX: number): number => {
      const layer = layerRef.current;
      if (!layer) return 0;
      const rect = layer.getBoundingClientRect();
      return nearestPoint(((clientX - rect.left) / Math.max(1, rect.width)) * 100, count);
    },
    [count],
  );

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    let start: { readonly x: number; readonly y: number } | null = null;
    let scrub = false;
    let hold = 0;
    const onStart = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (!touch) return;
      start = { x: touch.clientX, y: touch.clientY };
      scrub = false;
      window.clearTimeout(hold);
      hold = window.setTimeout(() => {
        scrub = true;
        if (start) setActive(indexAt(start.x));
      }, HOLD_MS);
    };
    const onMove = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (!touch) return;
      if (scrub) {
        event.preventDefault();
        setActive(indexAt(touch.clientX));
        return;
      }
      if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > MOVE_PX) {
        window.clearTimeout(hold);
        start = null;
      }
    };
    const onEnd = (): void => {
      window.clearTimeout(hold);
      if (!scrub && start) setActive(indexAt(start.x));
      scrub = false;
      start = null;
    };
    const onCancel = (): void => {
      window.clearTimeout(hold);
      scrub = false;
      start = null;
    };
    plot.addEventListener('touchstart', onStart, { passive: true });
    plot.addEventListener('touchmove', onMove, { passive: false });
    plot.addEventListener('touchend', onEnd);
    plot.addEventListener('touchcancel', onCancel);
    return () => {
      window.clearTimeout(hold);
      plot.removeEventListener('touchstart', onStart);
      plot.removeEventListener('touchmove', onMove);
      plot.removeEventListener('touchend', onEnd);
      plot.removeEventListener('touchcancel', onCancel);
    };
  }, [indexAt]);

  useEffect(() => {
    if (active === null) return;
    const onElsewhere = (event: TouchEvent): void => {
      const plot = plotRef.current;
      if (plot && event.target instanceof Node && !plot.contains(event.target)) setActive(null);
    };
    document.addEventListener('touchstart', onElsewhere, { passive: true });
    return () => document.removeEventListener('touchstart', onElsewhere);
  }, [active]);

  if (count < 2) return <>{fallback}</>;

  const first = dates[0] ?? '';
  const last = dates[count - 1] ?? '';
  // Gridline values are minor units: rounded to integers, then deduplicated by label, so two
  // gridlines never read the same figure when the span compacts tightly.
  const seenLabels = new Set<string>();
  const gridTicks = [...new Set(s.yTicks.map((t) => Math.round(t)))].filter((t) => {
    const text = formatCompactMoney(t, currency);
    if (seenLabels.has(text)) return false;
    seenLabels.add(text);
    return true;
  });
  // Date-axis labels are month and year: when neighbouring ticks fall in one month, only
  // the first names it — the rest keep their slots blank, so the axis never stutters.
  const axisTicks = ticks(count, width).map((i) => ({
    index: i,
    label: formatAxisDate(dates[i] ?? ''),
  }));
  const zeroInside = s.min < 0 && s.max > 0;
  const x = active === null ? 0 : s.x(active);
  const rows =
    active === null
      ? []
      : series
          .map((sr) => ({ name: sr.name, value: sr.values[active] ?? 0, color: sr.color }))
          .sort((a, b) => b.value - a.value);
  const reading =
    active === null
      ? ''
      : [
          formatDate(dates[active] ?? ''),
          ...(rows.length === 1
            ? [formatMoney(rows[0]?.value ?? 0, currency)]
            : rows.map((r) => `${r.name} ${formatMoney(r.value, currency)}`)),
        ].join(', ');

  return (
    <div className={styles.root} data-testid={testId}>
      <div
        ref={plotRef}
        className={styles.plot}
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${label}. ${count} points from ${formatDate(first)} to ${formatDate(last)}. Hover, tap, or use the arrow keys to read a date.`}
        data-testid={`${testId}-plot`}
        onPointerMove={(event) => {
          if (event.pointerType !== 'touch') setActive(indexAt(event.clientX));
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch' && !event.currentTarget.matches(':focus-visible')) {
            setActive(null);
          }
        }}
        onKeyDown={(event) => {
          let i = active ?? count - 1;
          if (event.key === 'ArrowLeft') i -= 1;
          else if (event.key === 'ArrowRight') i += 1;
          else if (event.key === 'Home') i = 0;
          else if (event.key === 'End') i = count - 1;
          else if (event.key === 'Escape') {
            setActive(null);
            return;
          } else return;
          event.preventDefault();
          setActive(Math.min(count - 1, Math.max(0, i)));
        }}
        onFocus={(event) => {
          if (active === null && event.currentTarget.matches(':focus-visible')) {
            setActive(count - 1);
          }
        }}
        onBlur={() => setActive(null)}
      >
        {showGrid &&
          gridTicks.map((t) => (
            <span key={t} className={styles.tick} style={{ top: `${s.y(t).toFixed(2)}%` }}>
              {formatCompactMoney(t, currency)}
            </span>
          ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {showGrid &&
            gridTicks.map((t) => (
              <line
                key={t}
                className={styles.grid}
                x1="0"
                y1={s.y(t).toFixed(2)}
                x2="100"
                y2={s.y(t).toFixed(2)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          {zeroInside && (
            <line
              className={styles.zero}
              x1="0"
              y1={s.y(0).toFixed(2)}
              x2="100"
              y2={s.y(0).toFixed(2)}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {series.map((sr, i) =>
            sr.fill ? (
              <path
                key={`wash-${i}`}
                d={paths[i]?.area ?? ''}
                style={{ fill: sr.color, fillOpacity: 'var(--wash)' }}
              />
            ) : null,
          )}
          {series.map((sr, i) => (
            <path
              key={`line-${i}`}
              className={styles.line}
              d={paths[i]?.line ?? ''}
              style={{ stroke: sr.color }}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div
          ref={layerRef}
          className={cx(styles.layer, active !== null && styles.reading)}
          aria-hidden="true"
        >
          {active !== null && (
            <>
              <i className={styles.crosshair} style={{ left: `${x.toFixed(2)}%` }} />
              {rows.map((r, i) => (
                <i
                  key={i}
                  className={styles.dot}
                  style={{
                    left: `${x.toFixed(2)}%`,
                    top: `${s.y(r.value).toFixed(2)}%`,
                    background: r.color,
                  }}
                />
              ))}
              <div
                className={cx(styles.tip, x > 50 ? styles.left : styles.right)}
                style={{ left: `${x.toFixed(2)}%` }}
                data-testid={`${testId}-readout`}
              >
                <span className={styles.date}>{formatDate(dates[active] ?? '')}</span>
                {rows.length === 1 ? (
                  <span className={styles.value}>{formatMoney(rows[0]?.value ?? 0, currency)}</span>
                ) : (
                  rows.map((r, i) => (
                    <span key={i} className={styles.row}>
                      <i className={styles.swatch} style={{ background: r.color }} />
                      <span className={styles.amount}>{formatMoney(r.value, currency)}</span>
                      <span>{r.name}</span>
                    </span>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <span role="status" className="visually-hidden">
          {reading}
        </span>
      </div>
      <div className={styles.axis}>
        {axisTicks.map(({ index, label }, at) => (
          <span key={index}>{at > 0 && axisTicks[at - 1]?.label === label ? '' : label}</span>
        ))}
      </div>
    </div>
  );
}
