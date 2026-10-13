import type { Holding, HoldingPatch, Snapshot, Universal, VersionedPack } from '@netnet/contracts';
import { chainValue, typeLabel } from '@netnet/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '../../api/account';
import { api, isApiError, type Written } from '../../api/client';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import {
  AccessBlock,
  AskAgentDialog,
  Button,
  Card,
  ErrorState,
  FormProblem,
  Picker,
  TextField,
  buttonClass,
  usePackChain,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { TagsField, sideOf } from './Add';
import styles from './Add.module.css';

/**
 * Edit (PRD J2, J4): the Add form in the prototype's edit mode — name, type, the access block
 * and Tags, with no currency, value or date. Saving patches the holding and returns to its page;
 * the Ledger audits the edit like any other holding change. The kind never changes here, as in
 * the prototype.
 */

export function Edit() {
  const { id } = useParams();
  const me = useMe().data;
  const snapshot = useSnapshot<Snapshot>();
  if (!me || snapshot.isPending) return <Waiting />;
  if (snapshot.isError || snapshot.data === undefined) {
    return <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }
  const holding = snapshot.data.holdings.find((h) => h.id === id);
  if (!holding) {
    return (
      <ErrorState
        title="This holding isn’t here any more."
        detail="It may have been deleted. Go back and pick it again."
        action={
          <Link to="/" className={buttonClass('primary')}>
            Home
          </Link>
        }
      />
    );
  }
  return <EditLoaded snapshot={snapshot.data} holding={holding} />;
}

function EditLoaded({ snapshot, holding }: { snapshot: Snapshot; holding: Holding }) {
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
  return <EditForm snapshot={snapshot} chain={chain.packs} holding={holding} />;
}

function EditForm({
  snapshot,
  chain,
  holding,
}: {
  snapshot: Snapshot;
  chain: readonly VersionedPack[];
  holding: Holding;
}) {
  const navigate = useNavigate();
  const kind = holding.kind;
  const options = useMemo(
    () =>
      snapshot.types
        .filter((t) => sideOf(t.universal) === kind)
        .map((t) => ({ id: t.id, universal: t.universal, label: typeLabel(chain, t) })),
    [snapshot.types, kind, chain],
  );
  const [typeId, setTypeId] = useState(holding.typeId);
  const current = options.find((o) => o.id === typeId) ?? options[0];
  const universal: Universal = current?.universal ?? 'other';

  const [name, setName] = useState(holding.name);
  const [nameError, setNameError] = useState<string>();
  const [tagIds, setTagIds] = useState<readonly string[]>(() => [...holding.tagIds].sort());
  const basis = holding.accessBasis;
  const [answer, setAnswer] = useState<string | undefined>(() => basis?.answer ?? undefined);
  const [changing, setChanging] = useState(() => basis !== null && basis.via !== 'default');
  const [problem, setProblem] = useState<string>();
  const [asking, setAsking] = useState(false);

  const update = useMutation({
    mutationFn: (patch: HoldingPatch) =>
      api.patch<Written<Holding>>(`/holdings/${holding.id}`, patch),
    onSuccess: () => void navigate(`/holdings/${holding.id}`),
    onError: (error: unknown) => {
      setProblem(
        isApiError(error, 'VALIDATION_FAILED')
          ? 'Check what you entered, then try again.'
          : failureSentence(error),
      );
    },
  });

  const pickType = (id: string) => {
    setTypeId(id);
    setAnswer(undefined);
    setChanging(false);
  };

  const save = () => {
    if (update.isPending) return;
    setProblem(undefined);
    if (!current) {
      setProblem('There is no type for this yet.');
      return;
    }
    if (name.trim() === '') {
      setNameError('Give it a name.');
      return;
    }
    update.mutate({
      name: name.trim(),
      typeId: current.id,
      tagIds: [...tagIds],
      ...(kind === 'asset' ? { access: answer ?? null } : {}),
    });
  };

  const title = kind === 'asset' ? 'Edit Asset' : 'Edit Liability';
  const example = current ? chainValue(chain, 'examples', current.universal) : undefined;

  return (
    <>
      <div className={styles.topbar}>
        <Link to={`/holdings/${holding.id}`} className={styles.iconButton} aria-label="Close">
          <span aria-hidden="true">×</span>
        </Link>
        <h1 className={styles.title}>{title}</h1>
        <Button
          variant="quiet"
          className={styles.save}
          aria-disabled={update.isPending ? true : undefined}
          onClick={save}
        >
          Save
        </Button>
      </div>
      <Card>
        <div className={styles.form}>
          <TextField
            label={kind === 'asset' ? 'Asset Name' : 'Liability Name'}
            value={name}
            placeholder={example}
            autoComplete="off"
            maxLength={120}
            error={nameError}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
            }}
          />
          <Picker
            label="Type"
            value={current?.id ?? ''}
            onChange={pickType}
            options={options.map((o) => ({ value: o.id, label: o.label }))}
          />
          {kind === 'asset' ? (
            <AccessBlock
              chain={chain}
              universal={universal}
              answer={answer}
              onAnswer={setAnswer}
              changing={changing}
              onChanging={setChanging}
              usable={null}
              onAskAgent={() => setAsking(true)}
            />
          ) : null}
          <TagsField
            tags={snapshot.tags}
            selected={tagIds}
            onToggle={(id) =>
              setTagIds(
                tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id].sort(),
              )
            }
          />
          {problem ? <FormProblem>{problem}</FormProblem> : null}
          <p className={styles.privacy}>
            Never enter passwords or account numbers. NetNet doesn’t need them.
          </p>
        </div>
      </Card>
      <AskAgentDialog
        open={asking}
        onClose={() => setAsking(false)}
        holdingName={name.trim() || holding.name}
        saved
        connectEntry="holding"
        connectHoldingId={holding.id}
      />
    </>
  );
}
