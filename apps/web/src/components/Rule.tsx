import { cx } from './cx';
import styles from './Rule.module.css';

/**
 * soft: the 1.5px rule between rows inside a card. strong: the 2px rule above an alternative
 * route. dashed: the line above what you owe in the position ledger.
 */
export type RuleVariant = 'soft' | 'strong' | 'dashed';

export function Rule({
  variant = 'soft',
  className,
}: {
  readonly variant?: RuleVariant;
  readonly className?: string;
}) {
  return <hr className={cx(styles.rule, styles[variant], className)} />;
}
