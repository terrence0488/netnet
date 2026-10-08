import type { Holding, PackRef, Page, Snapshot, Value } from '@netnet/contracts';
import { toMinor } from '@netnet/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useUpdateMe } from '../../api/account';
import { api, isApiError, type Written } from '../../api/client';
import { noteDataVersion, useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import {
  AuthForm,
  AuthFrame,
  Button,
  Choice,
  ErrorState,
  FormProblem,
  MoneyField,
  formatMoney,
  parseAmount,
  todayIn,
  usePackChain,
  type AmountCheck,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import styles from './Onboarding.module.css';
import {
  checklistOf,
  firstUnanswered,
  followupsOf,
  holdingInput,
  isAnswered,
  isVisible,
  nextUnanswered,
  omitAnswers,
  previousItem,
  seedAnswers,
  type BasicsAnswers,
  type ChecklistItem,
} from './basics';
import { useOnboarding } from './context';

/**
 * The basics (PRD J1): the pack's checklist one question per screen — "do you have this?", then
 * "roughly how much?" after a yes — each answer saved at once as a guided holding. Tapping No
 * removes what the yes saved, plus anything asked only because of it. Skip saves nothing. "Done
 * for now" finishes with whatever is saved. The agent is not offered again inside.
 */

const EMPTY_PACK_REF: PackRef = [];

const BASICS_PATH = '/onboarding/basics';

interface BasicsData {
  readonly snapshot: Snapshot;
  readonly checklist: readonly ChecklistItem[];
  readonly answers: BasicsAnswers;
  readonly today: string;
  readonly saveAnswers: (answers: BasicsAnswers) => void;
}

type BasicsLoaded =
  | { status: 'pending' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; data: BasicsData };

/**
 * The basics' data: the snapshot, the country's checklist, and the answers — seeded once from
 * what is already saved, so a returning person continues where they left off.
 */
function useBasicsData(): BasicsLoaded {
  const { me, draft, updateDraft } = useOnboarding();
  const client = useQueryClient();
  const snapshot = useSnapshot<Snapshot>();
  const chain = usePackChain(snapshot.data?.packRef ?? EMPTY_PACK_REF);
  const seeded = draft.basics !== undefined;
  useEffect(() => {
    if (seeded || snapshot.data === undefined || chain.status !== 'ready') return;
    updateDraft({ basics: seedAnswers(checklistOf(chain.packs), snapshot.data) });
  }, [seeded, snapshot.data, chain, updateDraft]);
  const saveAnswers = useCallback(
    (basics: BasicsAnswers) => updateDraft({ basics }),
    [updateDraft],
  );
  if (snapshot.isError) {
    return { status: 'error', error: snapshot.error, retry: () => void snapshot.refetch() };
  }
  if (chain.status === 'error') {
    return {
      status: 'error',
      error: chain.error,
      retry: () => void client.refetchQueries({ queryKey: ['content'] }),
    };
  }
  if (snapshot.data === undefined || chain.status !== 'ready' || draft.basics === undefined) {
    return { status: 'pending' };
  }
  return {
    status: 'ready',
    data: {
      snapshot: snapshot.data,
      checklist: checklistOf(chain.packs),
      answers: draft.basics,
      today: todayIn(me.timeZone),
      saveAnswers,
    },
  };
}

function BasicsWaiting({ loaded }: { loaded: Exclude<BasicsLoaded, { status: 'ready' }> }) {
  if (loaded.status === 'error') {
    return (
      <AuthFrame title="The basics" back={{ to: '/onboarding/start' }}>
        <ErrorState error={loaded.error} onRetry={loaded.retry} />
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="The basics">
      <Waiting />
    </AuthFrame>
  );
}

/** Finishing: onboarding done, then Home with whatever was saved. */
function useFinish() {
  const navigate = useNavigate();
  const { mutate, isPending } = useUpdateMe();
  const [problem, setProblem] = useState<string>();
  const finish = useCallback(() => {
    if (isPending) return;
    setProblem(undefined);
    mutate(
      { onboardingState: 'done' },
      {
        onSuccess: () => void navigate('/', { replace: true }),
        onError: (error) => setProblem(failureSentence(error)),
      },
    );
  }, [isPending, mutate, navigate]);
  return { finish, finishing: isPending, problem };
}

/** Nothing left to ask: finish on arrival, with a way to try again. */
function FinishOnboarding() {
  const { finish, problem } = useFinish();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    finish();
  }, [finish]);
  return (
    <AuthFrame title="The basics">
      {problem ? <ErrorState error={new Error(problem)} onRetry={finish} /> : <Waiting />}
    </AuthFrame>
  );
}

/** Moving on after an answer: the next open question, or Home when there is none. */
function useAdvance(data: BasicsData) {
  const navigate = useNavigate();
  const { finish, finishing, problem } = useFinish();
  const advance = useCallback(
    (fromId: string, answers: BasicsAnswers) => {
      const next = nextUnanswered(data.checklist, answers, fromId);
      if (next) void navigate(`${BASICS_PATH}/${next.id}`);
      else finish();
    },
    [data.checklist, navigate, finish],
  );
  return { advance, finish, finishing, problem };
}

/** `/onboarding/basics`: the first question still open, or Home when there is none. */
export function BasicsIndex() {
  const loaded = useBasicsData();
  if (loaded.status !== 'ready') return <BasicsWaiting loaded={loaded} />;
  const first = firstUnanswered(loaded.data.checklist, loaded.data.answers);
  if (!first) return <FinishOnboarding />;
  return <Navigate to={first.id} replace />;
}

/** `/onboarding/basics/:item`: "do you have this?" — yes asks how much, no removes what was saved. */
export function BasicsAsk() {
  const { item: itemId } = useParams();
  const loaded = useBasicsData();
  if (loaded.status !== 'ready') return <BasicsWaiting loaded={loaded} />;
  const { checklist, answers } = loaded.data;
  const item = checklist.find((candidate) => candidate.id === itemId);
  if (!item || !isVisible(checklist, answers, item.id)) {
    return <Navigate to={BASICS_PATH} replace />;
  }
  return <AskScreen item={item} data={loaded.data} />;
}

function AskScreen({ item, data }: { item: ChecklistItem; data: BasicsData }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { advance, finish, finishing, problem: doneProblem } = useAdvance(data);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const questionId = useId();
  const answer = data.answers[item.id];
  const back = previousItem(data.checklist, data.answers, item.id);
  const backTo = back ? `${BASICS_PATH}/${back.id}` : '/onboarding/start';

  const holding =
    answer?.holdingId === undefined
      ? undefined
      : data.snapshot.holdings.find((h) => h.id === answer.holdingId);
  const currency = holding?.currency ?? data.snapshot.baseCurrency;
  const minor = answer?.amount === undefined ? undefined : toMinor(answer.amount, currency);
  const saved = typeof minor === 'number' ? formatMoney(minor, currency) : undefined;

  const sayYes = () => {
    if (busy || finishing) return;
    data.saveAnswers({
      ...data.answers,
      [item.id]: answer?.decision === 'yes' ? answer : { decision: 'yes' },
    });
    void navigate(`${BASICS_PATH}/${item.id}/amount`);
  };

  const sayNo = async () => {
    if (busy || finishing) return;
    setProblem(undefined);
    const removed = [item, ...followupsOf(data.checklist, item.id)];
    const ids = removed
      .map((candidate) => data.answers[candidate.id]?.holdingId)
      .filter((id): id is string => id !== undefined);
    const cleared: BasicsAnswers = {
      ...omitAnswers(
        data.answers,
        removed.map((candidate) => candidate.id),
      ),
      [item.id]: { decision: 'no' },
    };
    if (ids.length === 0) {
      data.saveAnswers(cleared);
      advance(item.id, cleared);
      return;
    }
    setBusy(true);
    try {
      // A yes flipped to no removes what it saved, plus anything asked only because of it. A
      // holding already gone (a retry after a half-done removal) counts as removed.
      for (const id of ids) {
        try {
          const written = await api.del<Written<null>>(`/holdings/${id}`);
          noteDataVersion(client, written.dataVersion);
        } catch (error) {
          if (!isApiError(error, 'NOT_FOUND')) throw error;
        }
      }
    } catch (error) {
      setBusy(false);
      setProblem(failureSentence(error));
      return;
    }
    data.saveAnswers(cleared);
    setBusy(false);
    advance(item.id, cleared);
  };

  const skip = () => {
    if (busy || finishing) return;
    advance(item.id, data.answers);
  };

  const waiting = busy || finishing;
  return (
    <AuthFrame title={item.ask} titleId={questionId} back={{ to: backTo }}>
      {saved ? <p className={styles.saved}>Saved {saved}</p> : null}
      {busy ? (
        <Waiting />
      ) : (
        <Choice
          labelledBy={questionId}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          value={answer?.decision ?? null}
          onChange={(value) => {
            if (value === 'yes') sayYes();
            else void sayNo();
          }}
        />
      )}
      {isAnswered(data.answers, item.id) ? null : (
        <Button variant="outlined" block onClick={skip} aria-disabled={waiting ? true : undefined}>
          Skip
        </Button>
      )}
      {(problem ?? doneProblem) ? <FormProblem>{problem ?? doneProblem}</FormProblem> : null}
      <DoneForNow onDone={finish} waiting={waiting} />
    </AuthFrame>
  );
}

/** `/onboarding/basics/:item/amount`: "roughly how much?" — saving it moves on. */
export function BasicsAmount() {
  const { item: itemId } = useParams();
  const loaded = useBasicsData();
  if (loaded.status !== 'ready') return <BasicsWaiting loaded={loaded} />;
  const { checklist, answers } = loaded.data;
  const item = checklist.find((candidate) => candidate.id === itemId);
  if (!item || !isVisible(checklist, answers, item.id)) {
    return <Navigate to={BASICS_PATH} replace />;
  }
  if (answers[item.id]?.decision !== 'yes') {
    return <Navigate to={`${BASICS_PATH}/${item.id}`} replace />;
  }
  return <AmountScreen item={item} data={loaded.data} />;
}

function AmountScreen({ item, data }: { item: ChecklistItem; data: BasicsData }) {
  const client = useQueryClient();
  const { advance, finish, finishing, problem: doneProblem } = useAdvance(data);
  const answer = data.answers[item.id];
  const holding =
    answer?.holdingId === undefined
      ? undefined
      : data.snapshot.holdings.find((h) => h.id === answer.holdingId);
  const currency = holding?.currency ?? data.snapshot.baseCurrency;
  const [typed, setTyped] = useState(answer?.amount ?? '');
  const [check, setCheck] = useState<AmountCheck>(() =>
    parseAmount(answer?.amount ?? '', currency),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string>();
  if (answer === undefined || answer.decision !== 'yes') {
    return <Navigate to={`${BASICS_PATH}/${item.id}`} replace />;
  }

  const save = async () => {
    if (saving || finishing) return;
    setSubmitted(true);
    setProblem(undefined);
    if (!check.ok) return;
    const holdingId = data.answers[item.id]?.holdingId;
    const amount = check.amount;
    setSaving(true);
    try {
      if (holdingId === undefined) {
        const written = await api.post<Written<Holding>>(
          '/holdings',
          holdingInput(item, {
            types: data.snapshot.types,
            currency,
            amount,
            date: data.today,
          }),
        );
        noteDataVersion(client, written.dataVersion);
        const saved: BasicsAnswers = {
          ...data.answers,
          [item.id]: { decision: 'yes', holdingId: written.result.id, amount },
        };
        data.saveAnswers(saved);
        advance(item.id, saved);
        return;
      }
      // Correcting in place: the same amount changes nothing.
      const before = toMinor(data.answers[item.id]?.amount ?? '', currency);
      const after = toMinor(amount, currency);
      if (typeof before === 'number' && before === after) {
        advance(item.id, data.answers);
        return;
      }
      const values = await api.get<Page<Value>>(`/holdings/${holdingId}/values?limit=1`);
      const current = values.items[0];
      const written = current
        ? await api.patch<Written<Value>>(`/values/${current.id}`, { amount })
        : await api.post<Written<Value>>(`/holdings/${holdingId}/values`, {
            amount,
            date: data.today,
          });
      noteDataVersion(client, written.dataVersion);
      const saved: BasicsAnswers = {
        ...data.answers,
        [item.id]: { decision: 'yes', holdingId, amount },
      };
      data.saveAnswers(saved);
      advance(item.id, saved);
    } catch (error) {
      setProblem(failureSentence(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthFrame title={item.amount} back={{ to: `${BASICS_PATH}/${item.id}` }}>
      <AuthForm onSubmit={() => void save()}>
        <MoneyField
          label={item.name}
          hint={item.hint}
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
        {(problem ?? doneProblem) ? <FormProblem>{problem ?? doneProblem}</FormProblem> : null}
        <Button type="submit" block aria-disabled={saving || finishing ? true : undefined}>
          Continue
        </Button>
      </AuthForm>
      <DoneForNow onDone={finish} waiting={saving || finishing} />
    </AuthFrame>
  );
}

/** "Done for now": one tap away on every basics screen, keeping what was entered. */
function DoneForNow({ onDone, waiting }: { onDone: () => void; waiting: boolean }) {
  return (
    <Button variant="quiet" block onClick={onDone} aria-disabled={waiting ? true : undefined}>
      Done for now
    </Button>
  );
}
