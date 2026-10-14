import type { Prefs, PrefsPatch, SavedExclusions, SavedFilter, Snapshot } from '@netnet/contracts';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, type Written } from '../../api/client';
import { useToast } from '../../components';
import { normalizeExclusions, normalizeInsightsFilter } from './filtering';

/** `PATCH /api/prefs`: Insights' filter and Don't Show list, kept across sessions. */
export function useSetInsightsPrefs() {
  return useMutation({
    mutationFn: (patch: PrefsPatch) => api.patch<Written<Prefs>>('/prefs', patch),
  });
}

export interface InsightsPrefs {
  readonly filter: SavedFilter;
  readonly exclusions: SavedExclusions;
  readonly setFilter: (filter: SavedFilter) => void;
  readonly setExclusions: (exclusions: SavedExclusions) => void;
  readonly clearExclusions: () => void;
  /** The sheet's Apply: both keys in one patch, each cleared when empty. */
  readonly apply: (filter: SavedFilter, exclusions: SavedExclusions) => void;
}

/** A patch as the snapshot carries it: each key set, or cleared with null. */
function patchedPrefs(prefs: Prefs, patch: PrefsPatch): Prefs {
  const next: Prefs = { ...prefs };
  for (const key of ['insightsFilter', 'insightsExclusions'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else Object.assign(next, { [key]: value });
  }
  return next;
}

/**
 * Insights' choices (PRD J11): the filter and the Don't Show list, as the snapshot carries
 * them, separate from Home's. Each applies at once — written to the cached snapshot first,
 * then saved through `PATCH /api/prefs`, so it is still in force next session. When saving
 * fails, the snapshot is read again and the choice falls back to what the server has, saying
 * so.
 */
export function useInsightsPrefs(snapshot: Snapshot): InsightsPrefs {
  const client = useQueryClient();
  const toast = useToast();
  const setPrefs = useSetInsightsPrefs();

  const save = (client: QueryClient, patch: PrefsPatch) => {
    client.setQueriesData<Snapshot>({ queryKey: ['snapshot'] }, (old) =>
      old === undefined ? old : { ...old, prefs: patchedPrefs(old.prefs, patch) },
    );
    setPrefs.mutate(patch, {
      onError: () => {
        void client.invalidateQueries({ queryKey: ['snapshot'] });
        toast.show({ message: 'That choice wasn’t saved. Check your connection.' });
      },
    });
  };

  return {
    filter: snapshot.prefs.insightsFilter ?? {},
    exclusions: snapshot.prefs.insightsExclusions ?? {},
    setFilter: (filter) => {
      const normalised = normalizeInsightsFilter(filter);
      save(client, { insightsFilter: Object.keys(normalised).length === 0 ? null : normalised });
    },
    setExclusions: (exclusions) => {
      const normalised = normalizeExclusions(exclusions);
      save(client, {
        insightsExclusions: Object.keys(normalised).length === 0 ? null : normalised,
      });
    },
    clearExclusions: () => save(client, { insightsExclusions: null }),
    apply: (filter, exclusions) => {
      const normalisedFilter = normalizeInsightsFilter(filter);
      const normalisedExclusions = normalizeExclusions(exclusions);
      save(client, {
        insightsFilter: Object.keys(normalisedFilter).length === 0 ? null : normalisedFilter,
        insightsExclusions:
          Object.keys(normalisedExclusions).length === 0 ? null : normalisedExclusions,
      });
    },
  };
}
