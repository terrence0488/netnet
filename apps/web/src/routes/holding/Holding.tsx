import type {
  Holding as HoldingRow,
  HoldingPatch,
  NewValue,
  Snapshot,
  Tag,
  Universal,
  Value,
  ValuePatch,
  VersionedPack,
} from '@netnet/contracts';
import { CURRENCY_CODES } from '@netnet/contracts';
import { fromMinor, staleness, typeLabel } from '@netnet/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '../../api/account';
import { api, isApiError, type Written } from '../../api/client';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import { TrendChart } from '../../charts';
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
  ageOf,
  buttonClass,
  formatDate,
  formatMoney,
  parseAmount,
  todayIn,
  usePackChain,
  useToast,
  type AmountCheck,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { cx } from '../../components/cx';
import { homeData } from '../home/home-data';
import {
  BASELINE_LABELS,
  HOLDING_BASELINE_DEFAULT,
  formatPct,
  holdingChange,
  holdingTrend,
  stalenessText,
} from './holding-data';
import { holdingValuesQuery, useHoldingValues, valueFooter } from './values';
import styles from './Holding.module.css';

/**
 * The holding page (PRD J2, J3, J4): the latest value with its consequence, its trend and its
 * change over the selected baseline, the dated history newest first, and ways to correct a value,
 * retag, archive and delete. Its figures come from core over the snapshot; the history's full
 * values come paged from the API.
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
  const [editingValue, setEditingValue] = useState<Value | null>(null);
  const [editingAccess, setEditingAccess] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [asking, setAsking] = useState(false);

  const latest = useMemo(
    () => homeData(snapshot, today).latest.get(holding.id),
    [snapshot, today, holding.id],
  );
  const data = useMemo(() => {
    const universal = snapshot.types.find((t) => t.id === holding.typeId)?.universal ?? 'other';
    return {
      universal,
      trend: holdingTrend(snapshot, holding, universal, today),
      change: holdingChange(snapshot, holding, universal, today),
    };
  }, [snapshot, holding, today]);

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
  const fresh =
    latest === undefined
      ? null
      : staleness(
          { cadenceDays: holding.cadenceDays, universal: data.universal },
          latest,
          today,
          packs,
        );
  const tags = snapshot.tags.filter((tag) => holding.tagIds.includes(tag.id));
  const baseline = snapshot.prefs.baseline ?? HOLDING_BASELINE_DEFAULT;

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
        staleness={
          fresh === null || latest === undefined
            ? null
            : stalenessText(fresh.stale, ageOf(latest.date, today))
        }
        onDecide={() => setEditingAccess(true)}
        onAsk={() => setAsking(true)}
      />
      {snapshot.tags.length > 0 ? (
        <section aria-label="Tags" className={styles.tags}>
          <div className={styles.tagList}>
            {tags.map((tag) => (
              <span key={tag.id} className={styles.tag}>
                {tag.name}
              </span>
            ))}
            {tags.length === 0 ? <span className={styles.noTags}>No tags</span> : null}
          </div>
          <button type="button" className={styles.tagEdit} onClick={() => setTagging(true)}>
            Edit tags
          </button>
        </section>
      ) : null}
      <section aria-labelledby="trend-heading">
        <div className={styles.sectionHead}>
          <h2 id="trend-heading">Trend</h2>
          {data.change.amount !== null && data.change.amount !== 0 ? (
            <p className={styles.change}>
              <span className={styles.changeBase}>{BASELINE_LABELS[baseline]}</span>{' '}
              <Figure size="change" minor={data.change.amount} currency={snapshot.baseCurrency} />{' '}
              {data.change.pct !== null ? (
                <span className={styles.changePct}>({formatPct(data.change.pct)})</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <TrendChart
          points={data.trend}
          currency={snapshot.baseCurrency}
          height={160}
          label={`${holding.name} trend`}
          reason="The trend appears with two or more values."
        />
      </section>
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
              onEdit={() => setEditingValue(value)}
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
      <ManageSection holding={holding} total={total} />
      <div className={styles.end} aria-hidden="true" />
      <UpdateFab onUpdate={() => setAdding(true)} />
      <ValueSheet
        open={adding}
        onClose={() => setAdding(false)}
        holding={holding}
        baseCurrency={snapshot.baseCurrency}
        today={today}
      />
      {editingValue !== null ? (
        <ValueSheet
          key={editingValue.id}
          open
          onClose={() => setEditingValue(null)}
          holding={holding}
          baseCurrency={snapshot.baseCurrency}
          today={today}
          editing={editingValue}
        />
      ) : null}
      {tagging ? (
        <TagsSheet holding={holding} tags={snapshot.tags} onClose={() => setTagging(false)} />
      ) : null}
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
        connectEntry="holding"
        connectHoldingId={holding.id}
      />
    </>
  );
}

function Hero({
  holding,
  label,
  baseCurrency,
  latestMinor,
  staleness,
  onDecide,
  onAsk,
}: {
  holding: HoldingRow;
  label: string;
  baseCurrency: string;
  /** The latest value in base minor units, signed for a liability, or null without one. */
  latestMinor: number | null;
  /** How fresh the latest value is (PRD J9), or null without one. */
  staleness: string | null;
  onDecide: () => void;
  onAsk: () => void;
}) {
  const foreign = holding.currency !== baseCurrency;
  const meta = [
    holding.archived ? 'Archived' : null,
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
      {staleness !== null ? <p className={styles.heroStale}>{staleness}</p> : null}
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
  onEdit,
}: {
  value: Value;
  kind: HoldingRow['kind'];
  baseCurrency: string;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const byAgent = value.source === 'agent';
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
      {open ? <ValueDetail value={value} baseCurrency={baseCurrency} onEdit={onEdit} /> : null}
    </>
  );
}

/**
 * An opened value: only what the row omits — the original currency, who wrote it — with Edit and
 * Delete. Deleting asks first, in place. Closing the row unmounts this, so the question never
 * lingers.
 */
function ValueDetail({
  value,
  baseCurrency,
  onEdit,
}: {
  value: Value;
  baseCurrency: string;
  onEdit: () => void;
}) {
  const toast = useToast();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string>();
  const original = value.currency !== baseCurrency;

  const remove = useMutation({
    mutationFn: () => api.del<Written<void>>(`/values/${value.id}`),
    onSuccess: () => {
      toast.show({ message: 'Deleted.' });
      void client.invalidateQueries({ queryKey: holdingValuesQuery(value.holdingId).queryKey });
    },
    onError: (error: unknown) => {
      setProblem(failureSentence(error));
    },
  });

  return (
    <div className={styles.open}>
      {original ? (
        <div className={styles.kv}>
          <span>In {value.currency}</span>
          <b>{formatMoney(value.amountMinor, value.currency)}</b>
        </div>
      ) : null}
      <p className={styles.footer}>{valueFooter(value)}</p>
      {confirming ? (
        <div className={styles.confirm}>
          <p className={styles.confirmText}>Delete this value?</p>
          <div className={styles.confirmActs}>
            <Button
              variant="outlined"
              aria-disabled={remove.isPending ? true : undefined}
              onClick={() => {
                if (!remove.isPending) remove.mutate();
              }}
            >
              Delete value
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.rowActs}>
          <button type="button" className={styles.rowLink} onClick={onEdit}>
            Edit
          </button>
          <button type="button" className={styles.rowLink} onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
      {problem ? <FormProblem>{problem}</FormProblem> : null}
    </div>
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

/**
 * Add Value, and Edit Value: the same form, since a correction changes the same three things
 * (amount, date, currency). The edit sheet mounts per value, so its fields start from that value.
 */
function ValueSheet({
  open,
  onClose,
  holding,
  baseCurrency,
  today,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  holding: HoldingRow;
  baseCurrency: string;
  today: string;
  editing?: Value;
}) {
  const toast = useToast();
  const client = useQueryClient();
  const [currency, setCurrency] = useState(editing?.currency ?? holding.currency);
  const [typed, setTyped] = useState(() =>
    editing ? fromMinor(editing.amountMinor, editing.currency) : '',
  );
  const [check, setCheck] = useState<AmountCheck>(() =>
    editing
      ? parseAmount(fromMinor(editing.amountMinor, editing.currency), editing.currency)
      : { ok: false, problem: 'empty' },
  );
  const [date, setDate] = useState(editing?.date ?? today);
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<string>();

  const write = useMutation({
    mutationFn: (item: Omit<NewValue, 'holdingId'>) =>
      editing === undefined
        ? api.post<Written<Value>>(`/holdings/${holding.id}/values`, item)
        : api.patch<Written<Value>>(`/values/${editing.id}`, item as ValuePatch),
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
    if (write.isPending) return;
    setSubmitted(true);
    setProblem(undefined);
    if (!check.ok) return;
    write.mutate({ amount: check.amount, date: date || today, currency });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing === undefined ? 'Add Value' : 'Edit Value'}
      action={{ label: 'Save', onAction: save, unavailable: write.isPending }}
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

/**
 * The holding's tags as toggle chips, like the Add form's: pressed chips fill tomato. Saving
 * writes the whole set (`tagIds`).
 */
function TagsSheet({
  holding,
  tags,
  onClose,
}: {
  holding: HoldingRow;
  tags: readonly Tag[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<readonly string[]>(() => [...holding.tagIds].sort());
  const [problem, setProblem] = useState<string>();
  const labelId = useId();

  const save = useMutation({
    mutationFn: (tagIds: readonly string[]) =>
      api.patch<Written<HoldingRow>>(`/holdings/${holding.id}`, { tagIds: [...tagIds] }),
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
      title="Tags"
      action={{
        label: 'Save',
        unavailable: save.isPending,
        onAction: () => {
          if (!save.isPending) save.mutate(selected);
        },
      }}
    >
      <div className={styles.sheetForm}>
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
                onClick={() =>
                  setSelected(
                    selected.includes(tag.id)
                      ? selected.filter((t) => t !== tag.id)
                      : [...selected, tag.id].sort(),
                  )
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
        {problem ? <FormProblem>{problem}</FormProblem> : null}
      </div>
    </Sheet>
  );
}

/**
 * About this holding: archive and unarchive, and delete with a confirm step. Deleting leaves the
 * page for Home; the totals follow the write's data version, as on every screen.
 */
function ManageSection({ holding, total }: { holding: HoldingRow; total: number }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string>();

  const archive = useMutation({
    mutationFn: (patch: HoldingPatch) =>
      api.patch<Written<HoldingRow>>(`/holdings/${holding.id}`, patch),
    onSuccess: () => {
      toast.show({ message: holding.archived ? 'Unarchived.' : 'Archived.' });
    },
    onError: (error: unknown) => {
      setProblem(failureSentence(error));
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del<Written<void>>(`/holdings/${holding.id}`),
    onSuccess: () => {
      toast.show({ message: 'Deleted.' });
      void navigate('/');
    },
    onError: (error: unknown) => {
      setProblem(failureSentence(error));
    },
  });

  return (
    <section aria-labelledby="manage-heading">
      <div className={styles.sectionHead}>
        <h2 id="manage-heading">About this holding</h2>
      </div>
      <Card>
        <div className={styles.manage}>
          <div className={styles.manageRow}>
            <p className={styles.manageText}>
              {holding.archived
                ? 'Archived: it leaves the totals and charts but keeps its history.'
                : 'Archive it to leave the totals and charts; its history stays.'}
            </p>
            <Button
              variant="outlined"
              aria-disabled={archive.isPending ? true : undefined}
              onClick={() => {
                if (!archive.isPending) archive.mutate({ archived: !holding.archived });
              }}
            >
              {holding.archived ? 'Unarchive holding' : 'Archive holding'}
            </Button>
          </div>
          <div className={styles.danger}>
            <h3 className={styles.dangerTitle}>Delete this holding</h3>
            {confirming ? (
              <>
                <p className={styles.dangerText}>
                  {total === 0
                    ? `“${holding.name}” has no values yet. Delete it?`
                    : total === 1
                      ? `“${holding.name}” and its one value go. Delete them?`
                      : `“${holding.name}” and its ${total} values go. Delete them?`}
                </p>
                <div className={styles.confirmActs}>
                  <Button
                    variant="outlined"
                    aria-disabled={remove.isPending ? true : undefined}
                    onClick={() => {
                      if (!remove.isPending) remove.mutate();
                    }}
                  >
                    Delete holding
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirming(false)}>
                    Keep
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.dangerText}>
                  {total === 0
                    ? 'It has no values yet.'
                    : total === 1
                      ? 'Its one value goes with it.'
                      : `Its ${total} values go with it.`}
                </p>
                <Button variant="outlined" onClick={() => setConfirming(true)}>
                  Delete holding
                </Button>
              </>
            )}
          </div>
          {problem ? <FormProblem>{problem}</FormProblem> : null}
        </div>
      </Card>
    </section>
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
