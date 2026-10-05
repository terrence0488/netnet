import type {
  Holding as HoldingRow,
  HoldingPatch,
  NewValue,
  Snapshot,
  Universal,
  Value,
  VersionedPack,
} from '@netnet/contracts';
import { CURRENCY_CODES } from '@netnet/contracts';
import { typeLabel } from '@netnet/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMe } from '../../api/account';
import { api, isApiError, type Written } from '../../api/client';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import {
  AccessBlock,
  AskAgentDialog,
  Button,
  Card,
  ConsequenceLine,
  ErrorState,
  Figure,
  FormProblem,
  MoneyField,
  Picker,
  Sheet,
  Spinner,
  TextField,
  buttonClass,
  formatDate,
  formatMoney,
  todayIn,
  usePackChain,
  useToast,
  type AmountCheck,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { cx } from '../../components/cx';
import { homeData } from '../home/home-data';
import { holdingValuesQuery, useHoldingValues, valueFooter } from './values';
import styles from './Holding.module.css';

/**
 * The holding page (PRD J3, J4): the latest value with its consequence, the dated history newest
 * first, a way to add a value and to change accessibility, and who wrote each value. Its hero
 * figure comes from core over the snapshot; the history's full values come paged from the API.
 */

export function Holding() {
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
  return <HoldingLoaded snapshot={snapshot.data} holding={holding} timeZone={me.timeZone} />;
}

function HoldingLoaded({
  snapshot,
  holding,
  timeZone,
}: {
  snapshot: Snapshot;
  holding: HoldingRow;
  timeZone: string;
}) {
  const client = useQueryClient();
  const chain = usePackChain(snapshot.packRef);
  const today = todayIn(timeZone);
  const values = useHoldingValues(holding.id);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingAccess, setEditingAccess] = useState(false);
  const [asking, setAsking] = useState(false);

  const latest = useMemo(
    () => homeData(snapshot, today).latest.get(holding.id),
    [snapshot, today, holding.id],
  );

  if (chain.status === 'pending') return <Waiting />;
  if (chain.status === 'error') {
    return (
      <ErrorState
        error={chain.error}
        onRetry={() => void client.refetchQueries({ queryKey: ['content'] })}
      />
    );
  }
  const packs = chain.packs;
  const type = snapshot.types.find((t) => t.id === holding.typeId);
  const label = type
    ? typeLabel(packs, type)
    : typeLabel(packs, { universal: 'other', packTypeKey: null, customName: null });

  const items = values.data?.pages.flatMap((page) => page.items) ?? [];
  const total = snapshot.values[holding.id]?.length ?? items.length;
  const universalOf = (row: HoldingRow) =>
    snapshot.types.find((t) => t.id === row.typeId)?.universal ?? 'other';

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/" className={styles.iconButton} aria-label="Close">
          <span aria-hidden="true">×</span>
        </Link>
        <span className={styles.spacer} />
      </div>
      <Hero
        holding={holding}
        label={label}
        baseCurrency={snapshot.baseCurrency}
        latestMinor={
          latest ? (holding.kind === 'liability' ? -latest.baseMinor : latest.baseMinor) : null
        }
        onDecide={() => setEditingAccess(true)}
        onAsk={() => setAsking(true)}
      />
      <div className={styles.sectionHead}>
        <h2 id="history-heading">History · {total}</h2>
      </div>
      {values.isPending ? (
        <Waiting />
      ) : values.isError ? (
        <ErrorState error={values.error} onRetry={() => void values.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <p className={styles.empty}>No values yet.</p>
        </Card>
      ) : (
        <Card flush>
          {items.map((value) => (
            <ValueRow
              key={value.id}
              value={value}
              kind={holding.kind}
              baseCurrency={snapshot.baseCurrency}
              open={expanded === value.id}
              onToggle={() => setExpanded(expanded === value.id ? null : value.id)}
            />
          ))}
        </Card>
      )}
      {values.hasNextPage && !values.isPending && !values.isError ? (
        <div className={styles.more}>
          {values.isFetchingNextPage ? (
            <Spinner />
          ) : (
            <Button variant="outlined" onClick={() => void values.fetchNextPage()}>
              Show older values
            </Button>
          )}
        </div>
      ) : null}
      <div className={styles.end} aria-hidden="true" />
      <UpdateFab onUpdate={() => setAdding(true)} />
      <ValueSheet
        open={adding}
        onClose={() => setAdding(false)}
        holding={holding}
        baseCurrency={snapshot.baseCurrency}
        today={today}
      />
      {editingAccess && holding.kind === 'asset' ? (
        <AccessSheet
          onClose={() => setEditingAccess(false)}
          holding={holding}
          chain={packs}
          universal={universalOf(holding)}
          onAsk={() => {
            setEditingAccess(false);
            setAsking(true);
          }}
        />
      ) : null}
      <AskAgentDialog
        open={asking}
        onClose={() => setAsking(false)}
        holdingName={holding.name}
        saved
      />
    </>
  );
}

function Hero({
  holding,
  label,
  baseCurrency,
  latestMinor,
  onDecide,
  onAsk,
}: {
  holding: HoldingRow;
  label: string;
  baseCurrency: string;
  /** The latest value in base minor units, signed for a liability, or null without one. */
  latestMinor: number | null;
  onDecide: () => void;
  onAsk: () => void;
}) {
  const foreign = holding.currency !== baseCurrency;
  const meta = [
    label,
    holding.kind === 'liability' ? 'Liability' : null,
    foreign ? holding.currency : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  const undecided = holding.kind === 'asset' && (holding.access ?? 'undecided') === 'undecided';
  return (
    <div className={styles.hero}>
      <p className={styles.heroMeta}>{meta}</p>
      <h1 className={styles.heroName}>{holding.name}</h1>
      {latestMinor === null ? (
        <p className={styles.noValue}>No value yet.</p>
      ) : (
        <Figure size="display" minor={latestMinor} currency={baseCurrency} />
      )}
      {holding.kind === 'asset' ? (
        <p className={styles.heroConseq}>
          <ConsequenceLine
            access={holding.access ?? 'undecided'}
            reason={holding.accessReason}
            usable={null}
          />{' '}
          <span className={styles.heroActs}>
            <button type="button" className={styles.heroLink} onClick={onDecide}>
              {undecided ? 'Decide' : 'Change'}
            </button>
            {undecided ? (
              <button type="button" className={styles.heroLink} onClick={onAsk}>
                Ask your agent
              </button>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function ValueRow({
  value,
  kind,
  baseCurrency,
  open,
  onToggle,
}: {
  value: Value;
  kind: HoldingRow['kind'];
  baseCurrency: string;
  open: boolean;
  onToggle: () => void;
}) {
  const byAgent = value.source === 'agent';
  const original = value.currency !== baseCurrency;
  const minor = kind === 'liability' ? -value.baseMinor : value.baseMinor;
  return (
    <>
      <button
        type="button"
        className={cx(styles.row, byAgent && styles.byAgent)}
        data-agent-written={byAgent || undefined}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={styles.grow}>
          <span className={styles.date}>{formatDate(value.date)}</span>
        </span>
        <span className={styles.amt}>
          <Figure minor={minor} currency={baseCurrency} />
        </span>
      </button>
      {open ? (
        <div className={styles.open}>
          {original ? (
            <div className={styles.kv}>
              <span>In {value.currency}</span>
              <b>{formatMoney(value.amountMinor, value.currency)}</b>
            </div>
          ) : null}
          <p className={styles.footer}>{valueFooter(value)}</p>
        </div>
      ) : null}
    </>
  );
}

/**
 * The holding page's Update: a tomato pill floating bottom-right in line with the amounts. At the
 * very bottom of a page that scrolls it sinks behind the tab bar (off the bottom on a computer),
 * so it never sits on the last value, and resurfaces on the way up — or when it takes focus.
 */
function UpdateFab({ onUpdate }: { onUpdate: () => void }) {
  const [sunk, setSunk] = useState(false);
  const compute = () => {
    const el = document.scrollingElement;
    if (!el) return;
    const scrollable = el.scrollHeight - window.innerHeight > 4;
    const atBottom = window.innerHeight + window.scrollY >= el.scrollHeight - 4;
    setSunk(scrollable && atBottom);
  };
  useEffect(() => {
    // After this render's layout, so a longer list re-decides whether the page scrolls.
    const frame = requestAnimationFrame(compute);
    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  });
  return (
    <div className={styles.fabRail}>
      <div className={styles.fabInner}>
        <button type="button" className={cx(styles.fab, sunk && styles.sunk)} onClick={onUpdate}>
          <span aria-hidden="true" className={styles.fabPlus}>
            +
          </span>
          <span>Update</span>
        </button>
      </div>
    </div>
  );
}

function ValueSheet({
  open,
  onClose,
  holding,
  baseCurrency,
  today,
}: {
  open: boolean;
  onClose: () => void;
  holding: HoldingRow;
  baseCurrency: string;
  today: string;
}) {
  const toast = useToast();
  const client = useQueryClient();
  const [currency, setCurrency] = useState(holding.currency);
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<AmountCheck>({ ok: false, problem: 'empty' });
  const [date, setDate] = useState(today);
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<string>();

  const record = useMutation({
    mutationFn: (item: Omit<NewValue, 'holdingId'>) =>
      api.post<Written<Value>>(`/holdings/${holding.id}/values`, item),
    onSuccess: (written) => {
      const replaced = written.warnings.some((w) => w.code === 'SAME_DATE_REPLACED');
      toast.show({
        message: replaced
          ? `Saved. It replaces the value already saved for ${formatDate(date || today)}.`
          : 'Saved.',
      });
      onClose();
      setTyped('');
      setCheck({ ok: false, problem: 'empty' });
      setDate(today);
      setSubmitted(false);
      setProblem(undefined);
      void client.invalidateQueries({ queryKey: holdingValuesQuery(holding.id).queryKey });
    },
    onError: (error: unknown) => {
      setProblem(
        isApiError(error, 'VALIDATION_FAILED')
          ? 'Check what you entered, then try again.'
          : failureSentence(error),
      );
    },
  });

  const save = () => {
    if (record.isPending) return;
    setSubmitted(true);
    setProblem(undefined);
    if (!check.ok) return;
    record.mutate({ amount: check.amount, date: date || today, currency });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add Value"
      action={{ label: 'Save', onAction: save, unavailable: record.isPending }}
    >
      <div className={styles.sheetForm}>
        <div className={styles.two}>
          <MoneyField
            label={holding.kind === 'liability' ? 'Liability Value' : 'Asset Value'}
            currency={currency}
            value={typed}
            error={
              submitted && !check.ok && check.problem === 'empty' ? 'Enter an amount.' : undefined
            }
            onChange={(value, amount) => {
              setTyped(value);
              setCheck(amount);
            }}
          />
          <Picker
            label="Currency"
            value={currency}
            onChange={setCurrency}
            options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
          />
        </div>
        <TextField
          label="As of"
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
        />
        {currency !== baseCurrency ? (
          <p className={styles.hint}>Totalled in {baseCurrency} at the rate on that date.</p>
        ) : null}
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </Sheet>
  );
}

function AccessSheet({
  onClose,
  holding,
  chain,
  universal,
  onAsk,
}: {
  onClose: () => void;
  holding: HoldingRow;
  chain: readonly VersionedPack[];
  universal: Universal;
  onAsk: () => void;
}) {
  const toast = useToast();
  const basis = holding.accessBasis;
  const [answer, setAnswer] = useState<string | undefined>(() => basis?.answer ?? undefined);
  const [changing, setChanging] = useState(() => basis !== null && basis.via !== 'default');
  const [problem, setProblem] = useState<string>();

  const update = useMutation({
    mutationFn: (patch: HoldingPatch) =>
      api.patch<Written<HoldingRow>>(`/holdings/${holding.id}`, patch),
    onSuccess: () => {
      toast.show({ message: 'Saved.' });
      onClose();
    },
    onError: (error: unknown) => {
      setProblem(
        isApiError(error, 'VALIDATION_FAILED')
          ? 'Check what you entered, then try again.'
          : failureSentence(error),
      );
    },
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title={holding.name}
      action={{
        label: 'Save',
        unavailable: update.isPending,
        onAction: () => {
          if (!update.isPending) update.mutate({ access: answer ?? null });
        },
      }}
    >
      <div className={styles.sheetForm}>
        <AccessBlock
          chain={chain}
          universal={universal}
          answer={answer}
          onAnswer={setAnswer}
          changing={changing}
          onChanging={setChanging}
          usable={null}
          onAskAgent={onAsk}
        />
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </Sheet>
  );
}
