import { useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../components/ConnectButton';
import { cx } from '../../components/cx';
import styles from './Carousel.module.css';

/**
 * Home's trend and allocation under the total (design-system §7): a carousel on a phone — one
 * card each, full width, swiped sideways with snap, two dots beneath — and side by side on a
 * computer, with no dots. With one slide, the card stands alone.
 */

export interface CarouselSlide {
  readonly key: string;
  /** "Trend": named by the dots and by screen readers. */
  readonly label: string;
  readonly node: ReactNode;
}

export function Carousel({ slides }: { readonly slides: readonly CarouselSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const [at, setAt] = useState(0);

  if (slides.length < 2) {
    return (
      <>
        {slides.map((slide) => (
          <div key={slide.key}>{slide.node}</div>
        ))}
      </>
    );
  }
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setAt(Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
  };
  const go = (index: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <div role="region" aria-roledescription="carousel" aria-label="Trend and allocation">
      <div ref={track} className={styles.track} onScroll={onScroll}>
        {slides.map((slide, index) => (
          <div
            key={slide.key}
            className={styles.slide}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}: ${slide.label}`}
          >
            {slide.node}
          </div>
        ))}
      </div>
      <div className={styles.dots} role="group" aria-label="Choose a chart">
        {slides.map((slide, index) => (
          <button
            key={slide.key}
            type="button"
            className={styles.dot}
            aria-label={`Show ${slide.label}`}
            {...(index === at ? { 'aria-current': true } : {})}
            onClick={() => go(index)}
          >
            <span className={cx(styles.pip, index === at && styles.on)} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
