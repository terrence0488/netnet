import type { AuditEntry } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import {
  actorLabel,
  conflictBlockers,
  conflictCopy,
  describeChange,
  formatInstant,
  groupActivity,
  turnClient,
  undoableOf,
  undoFailureCopy,
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
    undoes: null,
    undoneBy: null,
    summary: 'Updated the value for 2026-10-12',
    ...over,
  };
}

const money = (amountMinor: number, currency: string) => ({ amountMinor, currency });

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

  it('names the turn’s writer and counts what still stands', () => {
    const group = groupActivity([
      entry({ batchId: 'bat_1', actor: 'agent', clientName: 'Claude' }),
      entry({ batchId: 'bat_1', actor: 'agent', clientName: 'Claude', undoneBy: 'aud_x' }),
    ])[0];
    if (group?.kind !== 'turn') throw new Error('misgrouped');
    expect(turnClient(group)).toBe('Claude');
    expect(undoableOf(group)).toHaveLength(1);
  });
});

describe('describeChange', () => {
  it('reads a value update old → new, the currency once', () => {
    const text = describeChange(
      entry({ before: money(5_000_000, 'SGD'), after: money(6_750_000, 'SGD') }),
    );
    expect(text).toContain('→');
    expect(text).toContain('SGD');
    expect(text?.match(/SGD/g)).toHaveLength(1);
  });

  it('names each currency when a value moves between them', () => {
    const text = describeChange(
      entry({ before: money(5_000_000, 'USD'), after: money(6_750_000, 'SGD') }),
    );
    expect(text).toContain('USD');
    expect(text).toContain('SGD');
  });

  it('reads a recorded or deleted value as the one amount', () => {
    expect(
      describeChange(entry({ action: 'create', before: null, after: money(100_000, 'SGD') })),
    ).toContain('SGD');
    expect(
      describeChange(entry({ action: 'delete', before: money(100_000, 'SGD'), after: null })),
    ).toContain('SGD');
  });

  it('says nothing rather than guessing at a malformed side', () => {
    expect(describeChange(entry({ before: { nope: true }, after: money(1, 'SGD') }))).toBeNull();
    expect(describeChange(entry({ before: money(1, 'SGD'), after: 'elsewhere' }))).toBeNull();
  });

  it('reads a rename old → new, and nothing when the name did not move', () => {
    expect(
      describeChange(
        entry({ entity: 'holding', before: { name: 'Old name' }, after: { name: 'New name' } }),
      ),
    ).toBe('“Old name” → “New name”');
    expect(
      describeChange(entry({ entity: 'tag', before: { name: 'Same' }, after: { name: 'Same' } })),
    ).toBeNull();
    expect(
      describeChange(
        entry({
          entity: 'type',
          before: { universal: 'cash' },
          after: { universal: 'cash', customName: 'Petty' },
        }),
      ),
    ).toBe('“cash” → “Petty”');
  });

  it('reads a short preference change, and stays quiet on a long one', () => {
    expect(
      describeChange(
        entry({
          entity: 'prefs',
          before: { key: 'baseline', value: '1m' },
          after: { key: 'baseline', value: '3m' },
        }),
      ),
    ).toBe('"1m" → "3m"');
    expect(
      describeChange(
        entry({
          entity: 'prefs',
          before: { key: 'home_filter', value: { a: 'x'.repeat(30) } },
          after: { key: 'home_filter', value: { a: 'y'.repeat(30) } },
        }),
      ),
    ).toBeNull();
  });

  it('leaves what the summary already says to the summary', () => {
    expect(describeChange(entry({ entity: 'ledger', action: 'update' }))).toBeNull();
    expect(describeChange(entry({ entity: 'connection', action: 'create' }))).toBeNull();
    expect(describeChange(entry({ entity: 'holding', action: 'create' }))).toBeNull();
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

describe('conflictBlockers', () => {
  const conflict = (blockers: unknown) =>
    new ApiError({ code: 'UNDO_CONFLICT', status: 409, message: 'blocked', details: { blockers } });

  it('reads the later changes newest first', () => {
    expect(
      conflictBlockers(
        conflict([
          { entry_id: 'aud_new', action: 'update', at: '2026-10-12T13:00:00.000Z' },
          { entry_id: 'aud_old', action: 'update', at: '2026-10-12T12:00:00.000Z' },
        ]),
      ),
    ).toStrictEqual(['aud_new', 'aud_old']);
  });

  it('reads nothing from anything else', () => {
    expect(
      conflictBlockers(new ApiError({ code: 'NETWORK', status: 0, message: 'down' })),
    ).toStrictEqual([]);
    expect(conflictBlockers(conflict(undefined))).toStrictEqual([]);
    expect(conflictBlockers(conflict([{ entry_id: 7 }]))).toStrictEqual([]);
  });
});

describe('conflictCopy', () => {
  it('names the later change and offers to undo it first, never an id', () => {
    const copy = conflictCopy(entry({ id: 'aud_9', summary: 'Updated the value for 2026-10-12' }));
    expect(copy.title).toContain('Updated the value for 2026-10-12');
    expect(copy.title).toContain('Undo that first');
    expect(copy.action).toContain('Updated the value for 2026-10-12');
    expect(copy.title).not.toContain('aud_9');
    expect(copy.action).not.toContain('aud_9');
  });

  it('falls back to a newer change when it is not on the loaded page', () => {
    const copy = conflictCopy(undefined);
    expect(copy.title).toContain('a newer change');
    expect(copy.action).toBe('Undo the newer change first');
  });
});

describe('undoFailureCopy', () => {
  it('says a disconnection stays, with the way back', () => {
    const copy = undoFailureCopy(
      new ApiError({ code: 'VALIDATION_FAILED', status: 400, message: 'no' }),
      entry({ entity: 'connection' }),
    );
    expect(copy.title).toBe('This change can’t be undone.');
    expect(copy.detail).toContain('Agent tab');
  });

  it('says other unundoable changes stay as they are', () => {
    const copy = undoFailureCopy(
      new ApiError({ code: 'VALIDATION_FAILED', status: 400, message: 'no' }),
      entry({ entity: 'ledger' }),
    );
    expect(copy.detail).toContain('stay as they are');
  });

  it('leaves anything else to the shared words', () => {
    const copy = undoFailureCopy(
      new ApiError({ code: 'NETWORK', status: 0, message: 'down' }),
      entry(),
    );
    expect(copy.title).toBe('NetNet can’t be reached.');
  });
});
