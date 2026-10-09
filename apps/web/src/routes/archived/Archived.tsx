import type { Holding as HoldingRow, Snapshot, UserType, VersionedPack } from '@netnet/contracts';
import { typeLabel } from '@netnet/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../../api/account';
import { api, type Written } from '../../api/client';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import {
  Button,
  Card,
  ErrorState,
  FormProblem,
  ageOf,
  todayIn,
  usePackChain,
  useToast,
} from '../../components';
import { failureSentence } from '../../components/auth-copy';
import { homeData, type HomeData } from '../home/home-data';
import styles from './Archived.module.css';

/**
 * Archived: what left every total but kept its history, each row with its type and how old its
 * latest value is, and Unarchive inline. Reached from Home's list foot (and the empty Home when
 * everything is archived); Back returns to Home.
 */

/** A row's second line: the type, and how old its latest value is when it has one. */
export function archivedRowSub(label: string, latestDate: string | null, today: string): string {
  if (latestDate === null) return label;
  return `${label} · ${ageOf(latestDate, today)}`;
}

export function Archived() {
  const me = useMe().data;
  const snapshot = useSnapshot<Snapshot>();
  if (!me || snapshot.isPending) return <Waiting />;
  if (snapshot.isError || snapshot.data === undefined) {
    return <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }
  return <ArchivedLoaded snapshot={snapshot.data} timeZone={me.timeZone} />;
}

function ArchivedLoaded({ snapshot, timeZone }: { snapshot: Snapshot; timeZone: string }) {
  const client = useQueryClient();
  const chain = usePackChain(snapshot.packRef);
  const today = todayIn(timeZone);
  const data = useMemo(() => homeData(snapshot, today), [snapshot, today]);
  if (chain.status === 'pending') return <Waiting />;
  if (chain.status === 'error') {
    return (
      <ErrorState
        error={chain.error}
        onRetry={() => void client.refetchQueries({ queryKey: ['content'] })}
      />
    );
  }
  return <ArchivedScreen snapshot={snapshot} data={data} chain={chain.packs} today={today} />;
}

function ArchivedScreen({
  snapshot,
  data,
  chain,
  today,
}: {
  snapshot: Snapshot;
  data: HomeData;
  chain: readonly VersionedPack[];
  today: string;
}) {
  const toast = useToast();
  const [problem, setProblem] = useState<string>();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const unarchive = useMutation({
    mutationFn: (id: string) =>
      api.patch<Written<HoldingRow>>(`/holdings/${id}`, { archived: false }),
    onSuccess: () => {
      setPendingId(null);
      toast.show({ message: 'Unarchived.' });
    },
    onError: (error: unknown) => {
      setPendingId(null);
      setProblem(failureSentence(error));
    },
  });

  const labels = useMemo(() => {
    const types = new Map<string, UserType>(snapshot.types.map((t) => [t.id, t]));
    return new Map(
      data.holdings.map((holding) => {
        const type = types.get(holding.typeId);
        return [
          holding.id,
          typeLabel(chain, {
            universal: type?.universal ?? holding.universal,
            packTypeKey: type?.packTypeKey ?? null,
            customName: type?.customName ?? null,
          }),
        ];
      }),
    );
  }, [snapshot.types, data.holdings, chain]);
  const rows = useMemo(() => data.holdings.filter((holding) => holding.archived), [data.holdings]);

  return (
    <>
      <div className={styles.topbar}>
        <Link to="/" className={styles.iconButton} aria-label="Back to Home">
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className={styles.title}>Archived</h1>
        <span className={styles.spacer} />
      </div>
      <p className={styles.note}>Archived holdings keep their history but leave every total.</p>
      {problem ? <FormProblem>{problem}</FormProblem> : null}
      <Card flush>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <p>Nothing archived.</p>
          </div>
        ) : (
          rows.map((holding) => {
            const latest = data.latest.get(holding.id) ?? null;
            const pending = pendingId === holding.id;
            return (
              <div key={holding.id} className={styles.row}>
                <span className={styles.grow}>
                  <span className={styles.name}>{holding.name}</span>
                  <span className={styles.sub}>
                    {archivedRowSub(labels.get(holding.id) ?? 'Other', latest?.date ?? null, today)}
                  </span>
                </span>
                <Button
                  variant="quiet"
                  aria-disabled={pending || unarchive.isPending ? true : undefined}
                  onClick={() => {
                    if (unarchive.isPending) return;
                    setProblem(undefined);
                    setPendingId(holding.id);
                    unarchive.mutate(holding.id);
                  }}
                >
                  {pending ? 'Unarchiving…' : 'Unarchive'}
                </Button>
              </div>
            );
          })
        )}
      </Card>
    </>
  );
}
