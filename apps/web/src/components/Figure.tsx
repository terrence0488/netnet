import { cx } from './cx';
import { formatMoney, type MoneyFormat } from './money';
import styles from './Figure.module.css';

/**
 * display: the hero (net worth, period totals). figure: a row or ledger amount. inline: an amount
 * in a sentence, at the sentence's size. change: a change figure under a row amount.
 */
export type FigureSize = 'display' | 'figure' | 'inline' | 'change';

export interface FigureProps extends Omit<MoneyFormat, 'signed'> {
  /** The amount in the currency's minor unit, as computed by core. */
  readonly minor: number;
  readonly currency: string;
  readonly size?: FigureSize;
  readonly className?: string;
}

/**
 * Money on screen (design-system §2.1): cents only when there are cents, none on a total. A change
 * figure carries its sign as well as its colour, and is not shown at all when nothing changed.
 * Every figure is marked `data-figure`, so a test can check that each appears once per screen.
 */
export function Figure({ minor, currency, size = 'figure', className, ...format }: FigureProps) {
  const change = size === 'change';
  if (change && minor === 0) return null;
  const text = formatMoney(minor, currency, { ...format, signed: change });
  const tone = change && (minor > 0 ? styles.gain : styles.loss);
  return (
    <span data-figure="" className={cx(styles.money, styles[size], tone, className)}>
      {text}
    </span>
  );
}
