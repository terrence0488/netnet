import { bars as computeBars } from '@netnet/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../components/cx';
import { formatMoney } from '../components/money';
import { formatSignedCompactMoney } from './format';
import styles from './BarChart.module.css';

/** One change bar: its period's names, its signed change, and whether it was carried. */
export interface BarDatum {
  readonly key: string;
  /** The period's full name, read aloud (`September 2026`). */
  readonly label: string;
  /** The short name under the bar (`Sep`). */
  readonly short: string;
  /**
   * The signed change in minor units, or null with no earlier period to compare with: a tick
   * on the zero line, never a bar.
   */
  readonly value: number | null;
  /** The period-end value in minor units, read with the change. */
  readonly endValue: number;
  /** Nothing was recorded inside this period: the last value before it was used. */
  readonly carried: boolean;
}

export interface BarChartProps {
  /** The bars in order, oldest first. */
  readonly bars: readonly BarDatum[];
  /** The ISO code every value is denominated in. */
  readonly currency: string;
  /** The plot's height in px, without the value or period labels. */
  readonly height: number;
  /** The chart's name, read first by a screen reader ("Period changes"). */
  readonly label: string;
  /** The top gridline (the "Show zero bounds" view setting). On by default. */
  readonly showGrid?: boolean;
  readonly testId: string;
  /** Rendered when there are no bars to draw: the chart's placeholder. */
  readonly fallback?: ReactNode;
}

/** Press-and-hold before a touch scrubs the chart; a plain swipe still scrolls. */
const HOLD_MS = 180;
/** Drift that cancels the hold: the touch was a scroll, not a reading. */
const MOVE_PX = 10;

function colorOf(value: number | null): string {
  if (value === null || value === 0) return 'var(--rule-strong)';
  return value > 0 ? 'var(--gain)' : 'var(--loss)';
}

/**
 * Growth bars (design-system §5): each bar carries its change above it, so there is no axis to
 * read it off as well, and each is read like a trend — hover, tap, drag, arrow keys — with the
 * period, the full change and the end value. A plain swipe still scrolls and never traps the
 * page. Carried bars are outlines with the word under them — a holding's own carried
 * periods are flat ticks, since nothing moved them; the oldest bar is a tick too, since no
 * earlier period compares with it.
 */
export function BarChart({
  bars,
  currency,
  height,
  label,
  showGrid = true,
  testId,
  fallback,
}: BarChartProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const count = bars.length;
  const layout = useMemo(() => computeBars(bars.map((bar) => bar.value)), [bars]);

  const indexAt = useCallback(
    (clientX: number): number => {
      const layer = layerRef.current;
      if (!layer) return 0;
      const rect = layer.getBoundingClientRect();
      const frac = (clientX - rect.left) / Math.max(1, rect.width);
      if (Number.isNaN(frac)) return 0;
      return Math.min(count - 1, Math.max(0, Math.floor(frac * count)));
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

  if (count < 1) return <>{fallback}</>;

  const first = bars[0]?.label ?? '';
  const last = bars[count - 1]?.label ?? '';
  const current = active === null ? undefined : bars[active];
  const cell = active === null ? undefined : layout.cells[active];
  const x = cell === undefined ? 0 : cell.x + cell.width / 2;
  const columns = `repeat(${count}, minmax(0, 1fr))`;
  const reading =
    current === undefined
      ? ''
      : [
          current.label,
          current.value === null
            ? 'no earlier period to compare with'
            : `change ${formatMoney(current.value, currency, { signed: true })}`,
          `ended ${formatMoney(current.endValue, currency)}`,
          ...(current.carried ? ['carried'] : []),
        ].join(', ');

  return (
    <div className={styles.root} data-testid={testId}>
      <div className={styles.values} style={{ gridTemplateColumns: columns }}>
        {bars.map((bar) => (
          <div
            key={bar.key}
            className={cx(
              styles.value,
              bar.value === null || bar.value === 0
                ? styles.muted
                : bar.value > 0
                  ? styles.pos
                  : styles.neg,
            )}
          >
            {bar.value === null ? '—' : formatSignedCompactMoney(bar.value, currency)}
          </div>
        ))}
      </div>
      <div
        ref={plotRef}
        className={styles.plot}
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${label}. ${count === 1 ? `1 period: ${first}` : `${count} periods from ${first} to ${last}`}. Hover, tap, or use the arrow keys to read a period.`}
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
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {showGrid && (
            <line
              className={styles.grid}
              x1="0"
              y1={layout.top.toFixed(2)}
              x2="100"
              y2={layout.top.toFixed(2)}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <line
            className={styles.zero}
            x1="0"
            y1={layout.zero.toFixed(2)}
            x2="100"
            y2={layout.zero.toFixed(2)}
            vectorEffect="non-scaling-stroke"
          />
          {layout.cells.map((cell, i) => {
            const bar = bars[i];
            if (!bar) return null;
            const color = colorOf(bar.value);
            const box = {
              x: cell.x.toFixed(2),
              y: cell.y.toFixed(2),
              width: cell.width.toFixed(2),
              height: cell.height.toFixed(2),
            };
            return bar.carried && bar.value !== null && bar.value !== 0 ? (
              <rect
                key={bar.key}
                {...box}
                fill="none"
                stroke={color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                data-carried={bar.carried}
              />
            ) : (
              <rect key={bar.key} {...box} fill={color} data-carried={bar.carried} />
            );
          })}
          {cell !== undefined && (
            <rect
              x={cell.x.toFixed(2)}
              y={cell.y.toFixed(2)}
              width={cell.width.toFixed(2)}
              height={cell.height.toFixed(2)}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <div
          ref={layerRef}
          className={cx(styles.layer, active !== null && styles.reading)}
          aria-hidden="true"
        >
          {current !== undefined && (
            <div
              className={cx(styles.tip, x > 50 ? styles.left : styles.right)}
              style={{ left: `${x.toFixed(2)}%` }}
              data-testid={`${testId}-readout`}
            >
              <span className={styles.date}>{current.label}</span>
              {current.value === null ? (
                <>
                  <span className={styles.figure}>—</span>
                  <span className={styles.note}>No earlier period to compare with</span>
                </>
              ) : (
                <span className={styles.figure}>
                  {formatMoney(current.value, currency, { signed: true })}
                </span>
              )}
              <span className={styles.end}>Ended {formatMoney(current.endValue, currency)}</span>
              {current.carried ? <span className={styles.note}>Carried</span> : null}
            </div>
          )}
        </div>
        <span role="status" className="visually-hidden">
          {reading}
        </span>
      </div>
      <div className={styles.axis} style={{ gridTemplateColumns: columns }}>
        {bars.map((bar) => (
          <div key={bar.key} className={styles.slot}>
            <span>{bar.short}</span>
            {bar.carried ? <span className={styles.carried}>carried</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
