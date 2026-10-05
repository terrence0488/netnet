import type { ProfileView } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { destinationFor, loginPath, safeNext } from './guards';
import { handoffOf } from './handoff';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: false,
  country: null,
  baseCurrency: null,
  segment: 'unknown',
  timeZone: 'UTC',
  onboardingState: 'country',
};

describe('safeNext()', () => {
  it('keeps one of the app’s own screens', () => {
    expect(safeNext('/agent')).toBe('/agent');
    expect(safeNext('/connect/approve?client_id=abc')).toBe('/connect/approve?client_id=abc');
  });

  it('refuses another origin, a sign-in screen, and nothing', () => {
    for (const value of [
      null,
      '',
      'agent',
      'https://elsewhere.example',
      '//elsewhere.example/path',
      '/\\elsewhere.example',
      '/login',
      '/login?next=%2Fagent',
      '/signup/password',
      '/forgot',
    ]) {
      expect(safeNext(value), String(value)).toBeNull();
    }
  });
});

describe('loginPath()', () => {
  it('remembers the screen asked for, except Home', () => {
    expect(loginPath({ pathname: '/agent', search: '' })).toBe('/login?next=%2Fagent');
    expect(loginPath({ pathname: '/connect/approve', search: '?a=1' })).toBe(
      '/login?next=%2Fconnect%2Fapprove%3Fa%3D1',
    );
    expect(loginPath({ pathname: '/', search: '' })).toBe('/login');
  });
});

describe('destinationFor()', () => {
  it('resumes onboarding where it was left, whatever was asked for', () => {
    expect(destinationFor(PERSON, '/agent')).toBe('/onboarding/country');
    expect(destinationFor({ ...PERSON, onboardingState: 'segment' }, null)).toBe(
      '/onboarding/segment',
    );
  });

  it('goes to the screen asked for once onboarding is done, else Home', () => {
    const done = { ...PERSON, onboardingState: 'done' } as const;
    expect(destinationFor(done, '/agent')).toBe('/agent');
    expect(destinationFor(done, '//elsewhere.example')).toBe('/');
    expect(destinationFor(done, null)).toBe('/');
  });
});

describe('handoffOf()', () => {
  it('reads only what one screen may hand the next', () => {
    expect(handoffOf({ email: 'avery@example.com', notice: 'existing', extra: 1 })).toStrictEqual({
      email: 'avery@example.com',
      notice: 'existing',
    });
    expect(handoffOf({ notice: 'anything', email: 42 })).toStrictEqual({});
    expect(handoffOf(null)).toStrictEqual({});
    expect(handoffOf('text')).toStrictEqual({});
  });
});
