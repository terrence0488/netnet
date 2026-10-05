import { describe, expect, it } from 'vitest';
import { withoutSessionToken } from './auth';

describe('withoutSessionToken()', () => {
  it('takes the token out of sign-up and sign-in bodies, and keeps the rest', () => {
    expect(withoutSessionToken({ token: 'abc', user: { id: 'usr_1' } })).toStrictEqual({
      user: { id: 'usr_1' },
    });
    expect(
      withoutSessionToken({ redirect: false, token: 'abc', url: undefined, user: { id: 'u' } }),
    ).toStrictEqual({ redirect: false, url: undefined, user: { id: 'u' } });
  });

  it('takes it out of get-session’s session', () => {
    expect(
      withoutSessionToken({
        session: { id: 's', token: 'abc', expiresAt: 'x' },
        user: { id: 'u' },
      }),
    ).toStrictEqual({ session: { id: 's', expiresAt: 'x' }, user: { id: 'u' } });
  });

  it('leaves anything else as it is', () => {
    expect(withoutSessionToken(null)).toBeNull();
    expect(withoutSessionToken([1])).toStrictEqual([1]);
    expect(withoutSessionToken({ status: true })).toStrictEqual({ status: true });
  });
});
