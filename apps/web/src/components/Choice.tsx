import { cx } from './cx';
import styles from './Choice.module.css';

export interface ChoiceOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

export interface ChoiceProps<V extends string> {
  readonly options: readonly ChoiceOption<V>[];
  /** The chosen answer, or null before one is chosen. */
  readonly value: V | null;
  readonly onChange: (value: V) => void;
  /** Sentence answers stack; short ones sit in a row (design-system §6, Choice row). */
  readonly stacked?: boolean;
  /** The id of the question these answer, which names the group. */
  readonly labelledBy: string;
}

/**
 * Answers to a fact question: outlined buttons with shadows; the chosen one fills tomato
 * (design-system §6). Each is a toggle a screen reader hears as pressed or not.
 */
export function Choice<V extends string>({
  options,
  value,
  onChange,
  stacked = false,
  labelledBy,
}: ChoiceProps<V>) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={cx(styles.choice, stacked && styles.stacked)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.answer}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
