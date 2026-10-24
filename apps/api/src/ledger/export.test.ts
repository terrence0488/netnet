import type { ExportBundle } from '@netnet/contracts';
import { EXPORT_CSV_HEADER } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { toCsv } from './export';

/**
 * The CSV export's table (PRD J10): one row per value under the brief's header, amounts in major
 * units, tags `;`-separated. Pure, so no database. All data is fictional (CONVENTIONS §6).
 */
function bundle(): ExportBundle {
  return {
    exportedAt: '2026-08-01T10:00:00.000Z',
    baseCurrency: 'EUR',
    dataVersion: 4,
    types: [
      {
        id: 'typ_01K1G4KX00AAAAAAAAAAAAAAA1',
        universal: 'cash',
        packTypeKey: null,
        customName: null,
        sort: 0,
        archived: false,
        label: 'Cash and savings',
      },
      {
        id: 'typ_01K1G4KX00AAAAAAAAAAAAAAA2',
        universal: 'listed',
        packTypeKey: null,
        customName: 'My shares',
        sort: 1,
        archived: false,
        label: 'My shares',
      },
    ],
    tags: [
      { id: 'tag_01K1G4KX00AAAAAAAAAAAAAAA1', name: 'rainy day', sort: 0 },
      { id: 'tag_01K1G4KX00AAAAAAAAAAAAAAA2', name: 'joint', sort: 1 },
    ],
    holdings: [
      {
        id: 'hld_01K1G4KX00AAAAAAAAAAAAAAA1',
        name: 'Rainy day pot',
        kind: 'asset',
        typeId: 'typ_01K1G4KX00AAAAAAAAAAAAAAA1',
        currency: 'EUR',
        cadenceDays: null,
        archived: false,
        archivedAt: null,
        createdAt: '2026-07-01T10:00:00.000Z',
        rowVersion: 1,
        access: 'accessible',
        accessReason: 'it is money in the bank',
        accessUntil: null,
        accessBasis: {
          via: 'default',
          pack: 'generic',
          pack_version: 1,
          question: null,
          answer: null,
        },
        tagIds: ['tag_01K1G4KX00AAAAAAAAAAAAAAA1', 'tag_01K1G4KX00AAAAAAAAAAAAAAA2'],
      },
      {
        id: 'hld_01K1G4KX00AAAAAAAAAAAAAAA2',
        name: 'Flat loan',
        kind: 'liability',
        typeId: 'typ_01K1G4KX00AAAAAAAAAAAAAAA2',
        currency: 'EUR',
        cadenceDays: null,
        archived: false,
        archivedAt: null,
        createdAt: '2026-07-01T10:00:00.000Z',
        rowVersion: 1,
        access: null,
        accessReason: null,
        accessUntil: null,
        accessBasis: null,
        tagIds: [],
      },
      {
        id: 'hld_01K1G4KX00AAAAAAAAAAAAAAA3',
        name: 'Nothing yet',
        kind: 'asset',
        typeId: 'typ_01K1G4KX00AAAAAAAAAAAAAAA1',
        currency: 'EUR',
        cadenceDays: null,
        archived: false,
        archivedAt: null,
        createdAt: '2026-07-01T10:00:00.000Z',
        rowVersion: 1,
        access: 'undecided',
        accessReason: null,
        accessUntil: null,
        accessBasis: null,
        tagIds: [],
      },
    ],
    values: [
      {
        id: 'val_01K1G4KX00AAAAAAAAAAAAAAA1',
        holdingId: 'hld_01K1G4KX00AAAAAAAAAAAAAAA1',
        date: '2026-07-01',
        amountMinor: 123456,
        currency: 'USD',
        baseMinor: 98765,
        baseCurrency: 'EUR',
        fxRate: '0.8',
        fxRateDate: '2026-07-01',
        fxSource: 'ecb',
        givenRate: null,
        givenRateInto: null,
        source: 'web',
        clientName: null,
        connectionId: null,
        batchId: null,
        enteredAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        rowVersion: 1,
      },
      {
        id: 'val_01K1G4KX00AAAAAAAAAAAAAAA2',
        holdingId: 'hld_01K1G4KX00AAAAAAAAAAAAAAA2',
        date: '2026-07-15',
        amountMinor: -500000,
        currency: 'JPY',
        baseMinor: -4000,
        baseCurrency: 'EUR',
        fxRate: '0.008',
        fxRateDate: null,
        fxSource: 'agent',
        givenRate: '0.008',
        givenRateInto: 'EUR',
        source: 'agent',
        clientName: 'Fictional agent',
        connectionId: 'con_01K1G4KX00AAAAAAAAAAAAAAA1',
        batchId: 'bat_01K1G4KX00AAAAAAAAAAAAAAA1',
        enteredAt: '2026-07-15T10:00:00.000Z',
        updatedAt: '2026-07-15T10:00:00.000Z',
        rowVersion: 1,
      },
    ],
  };
}

describe('toCsv', () => {
  it('writes the header and one row per value, in the bundle’s order', () => {
    const lines = toCsv(bundle()).split('\n');
    expect(lines[0]).toBe(EXPORT_CSV_HEADER);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      'hld_01K1G4KX00AAAAAAAAAAAAAAA1,Rainy day pot,asset,Cash and savings,USD,2026-07-01,' +
        '1234.56,987.65,EUR,0.8,2026-07-01,ecb,web,,accessible,it is money in the bank,' +
        'rainy day;joint',
    );
    // A liability: no access or reason, no tags, an agent's rate and name.
    expect(lines[2]).toBe(
      'hld_01K1G4KX00AAAAAAAAAAAAAAA2,Flat loan,liability,My shares,JPY,2026-07-15,' +
        '-500000,-40.00,EUR,0.008,,agent,agent,Fictional agent,,,',
    );
    // A holding without values has no row: it is a values table.
    expect(toCsv(bundle())).not.toContain('Nothing yet');
    expect(toCsv(bundle()).endsWith('\n')).toBe(true);
  });

  it('quotes what needs quoting, and nothing else', () => {
    const b = bundle();
    b.holdings[0]!.name = 'Pot, "the big one"\n(and more)';
    const csv = toCsv(b);
    expect(csv).toContain('hld_01K1G4KX00AAAAAAAAAAAAAAA1,"Pot, ""the big one""\n(and more)",');
    expect(csv.split('\n')[0]).toBe(EXPORT_CSV_HEADER);
  });

  it('writes the header alone for an empty bundle', () => {
    expect(
      toCsv({
        exportedAt: '2026-08-01T10:00:00.000Z',
        baseCurrency: null,
        dataVersion: null,
        types: [],
        tags: [],
        holdings: [],
        values: [],
      }),
    ).toBe(`${EXPORT_CSV_HEADER}\n`);
  });
});
