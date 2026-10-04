import { newValuesSchema } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors';
import { FieldErrors, fieldPath, parseInput } from './input';
import { agentClientName } from './ledger';
import { todayIn } from './scope';
import { sameJson } from './write';

/** The Ledger's pure helpers; everything that touches the database is in apps/api/test/ledger. */

function thrown(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError');
}

describe('todayIn', () => {
  const at = new Date(Date.UTC(2026, 7, 1, 10));

  it('is the calendar date in the user’s time zone', () => {
    expect(todayIn('UTC', at)).toBe('2026-08-01');
    expect(todayIn('Pacific/Kiritimati', at)).toBe('2026-08-02');
    expect(todayIn('Pacific/Pago_Pago', new Date(Date.UTC(2026, 7, 1, 5)))).toBe('2026-07-31');
  });

  it('falls back to UTC for a zone it does not know', () => {
    expect(todayIn('Mars/Olympus_Mons', at)).toBe('2026-08-01');
  });
});

describe('fieldPath', () => {
  it('names a field the way an agent sends it', () => {
    expect(fieldPath('values', [3, 'amount'])).toBe('values[3].amount');
    expect(fieldPath(undefined, ['opening', 'amount'])).toBe('opening.amount');
    expect(fieldPath(undefined, ['tagIds', 2])).toBe('tagIds[2]');
    expect(fieldPath('values', [])).toBe('values');
    expect(fieldPath(undefined, [])).toBe('input');
  });
});

describe('FieldErrors and parseInput', () => {
  it('throws the first problem’s code, with every problem in fields and the first few in the message', () => {
    const errors = new FieldErrors();
    expect(errors.empty).toBe(true);
    errors.throwIfAny();
    errors.add('OUT_OF_RANGE', 'values[0].amount', 'Too many decimals.');
    errors.add('NOT_FOUND', 'values[1].holdingId', 'No such holding.');
    errors.add(
      'NOT_FOUND',
      'values[1].holdingId',
      'A second message for the same field is dropped.',
    );
    errors.add('VALIDATION_FAILED', 'values[2].date', 'Not a date.');
    errors.add('VALIDATION_FAILED', 'values[3].date', 'Not a date.');
    const error = thrown(() => errors.throwIfAny());
    expect(error.code).toBe('OUT_OF_RANGE');
    expect(error.details?.fields).toEqual({
      'values[0].amount': 'Too many decimals.',
      'values[1].holdingId': 'No such holding.',
      'values[2].date': 'Not a date.',
      'values[3].date': 'Not a date.',
    });
    expect(error.message).toBe(
      'values[0].amount: Too many decimals. values[1].holdingId: No such holding. values[2].date: Not a date. (4 problems; see fields.)',
    );
  });

  it('parses with a contract schema, naming bad fields under a root', () => {
    expect(parseInput(newValuesSchema, [{ holdingId: 'hld_1', amount: 1 }], 'values')).toEqual([
      { holdingId: 'hld_1', amount: 1 },
    ]);
    const error = thrown(() =>
      parseInput(
        newValuesSchema,
        [{ holdingId: 'hld_1', amount: 1, colour: 'red' }, { amount: 1 }],
        'values',
      ),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(error.details?.fields ?? {})).toEqual([
      'values[0].colour',
      'values[1].holdingId',
    ]);
  });
});

describe('agentClientName', () => {
  it('is the guide’s name for a classified connection, else the registered name, cut to 120 characters', () => {
    expect(agentClientName({ client: 'claude', clientName: 'Some desktop app' }, 'Claude')).toBe(
      'Claude',
    );
    expect(agentClientName({ client: 'chatgpt', clientName: 'Registered' }, undefined)).toBe(
      'Registered',
    );
    expect(agentClientName({ client: 'other', clientName: '  My agent  ' }, 'Claude')).toBe(
      'My agent',
    );
    expect(agentClientName({ client: 'other', clientName: '😀'.repeat(130) }, undefined)).toBe(
      '😀'.repeat(120),
    );
  });
});

describe('sameJson', () => {
  it('compares content whatever the order of keys', () => {
    expect(sameJson({ a: 1, b: [{ x: 1, y: 2 }] }, { b: [{ y: 2, x: 1 }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameJson(undefined, null)).toBe(false);
  });
});
