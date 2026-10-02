import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

/**
 * primary: the screen's one filled button (design-system §2.1 rule 10). outlined: a genuine second
 * route, one step down. quiet: an underlined text action.
 */
export type ButtonVariant = 'primary' | 'outlined' | 'quiet';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  readonly variant?: ButtonVariant;
  /** Fill the width of the column, as a form's action does on a phone. */
  readonly block?: boolean;
}

/** For a router link that should look like a button. */
export function buttonClass(variant: ButtonVariant = 'primary', block = false): string {
  return cx(styles.button, styles[variant], block && styles.block);
}

function unavailable(value: ButtonProps['aria-disabled']): boolean {
  return value === true || value === 'true';
}

/**
 * An unavailable button is `aria-disabled`, never `disabled`: it stays solid to a tap and to a
 * screen reader, and its click does nothing (design-system §6.1 rule 9).
 */
export function Button({
  variant = 'primary',
  block = false,
  className,
  type = 'button',
  onClick,
  ...props
}: ButtonProps) {
  const off = unavailable(props['aria-disabled']);
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (off) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      {...props}
      type={type}
      className={cx(buttonClass(variant, block), className)}
      onClick={click}
    />
  );
}
