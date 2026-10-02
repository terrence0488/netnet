import styles from './Spinner.module.css';

/** Something is on its way. Read as its label; still under reduced motion. */
export function Spinner({ label = 'Loading' }: { readonly label?: string }) {
  return (
    <span role="status" className={styles.spinner}>
      <span className={styles.ring} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
