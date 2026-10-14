import { cx } from '../../components/cx';
import styles from './Pager.module.css';

/**
 * A chart pager (design-system §5, §6.1): ‹ window ›, naming what it pages. An arrow with
 * nowhere to go stays solid but `aria-disabled`, and ignores the tap — never the `disabled`
 * attribute, which would let the tap fall through on iOS.
 */
export function Pager({
  window,
  onEarlier,
  onLater,
  noEarlier,
  noLater,
  testId = 'pager',
}: {
  /** The window in view, e.g. `Jan – Jun 2026`. */
  readonly window: string;
  readonly onEarlier: () => void;
  readonly onLater: () => void;
  readonly noEarlier: boolean;
  readonly noLater: boolean;
  readonly testId?: string;
}) {
  return (
    <div className={styles.pager} data-testid={testId}>
      <button
        type="button"
        className={cx(styles.arrow, noEarlier && styles.unavailable)}
        aria-label="Earlier periods"
        aria-disabled={noEarlier}
        onClick={() => {
          if (!noEarlier) onEarlier();
        }}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <span className={styles.window}>{window}</span>
      <button
        type="button"
        className={cx(styles.arrow, noLater && styles.unavailable)}
        aria-label="Later periods"
        aria-disabled={noLater}
        onClick={() => {
          if (!noLater) onLater();
        }}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
