import type { AuditEntry } from '@netnet/contracts';
import { isApiError } from '../../api/client';
import { errorCopy, type ErrorCopy } from '../../components/ErrorState';
import { formatMoney } from '../../components/money';

/**
 * The Activity screen's readings (PRD J7): newest-first entries grouped by agent turn, each with
 * what changed, old → new, who did it and when — and plain words when an undo cannot go through.
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

/** A turn's entries that still stand: an undone entry's way back is its undo's own Undo. */
export function undoableOf(group: TurnGroup): AuditEntry[] {
  return group.entries.filter((entry) => entry.undoneBy === null);
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

/** A type's label as the log reads it: its own name, else the pack's, else the universal. */
function typeLabelOf(side: unknown): string | undefined {
  return textOf(side, 'customName') ?? textOf(side, 'packTypeKey') ?? textOf(side, 'universal');
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
 * The old → new beneath an entry's summary, or null when the summary already says it (a creation,
 * a deletion, a revocation, the default currency). Sides that are not shaped as expected read as
 * no detail rather than a guess.
 */
export function describeChange(entry: AuditEntry): string | null {
  switch (entry.entity) {
    case 'value':
      return valueChange(entry);
    case 'holding':
      return entry.action === 'update'
        ? renamedChange(textOf(entry.before, 'name'), textOf(entry.after, 'name'))
        : null;
    case 'type':
      return entry.action === 'update'
        ? renamedChange(typeLabelOf(entry.before), typeLabelOf(entry.after))
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

/** `UNDO_CONFLICT`'s blockers, newest first: the later changes to undo before this one. */
export function conflictBlockers(error: unknown): string[] {
  if (!isApiError(error, 'UNDO_CONFLICT')) return [];
  const blockers = error.details['blockers'];
  if (!Array.isArray(blockers)) return [];
  const ids: string[] = [];
  for (const blocker of blockers) {
    const id = recordOf(blocker)?.entry_id;
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

export interface ConflictCopy {
  readonly title: string;
  readonly action: string;
}

/**
 * Plain words for a conflict: what stands in the way, named from the loaded log, and the offer to
 * undo it first. Never an id.
 */
export function conflictCopy(blocker: AuditEntry | undefined): ConflictCopy {
  if (!blocker) {
    return {
      title:
        'This can’t be undone yet — a newer change is in the way. Undo that first, then try again.',
      action: 'Undo the newer change first',
    };
  }
  return {
    title: `This can’t be undone yet — “${blocker.summary}” came afterwards. Undo that first, then try again.`,
    action: `Undo “${blocker.summary}” first`,
  };
}

/** Plain words when an undo fails for good: some changes, like a disconnection, stay made. */
export function undoFailureCopy(error: unknown, entry: AuditEntry): ErrorCopy {
  if (isApiError(error, 'VALIDATION_FAILED')) {
    return {
      title: 'This change can’t be undone.',
      detail:
        entry.entity === 'connection'
          ? 'Disconnecting an agent stays in the log. Reconnect it from the Agent tab to use it again.'
          : 'Some changes stay as they are once made.',
      retry: false,
    };
  }
  return errorCopy(error);
}
