import type { SelectHTMLAttributes } from 'react';
import { cx } from './cx';
import { Field, fieldStyles, useFieldIds, type FieldText } from './Field';
import styles from './Picker.module.css';

export interface PickerOption {
  readonly value: string;
  readonly label: string;
}

export interface PickerProps
  extends
    Omit<
      SelectHTMLAttributes<HTMLSelectElement>,
      'disabled' | 'children' | 'value' | 'onChange' | 'multiple'
    >,
    FieldText {
  readonly options: readonly PickerOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/**
 * One choice from a list, on the platform's own picker: people know their own, and ours would be
 * worse (design-system §6, deferred to the platform).
 */
export function Picker({
  label,
  hint,
  error,
  id,
  className,
  options,
  value,
  onChange,
  ...select
}: PickerProps) {
  const text = { label, hint, error };
  const ids = useFieldIds(id, text);
  return (
    <Field text={text} ids={ids}>
      <span className={styles.wrap}>
        <select
          {...select}
          id={ids.control}
          className={cx(fieldStyles.box, styles.control, className)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.describedBy}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </Field>
  );
}
