import {
  MAX_NAME_LENGTH,
  type ActivityQuery,
  type AuditEntry,
  type ContextInput,
  type CreateHolding,
  type Holding,
  type HoldingDetail,
  type HoldingPatch,
  type HoldingQuery,
  type HoldingView,
  type HistoryQuery,
  type NewValue,
  type PackRef,
  type Page,
  type PageReq,
  type Prefs,
  type PrefsPatch,
  type Series,
  type Snapshot,
  type Tag,
  type TagInput,
  type TypeInput,
  type UndoResult,
  type UndoTarget,
  type UserType,
  type Value,
  type ValuePatch,
  type ValueResult,
  type Write,
} from '@netnet/contracts';
import { activity, undo } from './activity';
import { changeBaseCurrency } from './currency';
import { createHolding, deleteHolding, updateHolding } from './holdings';
import { setPrefs } from './prefs';
import { context, getHolding, history, listHoldings, snapshot } from './reads';
import { Scope, type LedgerOptions } from './scope';
import {
  applyPackTypes,
  changeCountry,
  deleteTag,
  deleteType,
  init,
  upsertTag,
  upsertType,
  type CountryInput,
} from './taxonomy';
import { deleteValue, recordValues, updateValue } from './values';
import type { Actor, LedgerTx, WithUser } from './with-user';

export type { LedgerContent, LedgerOptions } from './scope';

/**
/**
 * The Ledger (architecture §7.3): the only code that touches the `ledger` schema, and the one
 * implementation behind REST and MCP. Every write is one transaction with its audit rows,
 * `data_version + 1`, its batch, its warnings and its domain events; the edge `track()`s the
 * events. Activity, undo, the base currency change, export, erasure and periods come with P3.
 */
export interface Ledger {
  /** The ledger in `baseCurrency`, with every universal type and the pack chain's types. Once. */
  init(i: CountryInput): Promise<void>;
  snapshot(): Promise<Snapshot>;
  /** The input to `core.compileContext`, which the caller runs with baseline, today and packs. */
  context(): Promise<ContextInput>;
  listHoldings(q: HoldingQuery): Promise<Page<HoldingView>>;
  getHolding(id: string, values?: PageReq): Promise<HoldingDetail>;
  history(q: HistoryQuery): Promise<Series>;
  /** The audit log, newest first, optionally one agent turn. */
  activity(p: ActivityQuery): Promise<Page<AuditEntry>>;

  createHolding(i: CreateHolding): Promise<Write<Holding>>;
  updateHolding(id: string, p: HoldingPatch): Promise<Write<Holding>>;
  deleteHolding(id: string): Promise<Write<void>>;
  /** 1 to 200 values, atomic: one bad item writes nothing. */
  recordValues(items: readonly NewValue[]): Promise<Write<ValueResult[]>>;
  updateValue(id: string, p: ValuePatch): Promise<Write<Value>>;
  deleteValue(id: string): Promise<Write<void>>;
  upsertType(i: TypeInput): Promise<Write<UserType>>;
  deleteType(id: string, moveTo?: string): Promise<Write<void>>;
  upsertTag(i: TagInput): Promise<Write<Tag>>;
  deleteTag(id: string, mergeInto?: string): Promise<Write<void>>;
  /** Undoes one entry, or a whole agent turn newest first and all or nothing. */
  undo(t: UndoTarget): Promise<Write<UndoResult>>;
  setPrefs(p: PrefsPatch): Promise<Write<Prefs>>;
  /**
   * Another default currency: every value re-derived from the stored rates at its own rate date,
   * in one write. Called with the system actor, so the log reads one system change.
   */
  changeBaseCurrency(ccy: string): Promise<Write<void>>;
  applyPackTypes(pack: PackRef): Promise<Write<UserType[]>>;
  /**
   * Another country confirmed: with no holding yet, the ledger starts over in its currency and
   * types; with one, the currency stays and the pack's types are added (PRD J2).
   */
  changeCountry(i: CountryInput): Promise<Write<void>>;
}

/** The methods that only read. */
export const LEDGER_READS = [
  'snapshot',
  'context',
  'listHoldings',
  'getHolding',
  'history',
  'activity',
] as const satisfies readonly (keyof Ledger)[];

/** The methods that write, each through `withUser(…, {write: true})` with its audit rows. */
export const LEDGER_WRITES = [
  'init',
  'createHolding',
  'updateHolding',
  'deleteHolding',
  'recordValues',
  'updateValue',
  'deleteValue',
  'upsertType',
  'deleteType',
  'upsertTag',
  'deleteTag',
  'undo',
  'setPrefs',
  'changeBaseCurrency',
  'applyPackTypes',
  'changeCountry',
] as const satisfies readonly (keyof Ledger)[];

/** The Ledger over one `withUser` transaction. */
export function openLedger(tx: LedgerTx, options: LedgerOptions): Ledger {
  const s = new Scope(tx, options);
  return {
    init: (i) => init(s, i),
    snapshot: () => snapshot(s),
    context: () => context(s),
    listHoldings: (q) => listHoldings(s, q),
    getHolding: (id, values) => getHolding(s, id, values),
    history: (q) => history(s, q),
    activity: (p) => activity(s, p),
    createHolding: (i) => createHolding(s, i),
    updateHolding: (id, p) => updateHolding(s, id, p),
    deleteHolding: (id) => deleteHolding(s, id),
    recordValues: (items) => recordValues(s, items),
    updateValue: (id, p) => updateValue(s, id, p),
    deleteValue: (id) => deleteValue(s, id),
    upsertType: (i) => upsertType(s, i),
    deleteType: (id, moveTo) => deleteType(s, id, moveTo),
    upsertTag: (i) => upsertTag(s, i),
    deleteTag: (id, mergeInto) => deleteTag(s, id, mergeInto),
    undo: (t) => undo(s, t),
    setPrefs: (p) => setPrefs(s, p),
    changeBaseCurrency: (ccy) => changeBaseCurrency(s, ccy),
    applyPackTypes: (pack) => applyPackTypes(s, pack),
    changeCountry: (i) => changeCountry(s, i),
  };
}

export type WithLedger = <T>(
  userId: string,
  actor: Actor,
  fn: (ledger: Ledger) => Promise<T>,
  opts?: { write?: boolean },
) => Promise<T>;

/**
 * `withUser` handing its callback the Ledger (architecture §7.3's signature), for one user's
 * options: their pack chain and time zone, and the exchange rates.
 */
export function createWithLedger(withUser: WithUser, options: LedgerOptions): WithLedger {
  return (userId, actor, fn, opts) =>
    withUser(userId, actor, (tx) => fn(openLedger(tx, options)), opts);
}

/**
 * The name an agent's values and audit entries carry (`Actor.clientName`): the guide's name
 * (`guideName`, from content) for a connection classified `claude` or `chatgpt`, otherwise the
 * name the client registered with. Registered names are untrusted text: cut to 120 characters
 * here, and escaped wherever they are shown.
 */
export function agentClientName(
  connection: { client: 'claude' | 'chatgpt' | 'other'; clientName: string },
  guideName: string | undefined,
): string {
  const name =
    connection.client !== 'other' && guideName !== undefined ? guideName : connection.clientName;
  return Array.from(name.trim()).slice(0, MAX_NAME_LENGTH).join('');
}
