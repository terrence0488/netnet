import type { SavedFilter, TagMode } from '@netnet/contracts';
import { useId, useState } from 'react';
import { Button, Choice, Sheet } from '../../components';
import { normalizeFilter, setTriState, triState } from './filtering';
import styles from './FilterSheet.module.css';

/**
 * Home's filter (PRD J4): Show Only over assets or liabilities, show-only type and tag chips
 * with an AND / OR match, a Don't Show section for types and tags, and archived inclusion.
 * Every tap drafts; Apply saves the draft and Cancel drops it. A type or tag is shown-only or
 * hidden, never both. Home's filter is separate from Insights', and says so.
 */

export interface FilterEntry {
  readonly id: string;
  readonly label: string;
}

const SHOW_OPTIONS = [
  { value: 'assets', label: 'Assets' },
  { value: 'all', label: 'All' },
  { value: 'liabilities', label: 'Liabilities' },
] as const;

const ARCHIVED_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

function Chips({
  entries,
  isOn,
  onToggle,
  labelledBy,
  hide,
}: {
  readonly entries: readonly FilterEntry[];
  readonly isOn: (id: string) => boolean;
  readonly onToggle: (id: string) => void;
  readonly labelledBy: string;
  readonly hide?: boolean;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className={styles.chips}>
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={styles.chip}
          aria-pressed={isOn(entry.id)}
          onClick={() => onToggle(entry.id)}
        >
          <span className={styles.pill} {...(hide === true ? { 'data-hide': 'true' } : {})}>
            {entry.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function ModeToggle({
  mode,
  onMode,
  label,
}: {
  readonly mode: TagMode;
  readonly onMode: (mode: TagMode) => void;
  readonly label: string;
}) {
  return (
    <div role="group" aria-label={label} className={styles.mode}>
      {(
        [
          ['any', 'OR'],
          ['all', 'AND'],
        ] as const
      ).map(([value, text]) => (
        <button
          key={value}
          type="button"
          className={styles.modeButton}
          aria-pressed={mode === value}
          onClick={() => onMode(value)}
        >
          {text}
        </button>
      ))}
    </div>
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
  /** The filter in force: the draft starts from it, and Apply replaces it. */
  readonly filter: SavedFilter;
  readonly types: readonly FilterEntry[];
  readonly tags: readonly FilterEntry[];
  readonly onFilter: (filter: SavedFilter) => void;
}) {
  const [draft, setDraft] = useState<SavedFilter>(() => ({ ...filter }));
  const showId = useId();
  const typesId = useId();
  const tagsId = useId();
  const hideTypesId = useId();
  const hideTagsId = useId();
  const archivedId = useId();

  const toggle = (kind: 'type' | 'tag', id: string, side: 'only' | 'hide') => {
    setDraft(setTriState(draft, kind, id, triState(draft, kind, id) === side ? 'off' : side));
  };

  const apply = () => {
    onFilter(normalizeFilter(draft));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter Home"
      action={{ label: 'Reset', onAction: () => setDraft({}) }}
      footer={
        <>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <section aria-labelledby={showId} className={styles.group}>
          <h3 id={showId} className={styles.centerTitle}>
            Show Only
          </h3>
          <Choice
            labelledBy={showId}
            options={SHOW_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={draft.show ?? 'all'}
            onChange={(show) => setDraft({ ...draft, show })}
          />
        </section>

        {types.length > 0 ? (
          <section aria-labelledby={typesId} className={styles.group}>
            <h3 id={typesId} className={styles.subTitle}>
              Types
            </h3>
            <Chips
              entries={types}
              labelledBy={typesId}
              isOn={(id) => triState(draft, 'type', id) === 'only'}
              onToggle={(id) => toggle('type', id, 'only')}
            />
          </section>
        ) : null}

        {tags.length > 0 ? (
          <section aria-labelledby={tagsId} className={styles.group}>
            <div className={styles.rowHead}>
              <h3 id={tagsId} className={styles.subTitle}>
                Tags
              </h3>
              <ModeToggle
                label="Show-only tag match"
                mode={draft.tagMode ?? 'any'}
                onMode={(tagMode) => setDraft({ ...draft, tagMode })}
              />
            </div>
            <Chips
              entries={tags}
              labelledBy={tagsId}
              isOn={(id) => triState(draft, 'tag', id) === 'only'}
              onToggle={(id) => toggle('tag', id, 'only')}
            />
          </section>
        ) : null}

        <div className={styles.dontShow}>
          <h3 className={styles.centerTitle}>Don&apos;t Show</h3>
        </div>

        {types.length > 0 ? (
          <section aria-labelledby={hideTypesId} className={styles.group}>
            <h3 id={hideTypesId} className={styles.subTitle}>
              Types
            </h3>
            <Chips
              entries={types}
              labelledBy={hideTypesId}
              hide
              isOn={(id) => triState(draft, 'type', id) === 'hide'}
              onToggle={(id) => toggle('type', id, 'hide')}
            />
          </section>
        ) : null}

        {tags.length > 0 ? (
          <section aria-labelledby={hideTagsId} className={styles.group}>
            <div className={styles.rowHead}>
              <h3 id={hideTagsId} className={styles.subTitle}>
                Tags
              </h3>
              <ModeToggle
                label="Hidden tag match"
                mode={draft.hideTagMode ?? 'any'}
                onMode={(hideTagMode) => setDraft({ ...draft, hideTagMode })}
              />
            </div>
            <Chips
              entries={tags}
              labelledBy={hideTagsId}
              hide
              isOn={(id) => triState(draft, 'tag', id) === 'hide'}
              onToggle={(id) => toggle('tag', id, 'hide')}
            />
          </section>
        ) : null}
        <p className={styles.hint}>Hidden from Home only. Insights is unchanged.</p>

        <section aria-labelledby={archivedId} className={styles.group}>
          <h3 id={archivedId} className={styles.centerTitle}>
            Filter Archived
          </h3>
          <Choice
            labelledBy={archivedId}
            options={ARCHIVED_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={draft.includeArchived === true ? 'yes' : 'no'}
            onChange={(value) => setDraft({ ...draft, includeArchived: value === 'yes' })}
          />
        </section>
      </div>
    </Sheet>
  );
}
