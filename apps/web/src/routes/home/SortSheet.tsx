import { useId } from 'react';
import { Choice, Sheet } from '../../components';
import { SORT_OPTIONS, type HomeSort } from './sort';
import styles from './SortSheet.module.css';

/**
 * The sort sheet (PRD J4): value, name, change or last updated, as added until the person
 * chooses. One choice, applied at once.
 */
export function SortSheet({
  open,
  onClose,
  sort,
  onSort,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly sort: HomeSort;
  readonly onSort: (sort: HomeSort) => void;
}) {
  const labelId = useId();
  return (
    <Sheet open={open} onClose={onClose} title="Sort holdings">
      <p id={labelId} className={styles.question}>
        List the holdings:
      </p>
      <Choice
        stacked
        labelledBy={labelId}
        options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        value={sort}
        onChange={(value) => {
          onSort(value);
          onClose();
        }}
      />
    </Sheet>
  );
}
