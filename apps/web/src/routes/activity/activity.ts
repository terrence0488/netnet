import { UNIVERSALS, type AuditEntry, type Pack, type UserTypeIn } from '@netnet/contracts';
import { typeLabel } from '@netnet/core';
import { formatDate } from '../../components/dates';
import { formatMoney } from '../../components/money';

/**
 * The Activity screen's readings (PRD J7): newest-first entries grouped by agent turn, each with
 * what changed, old → new, who did it and when.
 */

export interface TurnGroup {
  readonly kind: 'turn';
  readonly batchId: string;
  /** Newest first, never empty: a turn is born with its first entry. */
  readonly entries: [AuditEntry, ...AuditEntry[]];
}

export interface SingleGroup {
  readonly kind: 'single';
  readonly entry: AuditEntry;
}

export type ActivityGroup = TurnGroup | SingleGroup;

/**
 * Groups consecutive entries of one agent turn; the person's and NetNet's own writes stand alone.
 * The list stays newest first: a turn never pulls an older entry above a newer one.
 */
export function groupActivity(items: readonly AuditEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const entry of items) {
    const batchId = entry.batchId;
    if (batchId === null) {
      groups.push({ kind: 'single', entry });
      continue;
    }
    const last = groups.at(-1);
    if (last?.kind === 'turn' && last.batchId === batchId) {
      last.entries.push(entry);
    } else {
      groups.push({ kind: 'turn', batchId, entries: [entry] });
    }
  }
  return groups;
}

/** The turn's writer: the client name on its entries, if they carry one. */
export function turnClient(group: TurnGroup): string | null {
  return group.entries.find((entry) => entry.clientName !== null)?.clientName ?? null;
}

function recordOf(side: unknown): Record<string, unknown> | undefined {
  return typeof side === 'object' && side !== null && !Array.isArray(side)
    ? (side as Record<string, unknown>)
    : undefined;
}

function textOf(side: unknown, key: string): string | undefined {
  const found = recordOf(side)?.[key];
  return typeof found === 'string' ? found : undefined;
}

interface MoneySide {
  amountMinor: number;
  currency: string;
}

function moneyOf(side: unknown): MoneySide | undefined {
  const record = recordOf(side);
  const amount = record?.amountMinor;
  const currency = record?.currency;
  return typeof amount === 'number' && typeof currency === 'string'
    ? { amountMinor: amount, currency }
    : undefined;
}

/** A side's text-or-null field: absent reads as null, anything else as unreadable. */
function nullableTextOf(side: unknown, key: string): string | null | undefined {
  const found = recordOf(side)?.[key];
  if (found === undefined || found === null) return null;
  return typeof found === 'string' ? found : undefined;
}

/**
 * A type side as `typeLabel` reads it, or undefined when it cannot be read as one: its universal
 * type must be one, and its pack key and name text when present.
 */
function typeOf(side: unknown): UserTypeIn | undefined {
  const universal = UNIVERSALS.find((u) => u === recordOf(side)?.universal);
  const packTypeKey = nullableTextOf(side, 'packTypeKey');
  const customName = nullableTextOf(side, 'customName');
  if (universal === undefined || packTypeKey === undefined || customName === undefined) {
    return undefined;
  }
  return { universal, packTypeKey, customName };
}

/** A type side's name as every screen gives it: `typeLabel` over the person's pack chain. */
function typeLabelOf(chain: readonly Pack[], side: unknown): string | undefined {
  const type = typeOf(side);
  return type ? typeLabel(chain, type) : undefined;
}

function valueChange(entry: AuditEntry): string | null {
  const before = entry.before === null ? undefined : moneyOf(entry.before);
  const after = entry.after === null ? undefined : moneyOf(entry.after);
  if (entry.action === 'update' && (!before || !after)) return null;
  if (!before || !after) {
    const side = after ?? before;
    return side ? `${formatMoney(side.amountMinor, side.currency)} ${side.currency}` : null;
  }
  if (before.currency === after.currency) {
    return `${formatMoney(before.amountMinor, before.currency)} → ${formatMoney(after.amountMinor, after.currency)} ${after.currency}`;
  }
  return `${formatMoney(before.amountMinor, before.currency, { code: true })} → ${formatMoney(after.amountMinor, after.currency, { code: true })}`;
}

function renamedChange(before: string | undefined, after: string | undefined): string | null {
  return before !== undefined && after !== undefined && before !== after
    ? `“${before}” → “${after}”`
    : null;
}

function prefsChange(entry: AuditEntry): string | null {
  if (entry.action !== 'update') return null;
  const before = JSON.stringify(recordOf(entry.before)?.value);
  const after = JSON.stringify(recordOf(entry.after)?.value);
  return typeof before === 'string' &&
    typeof after === 'string' &&
    before !== after &&
    before.length + after.length <= 40
    ? `${before} → ${after}`
    : null;
}

/**
 * A change of the default currency is one entry however many values it re-derived (architecture
 * §6.8): beneath its summary, how many. An entry logged before the count was kept, or one that
 * recalculated nothing, leaves the summary to say it.
 */
function ledgerChange(entry: AuditEntry): string | null {
  if (entry.action !== 'update') return null;
  const count = recordOf(entry.after)?.valuesRederived;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) return null;
  return `${count.toLocaleString()} ${count === 1 ? 'value' : 'values'} recalculated`;
}

/**
 * The old → new beneath an entry's summary, or null when the summary already says it (a creation,
 * a deletion, a revocation). A type reads by its label in `chain`, the person's pack chain, as
 * the summary names it. Sides that are not shaped as expected read as no detail rather than a
 * guess.
 */
export function describeChange(entry: AuditEntry, chain: readonly Pack[]): string | null {
  switch (entry.entity) {
    case 'value':
      return valueChange(entry);
    case 'ledger':
      return ledgerChange(entry);
    case 'holding':
      return entry.action === 'update'
        ? renamedChange(textOf(entry.before, 'name'), textOf(entry.after, 'name'))
        : null;
    case 'type':
      return entry.action === 'update'
        ? renamedChange(typeLabelOf(chain, entry.before), typeLabelOf(chain, entry.after))
        : null;
    case 'tag':
      return entry.action === 'update'
        ? renamedChange(textOf(entry.before, 'name'), textOf(entry.after, 'name'))
        : null;
    case 'prefs':
      return prefsChange(entry);
    default:
      return null;
  }
}

/** A value's date at the end of its summary: "Recorded a value for 2026-05-20". */
const TRAILING_DATE = / (\d{4}-\d{2}-\d{2})$/;

/** Whether `date` is a real `YYYY-MM-DD` calendar date. */
function isCalendarDate(date: string): boolean {
  const at = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === date;
}

/**
 * The entry's first line: its summary, with a value's date read as the screen reads every other
 * date (`formatDate`: "Recorded a value for May 20, 2026" in an en-US browser). The summary itself
 * keeps `YYYY-MM-DD`, as every date an agent is given does.
 */
export function entrySummary(entry: AuditEntry, locale?: string): string {
  if (entry.entity !== 'value') return entry.summary;
  const date = TRAILING_DATE.exec(entry.summary)?.[1];
  if (date === undefined || !isCalendarDate(date)) return entry.summary;
  return `${entry.summary.slice(0, -date.length)}${formatDate(date, locale)}`;
}

/** Who the entry's meta line names: the agent, the person, NetNet, or the disconnected agent. */
export function actorLabel(entry: AuditEntry): string {
  if (entry.entity === 'connection') return entry.clientName ?? 'An agent';
  if (entry.actor === 'agent') return entry.clientName ?? 'An agent';
  if (entry.actor === 'system') return 'NetNet';
  return 'You';
}

/** The audit log gives the timestamp (design-system §2.1): "12 Oct 2026, 9:14 pm". */
export function formatInstant(iso: string): string {
  const at = new Date(iso);
  const day = at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}
