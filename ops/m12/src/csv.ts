import type { DemoHousehold } from '@netnet/contracts';

/**
 * The spreadsheet arm (P4-T9): the same household as a person keeps it — one CSV, a row per
 * holding with its name, kind and currency, a column per month-end with the amount in the
 * holding's currency, blank where nothing was recorded, and the rates the household used in their
 * own block at the bottom. None of NetNet's derived layers: no accessibility, no reasons, no
 * totals, no staleness, no conversions, no "as of" beyond the end date the sheet states. It is
 * built from `content/demo/household.json`, so both arms hold identical data.
 */

/** A cell, quoted only when it has to be: a comma, a quote or a newline (RFC 4180). */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const row = (cells: readonly string[]) => cells.map(csvCell).join(',');

/** What the sheet is, so the CSV parser and the model both see the same document. */
export interface Spreadsheet {
  readonly csv: string;
  /** The month-ends, oldest first: one column each, after name, kind and currency. */
  readonly dates: string[];
  readonly holdings: number;
  /** The rate rows: one per currency and date the household recorded. */
  readonly rates: number;
}

/**
 * The household as one CSV. Every holding in the file gets a row (an archived one too: it is
 * what the household recorded), the dates are every month-end any value is dated on, and a cell
 * is the amount exactly as the file gives it, or empty when the holding has no value that month.
 * The rates block lists each foreign value's own rate into the base currency, as the household
 * kept it; the sheet never converts anything itself.
 */
export function buildSpreadsheet(household: DemoHousehold): Spreadsheet {
  const dates = [...new Set(household.holdings.flatMap((h) => h.values.map((v) => v.date)))].sort();

  const lines: string[] = [
    `Household balance sheet; end date ${household.endDate}; base currency ${household.baseCurrency}`,
    '',
    row(['name', 'kind', 'currency', ...dates]),
  ];
  const cells = new Map<string, string>();
  for (const holding of household.holdings) {
    for (const value of holding.values)
      cells.set(`${holding.name}\u0000${value.date}`, value.amount);
  }
  for (const holding of household.holdings) {
    const amounts = dates.map((date) => cells.get(`${holding.name}\u0000${date}`) ?? '');
    lines.push(row([holding.name, holding.kind, holding.currency, ...amounts]));
  }

  // The rates the household used, each once: country, date and rate, into the base currency.
  const rates = new Map<string, { currency: string; date: string; rate: string }>();
  for (const holding of household.holdings) {
    if (holding.currency === household.baseCurrency) continue;
    for (const value of holding.values) {
      if (value.fxRate === undefined) continue;
      rates.set(`${holding.currency}\u0000${value.date}`, {
        currency: holding.currency,
        date: value.date,
        rate: value.fxRate,
      });
    }
  }
  const rateRows = [...rates.values()].sort(
    (a, b) => a.currency.localeCompare(b.currency) || a.date.localeCompare(b.date),
  );
  lines.push(
    '',
    `Exchange rates used (1 unit of the currency in ${household.baseCurrency})`,
    row(['currency', 'date', 'rate']),
    ...rateRows.map((r) => row([r.currency, r.date, r.rate])),
  );

  return {
    csv: `${lines.join('\n')}\n`,
    dates,
    holdings: household.holdings.length,
    rates: rateRows.length,
  };
}

/** The document's name in the user turn, as a person would name the file they uploaded. */
export const SPREADSHEET_NAME = 'household.csv';
