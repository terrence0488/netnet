import type { PackRef, VersionedPack } from '@netnet/contracts';
import { addDays } from '@netnet/core';
import { eq } from 'drizzle-orm';
import type { Fx } from '../content/fx';
import { AppError } from '../lib/errors';
import { newId, type IdPrefix } from '../lib/ids';
import { ledgerState } from './schema';
import type { LedgerTx } from './with-user';

/**
 * What one `Ledger` works with: its transaction (from `withUser`), and what the edge supplies for
 * the user: exchange rates, their pack chain and their time zone.
 */

/** The packs the Ledger reads: labels, defaults and questions (architecture §6.7). */
export interface LedgerContent {
  /** The user's pack chain at its live versions: their country's pack (if any), then generic. */
  chain(): Promise<readonly VersionedPack[]>;
  /** The packs `ref` names, at those versions. */
  packs(ref: PackRef): Promise<readonly VersionedPack[]>;
}

export interface LedgerOptions {
  /** Rates for a value's date (`crossRate`, architecture §6.6); tests pass a fake. */
  fx: Pick<Fx, 'crossRate'>;
  content: LedgerContent;
  /** The user's IANA time zone (`profile.time_zone`): it decides their today (CONVENTIONS §5). */
  timeZone: string;
}

/** The calendar date at `at` in `timeZone` (UTC if the zone is unknown). */
export function todayIn(timeZone: string, at: Date): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

/**
 * Ids for one write: the transaction's instant, then the data version the write makes and a
 * counter. Ids are unique per user, which is all their keys need, and the rows a user's writes
 * create sort in the order they were made even within one millisecond, so the audit log reads in
 * order by (`at`, `id`).
 */
function idFactory(time: number, version: number): (prefix: IdPrefix) => string {
  // The counter starts somewhere random, with room to count up without wrapping.
  const start = crypto.getRandomValues(new Uint8Array(6));
  start[0] = (start[0] ?? 0) & 0x7f;
  let next = start.reduce((n, byte) => (n << 8n) | BigInt(byte), 0n);
  return (prefix) => {
    const bytes = new Uint8Array(10);
    new DataView(bytes.buffer).setUint32(0, version >>> 0);
    let rest = next;
    for (let i = 9; i >= 4; i -= 1) {
      bytes[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    next += 1n;
    return newId(prefix, time, () => bytes);
  };
}

export interface LedgerState {
  baseCurrency: string;
  dataVersion: number;
}

/** One Ledger's context, shared by its methods. Caches what cannot change within it. */
export class Scope {
  readonly tx: LedgerTx;
  readonly options: LedgerOptions;
  private ids: ((prefix: IdPrefix) => string) | undefined;
  private todayValue: string | undefined;
  private chainValue: Promise<readonly VersionedPack[]> | undefined;

  constructor(tx: LedgerTx, options: LedgerOptions) {
    this.tx = tx;
    this.options = options;
  }

  /** Starts a write that will make data version `version`: the ids it creates follow on. */
  beginWrite(version: number): void {
    this.ids = idFactory(this.now().getTime(), version);
  }

  /** A new id for a row of the write under way. */
  id(prefix: IdPrefix): string {
    if (!this.ids) throw new Error('Ledger ids are made inside a write.');
    return this.ids(prefix);
  }

  get db() {
    return this.tx.db;
  }

  get userId() {
    return this.tx.userId;
  }

  get actor() {
    return this.tx.actor;
  }

  now(): Date {
    return this.tx.now();
  }

  /** The user's today, in their time zone, at the transaction's instant. */
  today(): string {
    this.todayValue ??= todayIn(this.options.timeZone, this.now());
    return this.todayValue;
  }

  /** The latest value date a write accepts: a day after today. */
  latestDate(): string {
    return addDays(this.today(), 1);
  }

  chain(): Promise<readonly VersionedPack[]> {
    this.chainValue ??= this.options.content.chain();
    return this.chainValue;
  }

  /** The ledger's state, or undefined before `init`. */
  async state(): Promise<LedgerState | undefined> {
    const [row] = await this.db
      .select({ baseCurrency: ledgerState.baseCurrency, dataVersion: ledgerState.dataVersion })
      .from(ledgerState)
      .where(eq(ledgerState.userId, this.userId))
      .limit(1);
    return row;
  }

  /** As `state`, for what needs a ledger. */
  async requireState(): Promise<LedgerState> {
    const state = await this.state();
    if (!state) {
      throw new AppError(
        'NOT_FOUND',
        'This account has no ledger yet: finish setting it up (choose a country and currency) first.',
      );
    }
    return state;
  }
}
