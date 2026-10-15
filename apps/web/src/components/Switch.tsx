import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { cx } from './cx';
import styles from './Switch.module.css';

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'disabled' | 'onChange' | 'role' | 'aria-checked'
> {
  /** On or off. */
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
}

/**
 * An on/off switch: a `role="switch"` button with the platform's idiom in our palette — an
 * outlined track that fills tomato when on, with a knob that slides. The whole row-tall target
 * toggles it; like Button, unavailable is `aria-disabled`, never `disabled`. Still under reduced
 * motion.
 */
export function Switch({ checked, onChange, className, onClick, ...props }: SwitchProps) {
  const off = props['aria-disabled'] === true || props['aria-disabled'] === 'true';
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (off) {
      event.preventDefault();
      return;
    }
    onChange(!checked);
    onClick?.(event);
  };
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      data-on={checked}
      className={cx(styles.switch, className)}
      onClick={click}
    >
      <span aria-hidden="true" className={styles.track}>
        <span className={styles.knob} />
      </span>
    </button>
  );
}
