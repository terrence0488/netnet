import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_STATUS, errorBodySchema } from './errors';

describe('error codes', () => {
  it('maps every code in architecture §7.5 to its HTTP status', () => {
    expect(ERROR_STATUS).toStrictEqual({
      VALIDATION_FAILED: 400,
      OUT_OF_RANGE: 400,
      CURRENCY_UNSUPPORTED: 400,
      NOT_FOUND: 404,
      LIKELY_DUPLICATE: 409,
      UNDO_CONFLICT: 409,
      EMAIL_NOT_VERIFIED: 403,
      SCOPE_REQUIRED: 403,
      REAUTH_REQUIRED: 401,
      RATE_LIMITED: 429,
      INTERNAL: 500,
    });
    expect(ERROR_CODES).toHaveLength(11);
  });

  it('accepts an error body with fields and code-specific details', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Check the highlighted fields.',
        fields: { currency: 'Use a three-letter ISO 4217 code, such as SGD.' },
        candidates: [],
      },
    };
    expect(errorBodySchema.parse(body)).toStrictEqual(body);
  });

  it('rejects an unknown code and an empty message', () => {
    expect(
      errorBodySchema.safeParse({ error: { code: 'FORBIDDEN', message: 'No.' } }).success,
    ).toBe(false);
    expect(errorBodySchema.safeParse({ error: { code: 'NOT_FOUND', message: '' } }).success).toBe(
      false,
    );
  });
});
