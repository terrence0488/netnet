import { UNIVERSALS, type AuditEntry, type VersionedPack } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { formatDate } from '../../components/dates';
import {
  actorLabel,
  describeChange,
  entrySummary,
  formatInstant,
  groupActivity,
  turnClient,
} from './activity';

let made = 0;

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  made += 1;
  return {
    id: `aud_test_${made}`,
    at: '2026-10-12T13:14:00.000Z',
    actor: 'user',
    clientName: null,
    connectionId: null,
    batchId: null,
    action: 'update',
    entity: 'value',
    entityId: `val_test_${made}`,
    before: null,
    after: null,
    summary: 'Updated the value for 2026-10-12',
    ...over,
  };
}

const money = (amountMinor: number, currency: string) => ({ amountMinor, currency });

const EMPTY_PACK = {
  examples: {},
  meaning: {},
  cadenceDays: {},
  defaults: {},
  questions: {},
  checklist: [],
};

/**
 * A fictional chain: an imaginary country that labels cash "Current account" and adds the pack
 * type `auto_loan`, then generic, which labels every universal type "Label <universal>".
 */
const CHAIN: readonly VersionedPack[] = [
  {
    ...EMPTY_PACK,
    id: 'qz',
    version: 1,
    locale: 'en-GB',
    currency: 'EUR',
    labels: { cash: 'Current account' },
    types: [{ key: 'auto_loan', u: 'loan', label: 'Auto loan' }],
  },
  {
    ...EMPTY_PACK,
    id: 'generic',
    version: 1,
    locale: null,
    currency: null,
    labels: Object.fromEntries(UNIVERSALS.map((u) => [u, `Label ${u}`])),
    types: [],
  },
];

const typeSide = (universal: string, packTypeKey: string | null, customName: string | null) => ({
  id: 'typ_1',
  universal,
  packTypeKey,
  customName,
  sort: 0,
  archived: false,
});

/** The detail beneath an entry, as the screen reads it through the chain. */
const detail = (e: AuditEntry) => describeChange(e, CHAIN);

describe('groupActivity', () => {
  it('groups consecutive entries of one turn and leaves the rest standing alone', () => {
    const groups = groupActivity([
      entry({ id: 'aud_3', batchId: 'bat_1' }),
      entry({ id: 'aud_2', batchId: 'bat_1' }),
      entry({ id: 'aud_1', batchId: null }),
    ]);
    expect(groups).toHaveLength(2);
    const [turn, single] = groups;
    expect(turn?.kind).toBe('turn');
    if (turn?.kind !== 'turn' || single?.kind !== 'single') throw new Error('misgrouped');
    expect(turn.batchId).toBe('bat_1');
    expect(turn.entries.map((e) => e.id)).toStrictEqual(['aud_3', 'aud_2']);
    expect(single.entry.id).toBe('aud_1');
  });

  it('splits a turn an entry interrupts, so the list stays newest first', () => {
    const groups = groupActivity([
      entry({ id: 'aud_3', batchId: 'bat_1' }),
      entry({ id: 'aud_2', batchId: null }),
      entry({ id: 'aud_1', batchId: 'bat_1' }),
    ]);
    expect(groups.map((g) => g.kind)).toStrictEqual(['turn', 'single', 'turn']);
  });

  it('names the turn’s writer', () => {
    const group = groupActivity([
      entry({ batchId: 'bat_1', actor: 'agent', clientName: 'Claude' }),
      entry({ batchId: 'bat_1', actor: 'agent', clientName: 'Claude' }),
    ])[0];
    if (group?.kind !== 'turn') throw new Error('misgrouped');
    expect(turnClient(group)).toBe('Claude');
    expect(group.entries).toHaveLength(2);
  });
});

describe('describeChange', () => {
  it('reads a value update old → new, the currency once', () => {
    const text = detail(entry({ before: money(5_000_000, 'SGD'), after: money(6_750_000, 'SGD') }));
    expect(text).toContain('→');
    expect(text).toContain('SGD');
    expect(text?.match(/SGD/g)).toHaveLength(1);
  });

  it('names each currency when a value moves between them', () => {
    const text = detail(entry({ before: money(5_000_000, 'USD'), after: money(6_750_000, 'SGD') }));
    expect(text).toContain('USD');
    expect(text).toContain('SGD');
  });

  it('reads a recorded or deleted value as the one amount', () => {
    expect(
      detail(entry({ action: 'create', before: null, after: money(100_000, 'SGD') })),
    ).toContain('SGD');
    expect(
      detail(entry({ action: 'delete', before: money(100_000, 'SGD'), after: null })),
    ).toContain('SGD');
  });

  it('says nothing rather than guessing at a malformed side', () => {
    expect(detail(entry({ before: { nope: true }, after: money(1, 'SGD') }))).toBeNull();
    expect(detail(entry({ before: money(1, 'SGD'), after: 'elsewhere' }))).toBeNull();
  });

  it('reads a rename old → new, and nothing when the name did not move', () => {
    expect(
      detail(
        entry({ entity: 'holding', before: { name: 'Old name' }, after: { name: 'New name' } }),
      ),
    ).toBe('“Old name” → “New name”');
    expect(
      detail(entry({ entity: 'tag', before: { name: 'Same' }, after: { name: 'Same' } })),
    ).toBeNull();
  });

  it('reads a type rename by each side’s label in the chain', () => {
    const renamed = (before: unknown, after: unknown) =>
      detail(entry({ entity: 'type', entityId: 'typ_1', before, after }));
    // A pack type, by the pack's label; a plain type, by its universal type's label.
    expect(
      renamed(typeSide('loan', 'auto_loan', null), typeSide('loan', 'auto_loan', 'My car')),
    ).toBe('“Auto loan” → “My car”');
    expect(renamed(typeSide('cash', null, null), typeSide('cash', null, 'Petty'))).toBe(
      '“Current account” → “Petty”',
    );
    expect(renamed(typeSide('listed', null, null), typeSide('listed', null, 'Shares'))).toBe(
      '“Label listed” → “Shares”',
    );
    // A type the person named, by their names.
    expect(renamed(typeSide('other', null, 'Art'), typeSide('other', null, 'Paintings'))).toBe(
      '“Art” → “Paintings”',
    );
    // A pack key the chain lacks reads as its universal type; absent keys read as empty.
    expect(
      renamed(typeSide('loan', 'retired_key', null), typeSide('loan', 'retired_key', 'Old')),
    ).toBe('“Label loan” → “Old”');
    expect(renamed({ universal: 'cash' }, { universal: 'cash', customName: 'Petty' })).toBe(
      '“Current account” → “Petty”',
    );
  });

  it('says nothing for a type side it cannot read as a type', () => {
    const renamed = (before: unknown, after: unknown) =>
      detail(entry({ entity: 'type', entityId: 'typ_1', before, after }));
    const named = typeSide('cash', null, 'Petty');
    for (const side of [
      null,
      'a string',
      ['an', 'array'],
      {},
      { customName: 'No universal type' },
      typeSide('not_a_universal', null, 'Named'),
      { ...typeSide('cash', null, null), packTypeKey: 7 },
      { ...typeSide('cash', null, null), customName: { not: 'text' } },
    ]) {
      expect(renamed(side, named)).toBeNull();
      expect(renamed(named, side)).toBeNull();
    }
    // Both sides reading the same: no rename to show.
    expect(renamed(typeSide('cash', null, null), typeSide('cash', null, null))).toBeNull();
  });

  it('reads a short preference change, and stays quiet on a long one', () => {
    expect(
      detail(
        entry({
          entity: 'prefs',
          before: { key: 'baseline', value: '1m' },
          after: { key: 'baseline', value: '3m' },
        }),
      ),
    ).toBe('"1m" → "3m"');
    expect(
      detail(
        entry({
          entity: 'prefs',
          before: { key: 'home_filter', value: { a: 'x'.repeat(30) } },
          after: { key: 'home_filter', value: { a: 'y'.repeat(30) } },
        }),
      ),
    ).toBeNull();
  });

  it('reads a default-currency change as the number of values it recalculated', () => {
    const change = (after: unknown) =>
      detail(
        entry({
          entity: 'ledger',
          action: 'update',
          before: { baseCurrency: 'SGD' },
          after,
          summary: 'Changed the default currency SGD → USD',
        }),
      );
    expect(change({ baseCurrency: 'USD', valuesRederived: 12 })).toBe('12 values recalculated');
    expect(change({ baseCurrency: 'USD', valuesRederived: 1 })).toBe('1 value recalculated');
    // Nothing to recalculate, or an entry from before the count was kept: the summary says it.
    expect(change({ baseCurrency: 'USD', valuesRederived: 0 })).toBeNull();
    expect(change({ baseCurrency: 'USD' })).toBeNull();
    expect(change({ baseCurrency: 'USD', valuesRederived: 'many' })).toBeNull();
  });

  it('leaves what the summary already says to the summary', () => {
    expect(detail(entry({ entity: 'ledger', action: 'update' }))).toBeNull();
    expect(detail(entry({ entity: 'ledger', action: 'create' }))).toBeNull();
    expect(detail(entry({ entity: 'connection', action: 'create' }))).toBeNull();
    expect(detail(entry({ entity: 'holding', action: 'create' }))).toBeNull();
  });
});

describe('entrySummary', () => {
  const value = (action: AuditEntry['action'], summary: string) =>
    entry({ entity: 'value', action, summary });

  it('reads a value’s date as the screen reads every other date', () => {
    expect(entrySummary(value('create', 'Recorded a value for 2026-05-20'), 'en-US')).toBe(
      'Recorded a value for May 20, 2026',
    );
    expect(entrySummary(value('update', 'Updated the value for 2026-05-20'), 'en-GB')).toBe(
      'Updated the value for 20 May 2026',
    );
    expect(entrySummary(value('delete', 'Deleted the value for 2026-05-20'))).toBe(
      `Deleted the value for ${formatDate('2026-05-20')}`,
    );
  });

  it('leaves every other summary as it is', () => {
    const others = [
      entry({ entity: 'holding', action: 'create', summary: 'Added "Bought 2026-05-20"' }),
      entry({ entity: 'type', action: 'create', summary: 'Added type "Auto loan"' }),
      entry({ entity: 'connection', action: 'create', summary: 'Agent disconnected' }),
      // A value whose date could not be read, or is no calendar date.
      value('create', 'Recorded a value for a date'),
      value('create', 'Recorded a value for 2026-02-30'),
    ];
    for (const other of others) expect(entrySummary(other, 'en-US')).toBe(other.summary);
  });
});

describe('actorLabel', () => {
  it('names the agent, the person, NetNet, and the disconnected agent', () => {
    expect(actorLabel(entry({ actor: 'agent', clientName: 'Claude' }))).toBe('Claude');
    expect(actorLabel(entry({ actor: 'agent', clientName: null }))).toBe('An agent');
    expect(actorLabel(entry({ actor: 'user' }))).toBe('You');
    expect(actorLabel(entry({ actor: 'system' }))).toBe('NetNet');
    expect(actorLabel(entry({ entity: 'connection', clientName: 'Claude' }))).toBe('Claude');
  });
});

describe('formatInstant', () => {
  it('gives the timestamp, not a relative time', () => {
    const text = formatInstant('2026-10-12T13:14:00.000Z');
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/12/);
    expect(text).not.toMatch(/ago/);
  });
});
