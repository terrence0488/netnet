import { describe, expect, it } from 'vitest';
import { demoHouseholdSchema, type DemoHousehold } from '@netnet/contracts';
import { buildSpreadsheet, csvCell } from '../../ops/m12/src/csv';
import { readHousehold } from '../../ops/m12/src/household';

/**
 * The spreadsheet arm (P4-T9): the same household as one CSV, with none of NetNet's derived
 * layers. The tests hold it to the brief — a row per holding, a column per month-end, blank where
 * nothing was recorded, the rates in their own block — and to the data: every cell is exactly
 * what the household file says, so both arms hold identical data.
 */

/** The household's rows, split on the header the builder writes. */
function parse(csv: string): { header: string[]; rows: string[][]; rates: string[] } {
  const lines = csv.split('\n').filter((line) => line !== '');
  const headerAt = lines.findIndex((line) => line.startsWith('name,kind,currency,'));
  const header = (lines[headerAt] ?? '').split(',');
  const rows: string[][] = [];
  let index = headerAt + 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('Exchange rates used')) break;
    rows.push(line.split(','));
  }
  const rates = lines.slice(index + 2);
  return { header, rows, rates };
}

/** A small household of the file's shape, for the cases the real one does not have. */
function household(overrides: Partial<DemoHousehold> = {}): DemoHousehold {
  return demoHouseholdSchema.parse({
    country: 'SG',
    baseCurrency: 'SGD',
    segment: 'established',
    endDate: '2026-09-30',
    tags: [],
    holdings: [
      {
        name: 'A fictional account',
        kind: 'asset',
        universal: 'cash',
        currency: 'SGD',
        values: [
          { date: '2026-08-31', amount: '10.00' },
          { date: '2026-09-30', amount: '20.00' },
        ],
      },
      {
        name: 'A fictional holder, with a comma',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        values: [{ date: '2026-09-30', amount: '5.00', fxRate: '1.2800' }],
      },
      {
        name: 'A fictional loan',
        kind: 'liability',
        universal: 'loan',
        currency: 'SGD',
        values: [{ date: '2026-09-30', amount: '3.00' }],
      },
    ],
    ...overrides,
  });
}

describe('the spreadsheet arm’s CSV', () => {
  const real = readHousehold();
  const sheet = buildSpreadsheet(real);
  const table = parse(sheet.csv);

  it('is a row per holding and a column per month-end, and nothing else', () => {
    expect(table.header.slice(0, 3)).toStrictEqual(['name', 'kind', 'currency']);
    expect(table.header.slice(3)).toStrictEqual(sheet.dates);
    expect(table.rows).toHaveLength(real.holdings.length);
    for (const row of table.rows) expect(row).toHaveLength(3 + sheet.dates.length);
  });

  it('has no derived layer: no accessibility, total, staleness or base amount', () => {
    const text = sheet.csv.toLowerCase();
    for (const word of ['access', 'reason', 'total', 'stale', 'net worth', 'convertible']) {
      expect(text, word).not.toContain(word);
    }
    expect(table.header).toStrictEqual(['name', 'kind', 'currency', ...sheet.dates]);
  });

  it('holds exactly the household’s amounts, in each holding’s own currency', () => {
    const date = new Map(sheet.dates.map((d, i) => [d, i + 3]));
    for (const holding of real.holdings) {
      const row = table.rows.find((cells) => cells[0] === holding.name);
      expect(row, holding.name).toBeDefined();
      expect(row?.slice(1, 3)).toStrictEqual([holding.kind, holding.currency]);
      for (const value of holding.values) {
        expect(row?.[date.get(value.date) ?? -1], `${holding.name} ${value.date}`).toBe(
          value.amount,
        );
      }
    }
  });

  it('is blank where nothing was recorded', () => {
    const date = new Map(sheet.dates.map((d, i) => [d, i + 3]));
    for (const holding of real.holdings) {
      const row = table.rows.find((cells) => cells[0] === holding.name) ?? [];
      const recorded = new Set(holding.values.map((value) => value.date));
      for (const [day, column] of date) {
        if (!recorded.has(day)) expect(row[column], `${holding.name} ${day}`).toBe('');
      }
    }
  });

  it('keeps the rates the household used in their own block, unconverted', () => {
    const foreign = real.holdings.flatMap((holding) =>
      holding.currency === real.baseCurrency
        ? []
        : holding.values.map((value) => `${holding.currency},${value.date},${value.fxRate}`),
    );
    expect(table.rates).toHaveLength(new Set(foreign).size);
    for (const line of foreign) expect(table.rates).toContain(line);
  });

  it('quotes a cell only when it has to', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    const small = buildSpreadsheet(household());
    expect(small.csv).toContain('"A fictional holder, with a comma"');
  });

  it('gives both arms the same data: the sheet has every holding the household has', () => {
    const names = table.rows.map((row) => row[0]?.replace(/^"|"$/g, '').replace(/""/g, '"'));
    expect(names).toStrictEqual(real.holdings.map((holding) => holding.name));
  });
});
