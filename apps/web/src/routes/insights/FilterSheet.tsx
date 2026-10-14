import type { SavedExclusions, SavedFilter, TagMode } from '@netnet/contracts';
import { useId, useState } from 'react';
import { Button, Sheet } from '../../components';
import {
  normalizeExclusions,
  normalizeInsightsFilter,
  setTriState,
  tagMatch,
  toggleExcludedHolding,
  triState,
  type InsightsDraft,
} from './filtering';
import styles from './FilterSheet.module.css';

/**
 * Insights' filters (PRD J11): show-only type and tag chips with an AND / OR match, and a
 * Don't Show section for holdings, types and tags. Every tap drafts; Apply saves the draft and
 * Cancel drops it. A type or tag is shown-only or hidden, never both. Insights' filters are
 * separate from Home's, and say so.
 */

export interface FilterEntry {
  readonly id: string;
  readonly label: string;
}

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

export function InsightsFilterSheet({
  open,
  onClose,
  filter,
  exclusions,
  types,
  tags,
  holdings,
  onApply,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The filter and Don't Show list in force: the draft starts from them. */
  readonly filter: SavedFilter;
  readonly exclusions: SavedExclusions;
  readonly types: readonly FilterEntry[];
  readonly tags: readonly FilterEntry[];
  readonly holdings: readonly FilterEntry[];
  readonly onApply: (draft: InsightsDraft) => void;
}) {
  const [draft, setDraft] = useState<InsightsDraft>(() => ({ filter, exclusions }));
  const typesId = useId();
  const tagsId = useId();
  const hideHoldingsId = useId();
  const hideTypesId = useId();
  const hideTagsId = useId();

  const toggle = (kind: 'type' | 'tag', id: string, side: 'only' | 'hide') => {
    setDraft(
      setTriState(
        draft,
        kind,
        id,
        triState(draft.filter, draft.exclusions, kind, id) === side ? 'off' : side,
      ),
    );
  };

  const apply = () => {
    onApply({
      filter: normalizeInsightsFilter(draft.filter),
      exclusions: normalizeExclusions(draft.exclusions),
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Insights Filters"
      action={{ label: 'Reset', onAction: () => setDraft({ filter: {}, exclusions: {} }) }}
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
        {types.length > 0 ? (
          <section aria-labelledby={typesId} className={styles.group}>
            <h3 id={typesId} className={styles.subTitle}>
              Types
            </h3>
            <Chips
              entries={types}
              labelledBy={typesId}
              isOn={(id) => triState(draft.filter, draft.exclusions, 'type', id) === 'only'}
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
                mode={tagMatch(draft.filter)}
                onMode={(tagMode) =>
                  setDraft({
                    ...draft,
                    filter: { ...draft.filter, tagMode },
                  })
                }
              />
            </div>
            <Chips
              entries={tags}
              labelledBy={tagsId}
              isOn={(id) => triState(draft.filter, draft.exclusions, 'tag', id) === 'only'}
              onToggle={(id) => toggle('tag', id, 'only')}
            />
          </section>
        ) : null}

        <div className={styles.dontShow}>
          <h3 className={styles.centerTitle}>Don&apos;t Show</h3>
        </div>

        {holdings.length > 0 ? (
          <section aria-labelledby={hideHoldingsId} className={styles.group}>
            <h3 id={hideHoldingsId} className={styles.subTitle}>
              Holdings
            </h3>
            <Chips
              entries={holdings}
              labelledBy={hideHoldingsId}
              hide
              isOn={(id) => (draft.exclusions.holdingIds ?? []).includes(id)}
              onToggle={(id) =>
                setDraft({ ...draft, exclusions: toggleExcludedHolding(draft.exclusions, id) })
              }
            />
          </section>
        ) : null}

        {types.length > 0 ? (
          <section aria-labelledby={hideTypesId} className={styles.group}>
            <h3 id={hideTypesId} className={styles.subTitle}>
              Types
            </h3>
            <Chips
              entries={types}
              labelledBy={hideTypesId}
              hide
              isOn={(id) => triState(draft.filter, draft.exclusions, 'type', id) === 'hide'}
              onToggle={(id) => toggle('type', id, 'hide')}
            />
          </section>
        ) : null}

        {tags.length > 0 ? (
          <section aria-labelledby={hideTagsId} className={styles.group}>
            <h3 id={hideTagsId} className={styles.subTitle}>
              Tags
            </h3>
            <Chips
              entries={tags}
              labelledBy={hideTagsId}
              hide
              isOn={(id) => triState(draft.filter, draft.exclusions, 'tag', id) === 'hide'}
              onToggle={(id) => toggle('tag', id, 'hide')}
            />
          </section>
        ) : null}
        <p className={styles.hint}>Hidden from Insights only. Home is unchanged.</p>
      </div>
    </Sheet>
  );
}
