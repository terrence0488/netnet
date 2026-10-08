import type {
  Snapshot,
  Tag,
  TagInput,
  TypeInput,
  Universal,
  UserType,
  VersionedPack,
} from '@netnet/contracts';
import { UNIVERSALS } from '@netnet/contracts';
import { chainValue, typeLabel } from '@netnet/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../../api/account';
import { api, isApiError, type Written } from '../../api/client';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import {
  Button,
  Card,
  ErrorState,
  FormProblem,
  Picker,
  Sheet,
  TextField,
  usePackChain,
  useToast,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import styles from './Taxonomy.module.css';

/**
 * Types and tags (PRD J2): the person's own taxonomy. Types and tags are added, renamed, merged
 * and deleted here; holdings follow every change through the snapshot, and a type's label follows
 * the pack chain until it is renamed.
 */

type SheetState =
  | { kind: 'addType' }
  | { kind: 'editType'; id: string }
  | { kind: 'addTag' }
  | { kind: 'editTag'; id: string };

export function Taxonomy() {
  const me = useMe().data;
  const snapshot = useSnapshot<Snapshot>();
  if (!me || snapshot.isPending) return <Waiting />;
  if (snapshot.isError || snapshot.data === undefined) {
    return <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }
  return <TaxonomyLoaded snapshot={snapshot.data} />;
}

function TaxonomyLoaded({ snapshot }: { snapshot: Snapshot }) {
  const client = useQueryClient();
  const chain = usePackChain(snapshot.packRef);
  if (chain.status === 'pending') return <Waiting />;
  if (chain.status === 'error') {
    return (
      <ErrorState
        error={chain.error}
        onRetry={() => void client.refetchQueries({ queryKey: ['content'] })}
      />
    );
  }
  return <TaxonomyScreen snapshot={snapshot} chain={chain.packs} />;
}

function TaxonomyScreen({
  snapshot,
  chain,
}: {
  snapshot: Snapshot;
  chain: readonly VersionedPack[];
}) {
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const close = () => setSheet(null);

  const typeUsage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const holding of snapshot.holdings) {
      counts.set(holding.typeId, (counts.get(holding.typeId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.holdings]);
  const tagUsage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const holding of snapshot.holdings) {
      for (const tagId of holding.tagIds) counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.holdings]);

  const editType =
    sheet?.kind === 'editType' ? snapshot.types.find((t) => t.id === sheet.id) : undefined;
  const editTag =
    sheet?.kind === 'editTag' ? snapshot.tags.find((t) => t.id === sheet.id) : undefined;

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/account" className={styles.iconButton} aria-label="Back to Account">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className={styles.title}>Types and tags</h1>
        <span className={styles.spacer} />
      </div>

      <section aria-labelledby="types-heading" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="types-heading">Types · {snapshot.types.length}</h2>
        </div>
        <Card flush>
          {snapshot.types.map((type) => (
            <button
              key={type.id}
              type="button"
              className={styles.row}
              onClick={() => setSheet({ kind: 'editType', id: type.id })}
            >
              <span className={styles.grow}>
                <span className={styles.name}>{typeLabel(chain, type)}</span>
                <span className={styles.sub}>{usageText(typeUsage.get(type.id) ?? 0)}</span>
              </span>
            </button>
          ))}
        </Card>
        <div className={styles.add}>
          <Button variant="outlined" onClick={() => setSheet({ kind: 'addType' })}>
            Add type
          </Button>
        </div>
      </section>

      <section aria-labelledby="tags-heading" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="tags-heading">Tags · {snapshot.tags.length}</h2>
        </div>
        {snapshot.tags.length === 0 ? (
          <Card>
            <p className={styles.empty}>No tags yet. Tags label holdings across types.</p>
          </Card>
        ) : (
          <Card flush>
            {snapshot.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={styles.row}
                onClick={() => setSheet({ kind: 'editTag', id: tag.id })}
              >
                <span className={styles.grow}>
                  <span className={styles.name}>{tag.name}</span>
                  <span className={styles.sub}>{usageText(tagUsage.get(tag.id) ?? 0)}</span>
                </span>
              </button>
            ))}
          </Card>
        )}
        <div className={styles.add}>
          <Button variant="outlined" onClick={() => setSheet({ kind: 'addTag' })}>
            Add tag
          </Button>
        </div>
      </section>

      {sheet?.kind === 'addType' ? <AddTypeSheet chain={chain} onClose={close} /> : null}
      {sheet?.kind === 'editType' && editType ? (
        <EditTypeSheet
          chain={chain}
          type={editType}
          usage={typeUsage.get(editType.id) ?? 0}
          others={snapshot.types.filter((t) => t.id !== editType.id)}
          onClose={close}
        />
      ) : null}
      {sheet?.kind === 'addTag' ? <AddTagSheet onClose={close} /> : null}
      {sheet?.kind === 'editTag' && editTag ? (
        <EditTagSheet
          tag={editTag}
          usage={tagUsage.get(editTag.id) ?? 0}
          others={snapshot.tags.filter((t) => t.id !== editTag.id)}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/** "1 holding" or "3 holdings": what follows this type or tag through a change. */
function usageText(count: number): string {
  return count === 1 ? '1 holding' : `${count} holdings`;
}

/**
 * A mutation's failure in plain language: the field's own message for a taken name, a short
 * sentence for the rest. The server's messages are written for models, never for the screen.
 */
function explain(
  error: unknown,
  setNameError: (message: string | undefined) => void,
  setProblem: (message: string | undefined) => void,
): void {
  if (isApiError(error, 'VALIDATION_FAILED') && typeof error.fields.name === 'string') {
    setNameError('Another tag already has this name.');
    return;
  }
  setProblem(
    isApiError(error, 'VALIDATION_FAILED')
      ? 'Check what you entered, then try again.'
      : isApiError(error, 'NOT_FOUND')
        ? 'That one isn’t here any more.'
        : failureSentence(error),
  );
}

function AddTypeSheet({
  chain,
  onClose,
}: {
  chain: readonly VersionedPack[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [universal, setUniversal] = useState<Universal>('cash');
  const [problem, setProblem] = useState<string>();

  const create = useMutation({
    mutationFn: (input: TypeInput) => api.post<Written<UserType>>('/types', input),
    onSuccess: () => {
      toast.show({ message: 'Saved.' });
      onClose();
    },
    onError: (error: unknown) => explain(error, setNameError, setProblem),
  });

  const save = () => {
    if (create.isPending) return;
    setProblem(undefined);
    if (name.trim() === '') {
      setNameError('Give it a name.');
      return;
    }
    create.mutate({ name: name.trim(), universal });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="New type"
      action={{ label: 'Save', unavailable: create.isPending, onAction: save }}
    >
      <div className={styles.sheetForm}>
        <TextField
          label="Name"
          value={name}
          autoComplete="off"
          maxLength={120}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
        />
        <Picker
          label="It means"
          hint="What this type of holding is, for the totals."
          value={universal}
          onChange={(value) => setUniversal(value as Universal)}
          options={UNIVERSALS.map((u) => ({
            value: u,
            label: chainValue(chain, 'labels', u) ?? u,
          }))}
        />
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </Sheet>
  );
}

function EditTypeSheet({
  chain,
  type,
  usage,
  others,
  onClose,
}: {
  chain: readonly VersionedPack[];
  type: UserType;
  usage: number;
  others: readonly UserType[];
  onClose: () => void;
}) {
  const toast = useToast();
  const label = typeLabel(chain, type);
  const [name, setName] = useState(label);
  const [nameError, setNameError] = useState<string>();
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const [problem, setProblem] = useState<string>();

  const rename = useMutation({
    mutationFn: (input: TypeInput) => api.patch<Written<UserType>>(`/types/${type.id}`, input),
    onSuccess: () => {
      toast.show({ message: 'Saved.' });
      onClose();
    },
    onError: (error: unknown) => explain(error, setNameError, setProblem),
  });
  const remove = useMutation({
    mutationFn: (target: string) =>
      api.del<Written<void>>(
        target === '' ? `/types/${type.id}` : `/types/${type.id}?moveTo=${target}`,
      ),
    onSuccess: () => {
      toast.show({ message: 'Deleted.' });
      onClose();
    },
    onError: (error: unknown) => explain(error, setNameError, setProblem),
  });

  const save = () => {
    if (rename.isPending) return;
    setProblem(undefined);
    if (name.trim() === '') {
      setNameError('Give it a name.');
      return;
    }
    // Unchanged, so the label keeps following the pack: saving would freeze it as a custom name.
    if (name.trim() === label) {
      onClose();
      return;
    }
    rename.mutate({ name: name.trim() });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={label}
      action={{ label: 'Save', unavailable: rename.isPending, onAction: save }}
    >
      <div className={styles.sheetForm}>
        <TextField
          label="Name"
          value={name}
          autoComplete="off"
          maxLength={120}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
        />
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <div className={styles.danger}>
          <h3 className={styles.dangerTitle}>Delete this type</h3>
          {usage === 0 ? (
            <p className={styles.dangerText}>No holdings use it.</p>
          ) : others.length === 0 ? (
            <p className={styles.dangerText}>
              {usageText(usage)} {usage === 1 ? 'uses' : 'use'} it. Add another type first, so{' '}
              {usage === 1 ? 'it has' : 'they have'} somewhere to move to.
            </p>
          ) : (
            <>
              <p className={styles.dangerText}>
                {usageText(usage)} {usage === 1 ? 'uses' : 'use'} it — nothing is orphaned.
              </p>
              <Picker
                label="Move its holdings to"
                value={moveTo}
                onChange={setMoveTo}
                options={others.map((o) => ({ value: o.id, label: typeLabel(chain, o) }))}
              />
            </>
          )}
          {(usage === 0 || others.length > 0) && (
            <Button
              variant="outlined"
              aria-disabled={remove.isPending ? true : undefined}
              onClick={() => {
                if (!remove.isPending) remove.mutate(usage === 0 ? '' : moveTo);
              }}
            >
              {usage === 0 ? 'Delete type' : 'Move and delete'}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function AddTagSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [problem, setProblem] = useState<string>();

  const create = useMutation({
    mutationFn: (input: TagInput) => api.post<Written<Tag>>('/tags', input),
    onSuccess: () => {
      toast.show({ message: 'Saved.' });
      onClose();
    },
    onError: (error: unknown) => explain(error, setNameError, setProblem),
  });

  const save = () => {
    if (create.isPending) return;
    setProblem(undefined);
    if (name.trim() === '') {
      setNameError('Give it a name.');
      return;
    }
    create.mutate({ name: name.trim() });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="New tag"
      action={{ label: 'Save', unavailable: create.isPending, onAction: save }}
    >
      <div className={styles.sheetForm}>
        <TextField
          label="Name"
          value={name}
          autoComplete="off"
          maxLength={120}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
        />
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </Sheet>
  );
}

function EditTagSheet({
  tag,
  usage,
  others,
  onClose,
}: {
  tag: Tag;
  usage: number;
  others: readonly Tag[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(tag.name);
  const [nameError, setNameError] = useState<string>();
  const [mergeInto, setMergeInto] = useState('');
  const [problem, setProblem] = useState<string>();

  const rename = useMutation({
    mutationFn: (input: TagInput) => api.patch<Written<Tag>>(`/tags/${tag.id}`, input),
    onSuccess: () => {
      toast.show({ message: 'Saved.' });
      onClose();
    },
    onError: (error: unknown) => explain(error, setNameError, setProblem),
  });
  const remove = useMutation({
    mutationFn: (target: string) =>
      api.del<Written<void>>(
        target === '' ? `/tags/${tag.id}` : `/tags/${tag.id}?mergeInto=${target}`,
      ),
    onSuccess: () => {
      toast.show({ message: 'Deleted.' });
      onClose();
    },
    onError: (error: unknown) => explain(error, setNameError, setProblem),
  });

  const save = () => {
    if (rename.isPending) return;
    setProblem(undefined);
    if (name.trim() === '') {
      setNameError('Give it a name.');
      return;
    }
    if (name.trim() === tag.name) {
      onClose();
      return;
    }
    rename.mutate({ name: name.trim() });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={tag.name}
      action={{ label: 'Save', unavailable: rename.isPending, onAction: save }}
    >
      <div className={styles.sheetForm}>
        <TextField
          label="Name"
          value={name}
          autoComplete="off"
          maxLength={120}
          error={nameError}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
        />
        {problem ? <FormProblem>{problem}</FormProblem> : null}
        <div className={styles.danger}>
          <h3 className={styles.dangerTitle}>Delete this tag</h3>
          <p className={styles.dangerText}>
            {usage === 0
              ? 'No holdings carry it.'
              : `${usageText(usage)} ${usage === 1 ? 'carries' : 'carry'} it — ${usage === 1 ? 'it loses' : 'they lose'} the label, or carry another tag instead.`}
          </p>
          {usage > 0 && others.length > 0 ? (
            <Picker
              label="Carry this tag instead"
              value={mergeInto}
              onChange={setMergeInto}
              options={[
                { value: '', label: 'Just remove it' },
                ...others.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          ) : null}
          <Button
            variant="outlined"
            aria-disabled={remove.isPending ? true : undefined}
            onClick={() => {
              if (!remove.isPending) remove.mutate(usage === 0 ? '' : mergeInto);
            }}
          >
            {usage === 0 || mergeInto === '' ? 'Delete tag' : 'Merge and delete'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
