import {
  activityQuerySchema,
  type ActivityQuery,
  type AuditEntry,
  type Page,
} from '@netnet/contracts';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { CONNECTION_ENTITY } from './connections';
import { parseInput } from './input';
import { decodeCursor, encodeCursor } from './reads';
import { audit } from './schema';
import type { Scope } from './scope';

/**
 * The activity log (architecture §6.8, PRD J7): every change the person, an agent or NetNet made,
 * newest first, over one implementation behind REST and MCP. It is a record only: nothing here
 * changes data. A mistake is corrected by another change, which reads here like any other.
 */

type AuditRow = typeof audit.$inferSelect;

const DEFAULT_ACTIVITY_PAGE = 50;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function holdingName(side: unknown): string {
  return str(obj(side)?.name) ?? 'a holding';
}

function typeLabel(side: unknown): string {
  const t = obj(side);
  return str(t?.customName) ?? str(t?.packTypeKey) ?? str(t?.universal) ?? 'a type';
}

const PREF_LABELS: Record<string, string> = {
  home_filter: 'home filter',
  insights_filter: 'insights filter',
  baseline: 'baseline',
  sort: 'sort',
};

/** How an entry reads: the action, the entity and the name or date on its sides. */
function summary(row: AuditRow): string {
  if (row.entity === CONNECTION_ENTITY) return 'Agent disconnected';
  const { action, before, after } = row;
  switch (row.entity) {
    case 'ledger': {
      if (action === 'create') {
        const ccy = str(obj(after)?.baseCurrency);
        return ccy ? `Started tracking in ${ccy}` : 'Started tracking';
      }
      const from = str(obj(before)?.baseCurrency);
      const to = str(obj(after)?.baseCurrency);
      return from && to && from !== to
        ? `Changed the default currency from ${from} to ${to}`
        : 'Updated the ledger';
    }
    case 'type':
      if (action === 'create') return `Added type "${typeLabel(after)}"`;
      if (action === 'delete') return `Removed type "${typeLabel(before)}"`;
      return `Renamed type to "${typeLabel(after)}"`;
    case 'tag': {
      const name = str(obj(action === 'delete' ? before : after)?.name) ?? 'a tag';
      if (action === 'create') return `Added tag "${name}"`;
      if (action === 'delete') return `Removed tag "${name}"`;
      return `Renamed tag to "${name}"`;
    }
    case 'holding': {
      if (action === 'create') return `Added "${holdingName(after)}"`;
      if (action === 'delete') return `Deleted "${holdingName(before)}"`;
      const name = holdingName(after);
      return `Updated "${name === 'a holding' ? holdingName(before) : name}"`;
    }
    case 'value': {
      const date = str(obj(action === 'delete' ? before : after)?.date) ?? 'a date';
      if (action === 'create') return `Recorded a value for ${date}`;
      if (action === 'delete') return `Deleted the value for ${date}`;
      return `Updated the value for ${date}`;
    }
    case 'prefs': {
      const key = row.entityId ?? str(obj(after ?? before)?.key) ?? '';
      const label = PREF_LABELS[key] ?? 'preferences';
      if (action === 'create') return `Set ${label}`;
      if (action === 'delete') return `Cleared ${label}`;
      return `Updated ${label}`;
    }
    default: {
      const verb = action === 'create' ? 'Created' : action === 'delete' ? 'Deleted' : 'Updated';
      return `${verb} ${row.entity}`;
    }
  }
}

/** A revocation's disconnected agent: the row carries no client, its snapshot does. */
function clientNameOf(row: AuditRow): string | null {
  if (row.clientName !== null) return row.clientName;
  if (row.entity === CONNECTION_ENTITY) return str(obj(row.after)?.clientName) ?? null;
  return null;
}

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    at: row.at.toISOString(),
    actor: row.actor,
    clientName: clientNameOf(row),
    connectionId: row.connectionId,
    batchId: row.batchId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    summary: summary(row),
  };
}

/**
 * `activity`: the audit log, newest first, optionally one agent turn. Another user's entries are
 * unreachable: every query names this user, under row-level security.
 */
export async function activity(s: Scope, p: ActivityQuery): Promise<Page<AuditEntry>> {
  const q = parseInput(activityQuerySchema, p);
  const after =
    q.cursor === undefined ? undefined : decodeCursor(q.cursor, [INSTANT, 'aud'], 'cursor');
  const limit = q.limit ?? DEFAULT_ACTIVITY_PAGE;
  const rows = await s.db
    .select()
    .from(audit)
    .where(
      and(
        eq(audit.userId, s.userId),
        q.batchId === undefined ? undefined : eq(audit.batchId, q.batchId),
        after === undefined
          ? undefined
          : or(
              lt(audit.at, new Date(after[0]!)),
              and(eq(audit.at, new Date(after[0]!)), lt(audit.id, after[1]!)),
            ),
      ),
    )
    .orderBy(desc(audit.at), desc(audit.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(toEntry),
    nextCursor: rows.length > limit && last ? encodeCursor([last.at.toISOString(), last.id]) : null,
  };
}
