import { describe, expect, it } from 'vitest';
import { problemOf } from './auth';

describe('problemOf()', () => {
  it('reads Better Auth’s own error bodies', () => {
    expect(problemOf(422, { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'x' })).toBe(
      'EXISTING_EMAIL',
    );
    expect(problemOf(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'x' })).toBe(
      'WRONG_PASSWORD',
    );
    expect(problemOf(400, { code: 'PASSWORD_TOO_SHORT' })).toBe('PASSWORD_TOO_SHORT');
    expect(problemOf(400, { code: 'PASSWORD_TOO_LONG' })).toBe('PASSWORD_TOO_LONG');
    expect(problemOf(400, { code: 'INVALID_TOKEN' })).toBe('INVALID_TOKEN');
    expect(
      problemOf(400, { code: 'VALIDATION_ERROR', message: '[body.email] Invalid email address' }),
    ).toBe('INVALID_EMAIL');
  });

  it('reads our own limits’ body, and a 429 without one', () => {
    expect(problemOf(429, { error: { code: 'RATE_LIMITED', message: 'x' } })).toBe('RATE_LIMITED');
    expect(problemOf(429, undefined)).toBe('RATE_LIMITED');
  });

  it('calls anything else our failure', () => {
    expect(problemOf(500, undefined)).toBe('SERVER');
    expect(problemOf(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })).toBe('SERVER');
    expect(problemOf(400, { code: 'SOMETHING_NEW' })).toBe('SERVER');
  });
});
