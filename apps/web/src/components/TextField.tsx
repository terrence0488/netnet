import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';
import { Field, fieldStyles, useFieldIds, type FieldText } from './Field';

export interface TextFieldProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'size' | 'children'>,
    FieldText {}

/** A labelled text input: name, email, password, date. */
export function TextField({ label, hint, error, id, className, ...input }: TextFieldProps) {
  const text = { label, hint, error };
  const ids = useFieldIds(id, text);
  return (
    <Field text={text} ids={ids}>
      <input
        {...input}
        id={ids.control}
        className={cx(fieldStyles.box, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
      />
    </Field>
  );
}
