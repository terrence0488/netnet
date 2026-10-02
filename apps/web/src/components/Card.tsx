import type { HTMLAttributes } from 'react';
import { cx } from './cx';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Rows reach the card's edges and pad themselves, split by soft rules (design-system §6). */
  readonly flush?: boolean;
  /** `section` when the card is a section of the screen with its own heading. */
  readonly as?: 'div' | 'section';
}

/**
 * The poster's primary structural device: a card fill, a 2px outline and a 4px hard shadow. A card
 * never holds another card (design-system §2 principle 2).
 */
export function Card({ flush = false, as: Tag = 'div', className, ...props }: CardProps) {
  return <Tag {...props} className={cx(styles.card, flush && styles.flush, className)} />;
}
