import type {
  Candidate,
  CreateHolding,
  Holding,
  HoldingKind,
  Snapshot,
  Tag,
  Universal,
  VersionedPack,
} from '@netnet/contracts';
import { CURRENCY_CODES } from '@netnet/contracts';
import { chainValue, resolveAccess, toMinor, typeLabel } from '@netnet/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
  MoneyField,
  Picker,
  TextField,
  todayIn,
  usePackChain,
  type AmountCheck,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { homeData } from '../home/home-data';
import styles from './Add.module.css';

/**
 * Add (PRD J2): an asset or a liability with a value in any currency. Accessibility is settled by
 * a fact, a default or "Not sure", and never blocks saving. The consequence previews in money as
 * the amount is typed. The person's tags are offered for either kind.
 */

/** The universals offered as liabilities; every other universal is an asset. */
const LIABILITY_UNIVERSALS: ReadonlySet<Universal> = new Set(['mortgage', 'loan', 'card']);

/** Which side of the ledger a universal type sits on: debts are liabilities, all else assets. */
export const sideOf = (universal: Universal): HoldingKind =>
  LIABILITY_UNIVERSALS.has(universal) ? 'liability' : 'asset';

export function Add() {
  const me = useMe().data;
  const snapshot = useSnapshot<Snapshot>();
  if (!me || snapshot.isPending) return <Waiting />;
  if (snapshot.isError || snapshot.data === undefined) {
    return <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }
  return <AddLoaded snapshot={snapshot.data} timeZone={me.timeZone} />;
}

function AddLoaded({ snapshot, timeZone }: { snapshot: Snapshot; timeZone: string }) {
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
  return <AddForm snapshot={snapshot} chain={chain.packs} today={todayIn(timeZone)} />;
}

function AddForm({
  snapshot,
  chain,
  today,
}: {
  snapshot: Snapshot;
  chain: readonly VersionedPack[];
  today: string;
}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<HoldingKind>('asset');
  const options = useMemo(
    () =>
      snapshot.types
        .filter((t) => sideOf(t.universal) === kind)
        .map((t) => ({ id: t.id, universal: t.universal, label: typeLabel(chain, t) })),
    [snapshot.types, kind, chain],
  );
  const [typeId, setTypeId] = useState<string>(() => options[0]?.id ?? '');
  const current = options.find((o) => o.id === typeId) ?? options[0];
  const universal: Universal = current?.universal ?? 'other';

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [currency, setCurrency] = useState(snapshot.baseCurrency);
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<AmountCheck>({ ok: false, problem: 'empty' });
  const [date, setDate] = useState(today);
  const [tagIds, setTagIds] = useState<readonly string[]>([]);
  const [answer, setAnswer] = useState<string>();
  const [changing, setChanging] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [duplicate, setDuplicate] = useState<readonly Candidate[] | null>(null);
  const [asking, setAsking] = useState(false);

  const couldUse = useMemo(() => homeData(snapshot, today).position.couldUse, [snapshot, today]);
  const usable = useMemo(() => {
    if (currency !== snapshot.baseCurrency) {
      // A foreign amount converts on the server, at the rate on its date; the web has no rates, so
      // the preview leaves the amount out rather than converting it a second way.
      return null;
    }
    if (!check.ok) {
      const access = kind === 'asset' ? resolveAccess(chain, universal, answer).access : null;
      return access === 'accessible' ? { minor: couldUse, currency: snapshot.baseCurrency } : null;
    }
    const minor = toMinor(check.amount, currency);
    const own = typeof minor === 'number' ? minor : 0;
    const access = resolveAccess(chain, universal, answer).access;
    return {
      minor: couldUse + (access === 'accessible' ? own : 0),
      currency: snapshot.baseCurrency,
    };
  }, [currency, snapshot.baseCurrency, check, kind, chain, universal, answer, couldUse]);

  const create = useMutation({
    mutationFn: (input: CreateHolding) => api.post<Written<Holding>>('/holdings', input),
    onSuccess: () => void navigate('/'),
    onError: (error: unknown) => {
      const candidates = duplicateCandidates(error);
      if (candidates) {
        setDuplicate(candidates);
        setProblem(undefined);
      } else {
        setProblem(
          isApiError(error, 'VALIDATION_FAILED')
            ? 'Check what you entered, then try again.'
            : failureSentence(error),
        );
      }
    },
  });

  const pickKind = (next: HoldingKind) => {
    if (next === kind) return;
    const first = snapshot.types.find((t) => sideOf(t.universal) === next);
    setKind(next);
    setTypeId(first?.id ?? '');
    setAnswer(undefined);
    setChanging(false);
  };

  const pickType = (id: string) => {
    setTypeId(id);
    setAnswer(undefined);
    setChanging(false);
  };

  const input = (allowDuplicate: boolean): CreateHolding => ({
    name: name.trim(),
    kind,
    ...(current ? { typeId: current.id } : { universal }),
    currency,
    ...(kind === 'asset' && answer !== undefined ? { access: answer } : {}),
    ...(tagIds.length > 0 ? { tagIds: [...tagIds] } : {}),
    ...(check.ok ? { opening: { amount: check.amount, date: date || today } } : {}),
    via: 'form',
    ...(allowDuplicate ? { allowDuplicate: true } : {}),
  });

  const save = (allowDuplicate: boolean) => {
    if (create.isPending) return;
    setSubmitted(true);
    setProblem(undefined);
    if (!current) {
      setProblem('There is no type for this yet.');
      return;
    }
    if (name.trim() === '') {
      setNameError('Give it a name.');
      return;
    }
    if (!check.ok) return;
    setDuplicate(allowDuplicate ? duplicate : null);
    create.mutate(input(allowDuplicate));
  };

  const title = kind === 'asset' ? 'New Asset' : 'New Liability';
  const example = current ? chainValue(chain, 'examples', current.universal) : undefined;

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/" className={styles.iconButton} aria-label="Close">
          <span aria-hidden="true">×</span>
        </Link>
        <h1 className={styles.title}>{title}</h1>
        <Button
          variant="quiet"
          className={styles.save}
          aria-disabled={create.isPending ? true : undefined}
          onClick={() => save(false)}
        >
          Save
        </Button>
      </div>
      <Card>
        <div className={styles.form}>
          <div className={styles.seg} role="group" aria-label="Kind">
            {(['asset', 'liability'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={k === kind ? styles.on : undefined}
                aria-pressed={k === kind}
                onClick={() => pickKind(k)}
              >
                {k === 'asset' ? 'Asset' : 'Liability'}
              </button>
            ))}
          </div>
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
              usable={usable}
              onAskAgent={() => setAsking(true)}
            />
          ) : null}
          <div className={styles.two}>
            <Picker
              label="Currency"
              value={currency}
              onChange={setCurrency}
              options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
            />
            <MoneyField
              label={kind === 'asset' ? 'Asset Value' : 'Liability Value'}
              currency={currency}
              value={typed}
              error={
                submitted && !check.ok && check.problem === 'empty' ? 'Enter a value.' : undefined
              }
              onChange={(value, amount) => {
                setTyped(value);
                setCheck(amount);
              }}
            />
          </div>
          <TextField
            label="As of"
            type="date"
            value={date}
            max={today}
            onChange={(event) => setDate(event.target.value)}
          />
          {snapshot.tags.length > 0 ? (
            <TagsField
              tags={snapshot.tags}
              selected={tagIds}
              onToggle={(id) =>
                setTagIds(
                  tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id].sort(),
                )
              }
            />
          ) : null}
          {duplicate ? (
            <DuplicateNotice
              candidates={duplicate}
              onKeep={() => save(true)}
              onEdit={() => setDuplicate(null)}
            />
          ) : null}
          {problem ? <FormProblem>{problem}</FormProblem> : null}
          <p className={styles.privacy}>
            Never enter passwords or account numbers. NetNet doesn’t need them.
          </p>
        </div>
      </Card>
      <AskAgentDialog
        open={asking}
        onClose={() => setAsking(false)}
        holdingName={name.trim() || null}
        saved={false}
      />
    </>
  );
}

/**
 * The person's tags as toggle chips, like the Choice row's answers: pressed chips fill tomato.
 * Optional, and only shown while the person has tags.
 */
function TagsField({
  tags,
  selected,
  onToggle,
}: {
  readonly tags: readonly Tag[];
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className={styles.tagsLabel}>
        Tags
      </p>
      <div role="group" aria-labelledby={labelId} className={styles.chips}>
        {tags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className={styles.chip}
            aria-pressed={selected.includes(tag.id)}
            onClick={() => onToggle(tag.id)}
          >
            {tag.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The 409's candidates, when the failure is one; anything else is not a duplicate. */
function duplicateCandidates(error: unknown): readonly Candidate[] | null {
  if (!isApiError(error, 'LIKELY_DUPLICATE')) return null;
  const { candidates } = error.details;
  if (!Array.isArray(candidates)) return null;
  const cleaned = candidates.filter(
    (c): c is Candidate =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as Candidate).id === 'string' &&
      typeof (c as Candidate).name === 'string',
  );
  return cleaned.length > 0 ? cleaned : null;
}

function DuplicateNotice({
  candidates,
  onKeep,
  onEdit,
}: {
  readonly candidates: readonly Candidate[];
  readonly onKeep: () => void;
  readonly onEdit: () => void;
}) {
  const one = candidates.length === 1;
  return (
    <div className={styles.duplicate}>
      <p className={styles.duplicateText}>
        This looks like {one ? 'a holding' : `${candidates.length} holdings`} you already track:
      </p>
      <ul className={styles.duplicateList}>
        {candidates.map((c) => (
          <li key={c.id}>
            <Link to={`/holdings/${c.id}`}>{c.name}</Link>
          </li>
        ))}
      </ul>
      <p className={styles.duplicateText}>
        Update {one ? 'it' : 'one of them'} instead, or save this as well.
      </p>
      <div className={styles.duplicateActions}>
        <Button variant="outlined" onClick={onKeep}>
          Save anyway
        </Button>
        <Button variant="quiet" onClick={onEdit}>
          Keep editing
        </Button>
      </div>
    </div>
  );
}
