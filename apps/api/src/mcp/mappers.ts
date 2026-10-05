import type {
  Holding,
  HoldingView,
  McpHolding,
  McpHoldingView,
  McpTag,
  McpType,
  McpValue,
  McpWarning,
  Pack,
  Tag,
  UserType,
  Value,
  Warning,
  Write,
} from '@netnet/contracts';
import { chainValue, fromMinor, typeLabel } from '@netnet/core';

/**
 * The Ledger's rows as the MCP outputs carry them (architecture §7.4): snake_case, with amounts
 * converted once from minor units to major decimals (CONVENTIONS §5). Every figure still comes
 * from `core`: this maps shapes, never arithmetic.
 */

/** Minor units in `currency` → the major decimal the outputs carry. */
export function major(minor: number, currency: string): number {
  return Number(fromMinor(minor, currency));
}

export function valueToMcp(value: Value): McpValue {
  return {
    id: value.id,
    holding_id: value.holdingId,
    date: value.date,
    amount: major(value.amountMinor, value.currency),
    currency: value.currency,
    base_amount: major(value.baseMinor, value.baseCurrency),
    base_currency: value.baseCurrency,
    fx_rate: value.fxRate,
    fx_rate_date: value.fxRateDate,
    fx_source: value.fxSource,
    source: value.source,
    client_name: value.clientName,
    entered_at: value.enteredAt,
    updated_at: value.updatedAt,
  };
}

export function holdingToMcp(holding: Holding): McpHolding {
  return {
    id: holding.id,
    name: holding.name,
    kind: holding.kind,
    type_id: holding.typeId,
    currency: holding.currency,
    cadence_days: holding.cadenceDays,
    archived: holding.archived,
    archived_at: holding.archivedAt,
    created_at: holding.createdAt,
    access: holding.access,
    access_reason: holding.accessReason,
    until: holding.accessUntil,
    tag_ids: [...holding.tagIds],
  };
}

export function holdingViewToMcp(view: HoldingView): McpHoldingView {
  return {
    ...holdingToMcp(view),
    universal_type: view.universal,
    type_label: view.typeLabel,
    latest: view.latest === null ? null : valueToMcp(view.latest),
    staleness: view.staleness === null ? null : { ...view.staleness },
  };
}

/** A user's type with its label in the current chain: the user's own, else the pack's. */
export function userTypeToMcp(type: UserType, chain: readonly Pack[]): McpType {
  return {
    id: type.id,
    universal_type: type.universal,
    label: typeLabel(chain, type),
    // Generic defines every meaning (content validation checks it), so this is always set.
    meaning: chainValue(chain, 'meaning', type.universal) ?? '',
    custom_name: type.customName,
    pack_type_key: type.packTypeKey,
    archived: type.archived,
  };
}

export function tagToMcp(tag: Tag): McpTag {
  return { id: tag.id, name: tag.name };
}

export function warningToMcp(warning: Warning): McpWarning {
  return {
    code: warning.code,
    message: warning.message,
    ...(warning.path === undefined ? {} : { path: warning.path }),
  };
}

export interface McpWrite<R> {
  result: R;
  data_version: number;
  warnings: McpWarning[];
}

/** A Ledger write as §7.2's shape, in snake_case, with `result` already mapped. */
export function writeToMcp<T, R>(write: Write<T>, result: R): McpWrite<R> {
  return {
    result,
    data_version: write.dataVersion,
    warnings: write.warnings.map(warningToMcp),
  };
}
