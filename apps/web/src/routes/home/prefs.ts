import type { Baseline, Prefs, PrefsPatch, SavedFilter, Snapshot } from '@netnet/contracts';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, type Written } from '../../api/client';
import { useToast } from '../../components';
import { normalizeFilter } from './filtering';
import type { HomeSort } from './sort';

/** The baseline in force before the person chooses one: last month, as §7.5 reads it. */
const DEFAULT_BASELINE: Baseline = 'last_month';

/** `PATCH /api/prefs`: Home's filter, the baseline and the sort, kept across sessions. */
export function useSetPrefs() {
  return useMutation({
    mutationFn: (patch: PrefsPatch) => api.patch<Written<Prefs>>('/prefs', patch),
  });
}

export interface HomePrefs {
  readonly baseline: Baseline;
  readonly sort: HomeSort;
  readonly filter: SavedFilter;
  readonly setBaseline: (baseline: Baseline) => void;
  readonly setSort: (sort: HomeSort) => void;
  readonly setFilter: (filter: SavedFilter) => void;
}

/** A patch as the snapshot carries it: each key set, or cleared with null. */
function patchedPrefs(prefs: Prefs, patch: PrefsPatch): Prefs {
  const next: Prefs = { ...prefs };
  for (const key of ['homeFilter', 'insightsFilter', 'baseline', 'sort'] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else Object.assign(next, { [key]: value });
  }
  return next;
}

/**
 * Home's choices (PRD J4): the baseline, the sort and the filter, as the snapshot carries them.
 * Each applies at once — written to the cached snapshot first, then saved through `PATCH
 * /api/prefs`, so it is still in force next session. When saving fails, the snapshot is read
 * again and the choice falls back to what the server has, saying so.
 */
export function useHomePrefs(snapshot: Snapshot): HomePrefs {
  const client = useQueryClient();
  const toast = useToast();
  const setPrefs = useSetPrefs();

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
    baseline: snapshot.prefs.baseline ?? DEFAULT_BASELINE,
    sort: snapshot.prefs.sort ?? 'added',
    filter: snapshot.prefs.homeFilter ?? {},
    setBaseline: (baseline) => save(client, { baseline }),
    setSort: (sort) => save(client, { sort: sort === 'added' ? null : sort }),
    setFilter: (filter) => {
      const normalised = normalizeFilter(filter);
      save(client, { homeFilter: Object.keys(normalised).length === 0 ? null : normalised });
    },
  };
}
