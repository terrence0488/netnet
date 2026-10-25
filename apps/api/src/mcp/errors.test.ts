import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEAKS,
  captureLog,
  drizzleFailure,
  plainFailure,
  type CapturedLog,
} from '../../test/support/failures';
import { ConnectionRevoked } from '../ledger/with-user';
import { AppError } from '../lib/errors';
import { renameText, toMcpError } from './errors';

const REQUEST_ID = 'req_01K1G4KX00AAAAAAAAAAAAAAAA';

let log: CapturedLog;

beforeEach(() => {
  log = captureLog();
});

afterEach(() => vi.restoreAllMocks());

describe('toMcpError()', () => {
  it('logs an unexpected error with its class and SQLSTATE, and answers INTERNAL', () => {
    const failed = toMcpError(drizzleFailure(), {}, REQUEST_ID, 'record_values');
    expect(failed.code).toBe('INTERNAL');
    expect(failed.body.error).toMatchObject({ code: 'INTERNAL', requestId: REQUEST_ID });
    expect(log.of('tool_failed')).toStrictEqual([
      {
        event: 'tool_failed',
        requestId: REQUEST_ID,
        tool: 'record_values',
        errorCode: 'INTERNAL',
        errorName: 'DrizzleQueryError',
        pgCode: '23505',
      },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
    expect(JSON.stringify(failed.body)).not.toMatch(LEAKS);
  });

  it('names an error with no SQLSTATE by its class alone', () => {
    toMcpError(plainFailure(), {}, REQUEST_ID, 'get_holding');
    expect(log.of('tool_failed')).toStrictEqual([
      {
        event: 'tool_failed',
        requestId: REQUEST_ID,
        tool: 'get_holding',
        errorCode: 'INTERNAL',
        errorName: 'TypeError',
      },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });

  it('logs nothing for a deliberate error or a revoked connection', () => {
    const notFound = toMcpError(
      new AppError('NOT_FOUND', 'No holding has that id.'),
      {},
      REQUEST_ID,
      'get_holding',
    );
    expect(notFound.code).toBe('NOT_FOUND');
    const revoked = toMcpError(new ConnectionRevoked('con_1'), {}, REQUEST_ID, 'get_holding');
    expect(revoked.code).toBe('UNAUTHENTICATED');
    expect(log.of('tool_failed')).toStrictEqual([]);
  });

  it('leaves the paths of arguments the tool’s schema refused as the agent sent them', () => {
    const refused = new AppError('VALIDATION_FAILED', 'values[0].fxRate: Not a field.', {
      fields: { 'values[0].fxRate': 'Not a field.' },
    });
    const asSent = toMcpError(refused, null, REQUEST_ID, 'record_values');
    expect(asSent.body.error).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: 'values[0].fxRate: Not a field.',
      fields: { 'values[0].fxRate': 'Not a field.' },
    });
    const fromLedger = toMcpError(refused, {}, REQUEST_ID, 'record_values');
    expect(fromLedger.body.error.fields).toStrictEqual({ 'values[0].fx_rate': 'Not a field.' });
  });

  it('renames the Ledger’s paths in the message as in fields, and leaves the error as it was', () => {
    const missing = 'There is no holding "hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ" in this account.';
    const ledger = new AppError(
      'NOT_FOUND',
      `values[1].holdingId: ${missing} values[2].fxRate: Leave fxRate out. values[3].holdingId: ${missing} (4 problems; see fields.)`,
      {
        fields: {
          'values[1].holdingId': missing,
          'values[2].fxRate': 'Leave fxRate out.',
          'values[3].holdingId': missing,
          'values[4].holdingId': missing,
        },
      },
    );
    const failed = toMcpError(ledger, {}, REQUEST_ID, 'record_values');
    expect(failed.body.error).toStrictEqual({
      code: 'NOT_FOUND',
      message: `values[1].holding_id: ${missing} values[2].fx_rate: Leave fx_rate out. values[3].holding_id: ${missing} (4 problems; see fields.)`,
      fields: {
        'values[1].holding_id': missing,
        'values[2].fx_rate': 'Leave fx_rate out.',
        'values[3].holding_id': missing,
        'values[4].holding_id': missing,
      },
    });
    expect(ledger.message).toMatch(/^values\[1\]\.holdingId: /);
    expect(ledger.details?.fields).toHaveProperty('values[2].fxRate', 'Leave fxRate out.');
  });

  it('renames a message’s paths in the tool’s words, and nothing else', () => {
    const failed = toMcpError(
      new AppError(
        'LIKELY_DUPLICATE',
        'This looks like a holding already tracked (candidates). Create it anyway with allowDuplicate.',
        { candidates: [] },
      ),
      {},
      REQUEST_ID,
      'create_holding',
    );
    expect(failed.body.error.message).toBe(
      'This looks like a holding already tracked (candidates). Create it anyway with allow_duplicate.',
    );
  });
});

describe('renameText()', () => {
  const holding = {
    access: 'access_answer',
    opening: 'opening_value',
    universal: 'universal_type',
  };

  it('renames a path at the start, with its indexes and nested segments', () => {
    expect(renameText('values[12].holdingId: Give one.', {})).toBe(
      'values[12].holding_id: Give one.',
    );
    expect(renameText('opening.fxRate: Leave it out.', holding)).toBe(
      'opening_value.fx_rate: Leave it out.',
    );
    expect(renameText('tagIds[0]: There is no tag.', {})).toBe('tag_ids[0]: There is no tag.');
  });

  it('renames a whole path the tool names otherwise, and only that path', () => {
    const renames = { ...holding, 'opening.currency': 'currency' };
    expect(renameText('opening.currency: No rate. opening.date: Too late.', renames)).toBe(
      'currency: No rate. opening_value.date: Too late.',
    );
  });

  it('renames a path named further on, bare or in backticks', () => {
    expect(renameText('Its rate is 1: leave fxRate out.', {})).toBe(
      'Its rate is 1: leave fx_rate out.',
    );
    expect(
      renameText('A holding uses this type: give moveTo, the type.', {
        moveTo: 'move_holdings_to',
      }),
    ).toBe('A holding uses this type: give move_holdings_to, the type.');
    expect(renameText('Merge into it with deleteTag and mergeInto.', {})).toBe(
      'Merge into it with delete_tag and merge_into.',
    );
    expect(renameText('Give `opening.fxRate`, or leave `allowDuplicate` out.', holding)).toBe(
      'Give `opening_value.fx_rate`, or leave `allow_duplicate` out.',
    );
    expect(renameText('values[0] is for the same holding and date.', {})).toBe(
      'values[0] is for the same holding and date.',
    );
  });

  it('renames a field’s own name only where the message lists it', () => {
    const fields = new Set(['access', 'universal']);
    expect(
      renameText('access: A liability has no accessibility: leave access out.', holding, fields),
    ).toBe('access_answer: A liability has no accessibility: leave access out.');
    expect(
      renameText(
        'name: Taken. universal: A type keeps the universal type it was made with.',
        holding,
        fields,
      ),
    ).toBe('name: Taken. universal_type: A type keeps the universal type it was made with.');
    expect(renameText('The universal type: cash.', holding)).toBe('The universal type: cash.');
  });

  it('leaves quoted values, ids, codes, names and plain words as they are', () => {
    expect(
      renameText(
        '"notSure" does not answer "Is it in your bankAccount?" Use one of "now", "not_sure".',
        holding,
        new Set(['access']),
      ),
    ).toBe('"notSure" does not answer "Is it in your bankAccount?" Use one of "now", "not_sure".');
    const plain =
      'NetNet has no USD rate for 2026-08-31, e.g. YYYY-MM-DD (val_01K1G4KX00ZZZZZZZZZZZZZZZZZ). Give the opening amount or access.';
    expect(renameText(plain, holding)).toBe(plain);
  });
});
