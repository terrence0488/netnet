import { cx } from './cx';
import styles from './Wordmark.module.css';

/** NetNet's name in the display face, with a four-point tomato sparkle for the dot (§6). */
export function Wordmark({ className }: { readonly className?: string }) {
  return (
    <span className={cx(styles.wordmark, className)}>
      <i className={styles.sparkle} aria-hidden="true" />
      NetNet
    </span>
  );
}
