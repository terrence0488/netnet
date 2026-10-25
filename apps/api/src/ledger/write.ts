import type { DomainEvent, ValueSource, Warning, Write } from '@netnet/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { CrossRate } from '../content/fx';
import { audit, batch, ledgerState } from './schema';
import type { LedgerState, Scope } from './scope';

/**
 * How every write happens (architecture §6.8, CONVENTIONS §10): inside the one `withUser(…,
 * {write: true})` transaction, the change, one audit row per entity touched, and `data_version + 1`.
 * An agent's writes join its connection's batch. A write that changes nothing writes nothing,
 * so the snapshot's ETag stays valid.
 */

/** An agent's writes join one batch while each follows the previous by at most this (§6.8). */
export const BATCH_WINDOW_MS = 120_000;

/** What an audit row is about. */
export type Entity = 'ledger' | 'type' | 'tag' | 'holding' | 'value' | 'prefs';
export type Action = 'create' | 'update' | 'delete';

/** Who wrote a value (architecture §6.3): the source, and for an agent its name, connection and batch. */
export interface Provenance {
  source: ValueSource;
  clientName: string | null;
  connectionId: string | null;
  batchId: string | null;
}

type AuditRow = typeof audit.$inferInsert;

/** One write in progress: what it has touched, warned about and fired so far. */
export class WriteScope {
  readonly s: Scope;
  readonly state: LedgerState;
  readonly warnings: Warning[] = [];
  readonly events: DomainEvent[] = [];
  private readonly audits: AuditRow[] = [];
  private batchId: Promise<string | null> | undefined;
  private readonly rates = new Map<string, Promise<CrossRate>>();

  constructor(s: Scope, state: LedgerState) {
    this.s = s;
    this.state = state;
  }

  /** `web` for the person, else the actor's kind. */
  get source(): ValueSource {
    return this.s.actor.kind === 'user' ? 'web' : this.s.actor.kind;
  }

  /** The `source` an event carries; NetNet's own writes fire none (§7.7). */
  get eventSource(): 'web' | 'agent' | undefined {
    const source = this.source;
    return source === 'system' ? undefined : source;
  }

  /** The agent's batch for this write, opened or joined on first use; null for anyone else. */
  batch(): Promise<string | null> {
    this.batchId ??= this.openBatch();
    return this.batchId;
  }

  async provenance(): Promise<Provenance> {
    const { actor } = this.s;
    const agent = actor.kind === 'agent';
    return {
      source: this.source,
      clientName: agent ? (actor.clientName ?? null) : null,
      connectionId: agent ? (actor.connectionId ?? null) : null,
      batchId: await this.batch(),
    };
  }

  /** Records one entity's change: `before` and `after` in full, so the log reads old → new. */
  async audit(
    entity: Entity,
    entityId: string,
    action: Action,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    const { actor } = this.s;
    this.audits.push({
      userId: this.s.userId,
      id: this.s.id('aud'),
      at: this.s.now(),
      actor: actor.kind,
      clientName: actor.clientName ?? null,
      connectionId: actor.kind === 'agent' ? (actor.connectionId ?? null) : null,
      batchId: await this.batch(),
      action,
      entity,
      entityId,
      before: before ?? null,
      after: after ?? null,
    });
  }

  event(event: DomainEvent): void {
    this.events.push(event);
  }

  warn(warning: Warning): void {
    this.warnings.push(warning);
  }

  /** The rate from `from` to `to` for `date`, looked up once per write. */
  crossRate(from: string, to: string, date: string): Promise<CrossRate> {
    const key = `${from}:${to}:${date}`;
    let rate = this.rates.get(key);
    if (!rate) {
      rate = this.s.options.fx.crossRate(from, to, date);
      this.rates.set(key, rate);
    }
    return rate;
  }

  /** Writes the audit rows and bumps `data_version`, if anything changed; the version after. */
  async finish(): Promise<number> {
    if (this.audits.length === 0) return this.state.dataVersion;
    await this.s.db.insert(audit).values(this.audits);
    const [row] = await this.s.db
      .update(ledgerState)
      .set({ dataVersion: sql`${ledgerState.dataVersion} + 1` })
      .where(eq(ledgerState.userId, this.s.userId))
      .returning({ dataVersion: ledgerState.dataVersion });
    if (!row) throw new Error('The ledger state vanished inside its own write.');
    return row.dataVersion;
  }

  private async openBatch(): Promise<string | null> {
    const { actor, userId, db } = this.s;
    if (actor.kind !== 'agent' || actor.connectionId === undefined) return null;
    const now = this.s.now();
    const [last] = await db
      .select({ id: batch.id, lastWriteAt: batch.lastWriteAt })
      .from(batch)
      .where(and(eq(batch.userId, userId), eq(batch.connectionId, actor.connectionId)))
      .orderBy(desc(batch.lastWriteAt), desc(batch.id))
      .limit(1);
    // The per-user write lock makes "the previous write" exact: no other write runs meanwhile.
    if (last && now.getTime() - last.lastWriteAt.getTime() <= BATCH_WINDOW_MS) {
      if (now > last.lastWriteAt) {
        await db
          .update(batch)
          .set({ lastWriteAt: now })
          .where(and(eq(batch.userId, userId), eq(batch.id, last.id)));
      }
      return last.id;
    }
    const id = this.s.id('bat');
    await db
      .insert(batch)
      .values({ userId, id, connectionId: actor.connectionId, openedAt: now, lastWriteAt: now });
    return id;
  }
}

/**
 * Runs one write: `fn` makes the change through `w`, then its audit rows and the version bump
 * follow. Anything `fn` throws rolls the whole transaction back.
 */
export async function runWrite<T>(
  s: Scope,
  method: string,
  fn: (w: WriteScope) => Promise<T>,
  state?: LedgerState,
): Promise<Write<T>> {
  requireWrite(s, method);
  const w = new WriteScope(s, state ?? (await s.requireState()));
  s.beginWrite(w.state.dataVersion + 1);
  const result = await fn(w);
  const dataVersion = await w.finish();
  return { result, dataVersion, warnings: w.warnings, events: w.events };
}

/** A write needs the transaction `withUser` opened for writing, which holds the user's lock. */
export function requireWrite(s: Scope, method: string): void {
  if (!s.tx.write) {
    throw new Error(`Ledger.${method}() writes: call it inside withUser(…, { write: true }).`);
  }
}

/** `value` as JSON with every object's keys in order, so equal content compares equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/** Whether two JSON values hold the same content, whatever their keys' order. */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
