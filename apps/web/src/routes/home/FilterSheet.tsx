import type { SavedFilter } from '@netnet/contracts';
import { useId } from 'react';
import { Choice, Sheet } from '../../components';
import { isFilterActive, setTriState, triState, type TriState } from './filtering';
import styles from './FilterSheet.module.css';

/**
 * Home's filter (PRD J4): show assets or liabilities, show only a type or tag, Don't Show a type
 * or tag. A type or tag is shown-only or hidden, never both. Every tap applies at once; Home's
 * filter is separate from Insights', and says so.
 */

export interface FilterEntry {
  readonly id: string;
  readonly label: string;
}

const SHOW_OPTIONS = [
  { value: 'all', label: 'Everything' },
  { value: 'assets', label: 'Assets' },
  { value: 'liabilities', label: 'Liabilities' },
] as const;

function TriToggles({
  id,
  kind,
  filter,
  onFilter,
}: {
  readonly id: string;
  readonly kind: 'type' | 'tag';
  readonly filter: SavedFilter;
  readonly onFilter: (filter: SavedFilter) => void;
}) {
  const state = triState(filter, kind, id);
  const press = (next: TriState) => onFilter(setTriState(filter, kind, id, next));
  return (
    <span className={styles.toggles}>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={state === 'only'}
        onClick={() => press(state === 'only' ? 'off' : 'only')}
      >
        <span className={styles.pill}>Show only</span>
      </button>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={state === 'hide'}
        onClick={() => press(state === 'hide' ? 'off' : 'hide')}
      >
        <span className={styles.pill} data-hide="true">
          Don’t show
        </span>
      </button>
    </span>
  );
}

function EntryList({
  title,
  entries,
  kind,
  filter,
  onFilter,
}: {
  readonly title: string;
  readonly entries: readonly FilterEntry[];
  readonly kind: 'type' | 'tag';
  readonly filter: SavedFilter;
  readonly onFilter: (filter: SavedFilter) => void;
}) {
  const labelId = useId();
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby={labelId} className={styles.group}>
      <h3 id={labelId} className={styles.groupTitle}>
        {title}
      </h3>
      <ul className={styles.entries}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.entry}>
            <span className={styles.entryName}>{entry.label}</span>
            <TriToggles id={entry.id} kind={kind} filter={filter} onFilter={onFilter} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FilterSheet({
  open,
  onClose,
  filter,
  types,
  tags,
  onFilter,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly filter: SavedFilter;
  readonly types: readonly FilterEntry[];
  readonly tags: readonly FilterEntry[];
  readonly onFilter: (filter: SavedFilter) => void;
}) {
  const showId = useId();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter Home"
      action={{ label: 'Done', onAction: onClose }}
    >
      <div className={styles.stack}>
        <section aria-labelledby={showId} className={styles.group}>
          <h3 id={showId} className={styles.groupTitle}>
            Show
          </h3>
          <Choice
            labelledBy={showId}
            options={SHOW_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={filter.show ?? 'all'}
            onChange={(show) => onFilter({ ...filter, show })}
          />
        </section>
        <EntryList title="Types" entries={types} kind="type" filter={filter} onFilter={onFilter} />
        <EntryList title="Tags" entries={tags} kind="tag" filter={filter} onFilter={onFilter} />
        {isFilterActive(filter) ? (
          <button type="button" className={styles.clear} onClick={() => onFilter({})}>
            Clear the filter
          </button>
        ) : null}
        <p className={styles.separate}>Home’s filter only — Insights has its own filter.</p>
      </div>
    </Sheet>
  );
}
