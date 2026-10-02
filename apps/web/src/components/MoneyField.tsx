import type { InputHTMLAttributes } from 'react';
import { cx } from './cx';
import { Field, useFieldIds, type FieldText } from './Field';
import { amountHint, currencySymbol, parseAmount, type AmountCheck } from './money';
import styles from './MoneyField.module.css';

export interface MoneyFieldProps
  extends
    Omit<
      InputHTMLAttributes<HTMLInputElement>,
      'disabled' | 'size' | 'children' | 'value' | 'onChange' | 'type' | 'inputMode'
    >,
    FieldText {
  /** ISO 4217 code: it sets the symbol and the decimals allowed. */
  readonly currency: string;
  /** What was typed, kept as text so the field never rewrites what the person is typing. */
  readonly value: string;
  /**
   * The text, and the amount it reads as: `{ok: true, amount: '1250.5'}` (the decimal string to
   * send), or the problem with it.
   */
  readonly onChange: (value: string, amount: AmountCheck) => void;
  /** The reader's locale: its decimal separator and grouping are the ones accepted. */
  readonly locale?: string;
}

/**
 * The one place a number is typed at display size (design-system §6, Amount entry). The text is
 * checked against the currency's minor unit as it is typed, and says what to change.
 */
export function MoneyField({
  label,
  hint,
  error,
  id,
  className,
  currency,
  value,
  onChange,
  locale,
  ...input
}: MoneyFieldProps) {
  const check = parseAmount(value, currency, locale);
  const problem = check.ok || check.problem === 'empty' ? undefined : check.problem;
  const text = { label, hint, error: error ?? (problem && amountHint(problem, currency, locale)) };
  const ids = useFieldIds(id, text);
  return (
    <Field
      text={text}
      ids={ids}
      labelExtra={<span className="visually-hidden">{` in ${currency}`}</span>}
    >
      <span className={cx(styles.box, text.error && styles.wrong)}>
        <span className={styles.symbol} aria-hidden="true">
          {currencySymbol(currency, locale)}
        </span>
        <input
          autoComplete="off"
          {...input}
          id={ids.control}
          type="text"
          inputMode="decimal"
          className={cx(styles.input, className)}
          value={value}
          onChange={(event) => {
            const typed = event.target.value;
            onChange(typed, parseAmount(typed, currency, locale));
          }}
          aria-invalid={text.error ? true : undefined}
          aria-describedby={ids.describedBy}
        />
      </span>
    </Field>
  );
}
