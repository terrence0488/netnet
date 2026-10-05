import { useState, type InputHTMLAttributes } from 'react';
import { Field, useFieldIds, type FieldText } from './Field';
import styles from './PasswordField.module.css';

export interface PasswordFieldProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'size' | 'children' | 'type'>,
    FieldText {
  /** `new-password` when setting one, `current-password` when logging in. */
  readonly autoComplete: 'new-password' | 'current-password';
}

/**
 * A password with Show beside it, inside the one box (the prototype's sign-up). The password is
 * only ever held by the input; nothing stores it.
 */
export function PasswordField({ label, hint, error, id, ...input }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const text = { label, hint, error };
  const ids = useFieldIds(id, text);
  return (
    <Field text={text} ids={ids}>
      <span className={styles.box}>
        <input
          {...input}
          id={ids.control}
          type={shown ? 'text' : 'password'}
          className={styles.input}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
        />
        <button
          type="button"
          className={styles.reveal}
          aria-controls={ids.control}
          onClick={() => setShown((now) => !now)}
        >
          {shown ? 'Hide' : 'Show'}
          <span className="visually-hidden"> password</span>
        </button>
      </span>
    </Field>
  );
}
