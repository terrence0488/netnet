import { useId, type ReactNode } from 'react';
import styles from './Field.module.css';

/** The words around a form control: its label, a hint, and what to change when it is wrong. */
export interface FieldText {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
}

export interface FieldIds {
  readonly control: string;
  readonly hint: string | undefined;
  readonly error: string | undefined;
  /** For the control's aria-describedby: the error first, then the hint. */
  readonly describedBy: string | undefined;
}

export function useFieldIds(id: string | undefined, text: FieldText): FieldIds {
  const generated = useId();
  const control = id ?? generated;
  const hint = text.hint ? `${control}-hint` : undefined;
  const error = text.error ? `${control}-error` : undefined;
  const describedBy = [error, hint].filter(Boolean).join(' ') || undefined;
  return { control, hint, error, describedBy };
}

/** The frame every field shares: an uppercase label above, the hint and the error below. */
export function Field({
  text,
  ids,
  labelExtra,
  children,
}: {
  text: FieldText;
  ids: FieldIds;
  labelExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={ids.control}>
        {text.label}
        {labelExtra}
      </label>
      {children}
      {text.error ? (
        <p id={ids.error} className={styles.error}>
          {text.error}
        </p>
      ) : null}
      {text.hint ? (
        <p id={ids.hint} className={styles.hint}>
          {text.hint}
        </p>
      ) : null}
    </div>
  );
}

export { styles as fieldStyles };
