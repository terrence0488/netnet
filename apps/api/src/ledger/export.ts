import {
  EXPORT_CSV_HEADER,
  type ExportBundle,
  type ExportType,
  type Holding,
} from '@netnet/contracts';
import { fromMinor, typeLabel } from '@netnet/core';
import { loadHoldings, loadTags, loadTypes, loadValues, toTag, toUserType } from './rows';
import type { Scope } from './scope';

/**
 * The person's data to take away (PRD J10, architecture §7.2, §7.3): `exportAll` reads the whole
 * ledger as one bundle, and `toCsv` flattens its values into the spreadsheet table. Both carry
 * every figure the position is built from — amounts, currencies, rates and rate dates, and a rate
 * the person or their agent gave as given — and the accessibility outcome with the answer behind
 * it, which rides on each holding.
 */

/** `exportAll`: everything, to rebuild a spreadsheet from. Empty before the ledger exists. */
export async function exportAll(s: Scope): Promise<ExportBundle> {
  const state = await s.state();
  const exportedAt = s.now().toISOString();
  if (!state) {
    return {
      exportedAt,
      baseCurrency: null,
      dataVersion: null,
      types: [],
      tags: [],
      holdings: [],
      values: [],
    };
  }
  const chain = await s.chain();
  const types: ExportType[] = (await loadTypes(s)).map((row) => {
    const type = toUserType(row);
    return { ...type, label: typeLabel(chain, type) };
  });
  return {
    exportedAt,
    baseCurrency: state.baseCurrency,
    dataVersion: state.dataVersion,
    types,
    tags: (await loadTags(s)).map(toTag),
    holdings: await loadHoldings(s),
    values: await loadValues(s),
  };
}

/** A CSV field: quoted only when it needs it, with its quotes doubled (RFC 4180). */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * `toCsv`: the bundle's values as one flat table under `EXPORT_CSV_HEADER`, in the bundle's order.
 * Amounts are decimals in major units (`core.fromMinor`, never floating point); tags are the
 * holding's tag names, `;`-separated; a value with no given rate leaves its two columns empty. A
 * holding without values has no row: it is a values table. Pure, so its tests need no database.
 */
export function toCsv(bundle: ExportBundle): string {
  const holdings = new Map<string, Holding>(bundle.holdings.map((h) => [h.id, h]));
  const tags = new Map<string, string>(bundle.tags.map((t) => [t.id, t.name]));
  const types = new Map<string, string>(bundle.types.map((t) => [t.id, t.label]));
  const lines = [EXPORT_CSV_HEADER];
  for (const value of bundle.values) {
    const holding = holdings.get(value.holdingId);
    if (!holding) continue;
    lines.push(
      [
        holding.id,
        holding.name,
        holding.kind,
        types.get(holding.typeId) ?? '',
        value.currency,
        value.date,
        fromMinor(value.amountMinor, value.currency),
        fromMinor(value.baseMinor, value.baseCurrency),
        value.baseCurrency,
        value.fxRate,
        value.fxRateDate ?? '',
        value.fxSource,
        value.source,
        value.clientName ?? '',
        holding.access ?? '',
        holding.accessReason ?? '',
        holding.tagIds.map((id) => tags.get(id) ?? '').join(';'),
        value.givenRate ?? '',
        value.givenRateInto ?? '',
      ]
        .map(field)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
