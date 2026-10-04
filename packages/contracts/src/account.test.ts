import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STATES,
  canonicalTimeZone,
  geoSchema,
  profilePatchSchema,
  profileSchema,
  timeZoneSchema,
} from './account';

describe('timeZoneSchema', () => {
  it('accepts an IANA zone as the browser reports it, and stores its canonical spelling', () => {
    expect(timeZoneSchema.parse('Asia/Singapore')).toBe('Asia/Singapore');
    expect(timeZoneSchema.parse('asia/kuala_lumpur')).toBe('Asia/Kuala_Lumpur');
    expect(timeZoneSchema.parse('UTC')).toBe('UTC');
  });

  it.each(['', 'Mars/Olympus_Mons', 'GMT+25', `Asia/${'x'.repeat(70)}`])('refuses %j', (zone) => {
    expect(timeZoneSchema.safeParse(zone).success).toBe(false);
    expect(canonicalTimeZone(zone)).toBeNull();
  });
});

describe('profilePatchSchema', () => {
  it('accepts any of its four fields, alone or together, and nothing at all', () => {
    expect(profilePatchSchema.parse({})).toStrictEqual({});
    expect(
      profilePatchSchema.parse({
        country: 'SG',
        segment: 'starting_out',
        timeZone: 'europe/london',
        onboardingState: 'done',
      }),
    ).toStrictEqual({
      country: 'SG',
      segment: 'starting_out',
      timeZone: 'Europe/London',
      onboardingState: 'done',
    });
  });

  it.each([
    [{ country: 'sg' }, 'country'],
    [{ country: 'SGP' }, 'country'],
    [{ country: null }, 'country'],
    [{ segment: 'rich' }, 'segment'],
    [{ timeZone: 'Nowhere/Land' }, 'timeZone'],
    [{ onboardingState: 'basics' }, 'onboardingState'],
    [{ email: 'a@example.com' }, 'email'],
    [{ userId: 'usr_01K1G4KX00AAAAAAAAAAAAAAAA' }, 'userId'],
  ])('refuses %j, naming %s', (body, field) => {
    const result = profilePatchSchema.safeParse(body);
    expect(result.success).toBe(false);
    const named = result.error?.issues.flatMap((issue) =>
      issue.code === 'unrecognized_keys' ? issue.keys : issue.path.map(String),
    );
    expect(named).toContain(field);
  });
});

describe('profileSchema and geoSchema', () => {
  it('accept what GET /api/me and GET /api/geo answer', () => {
    const profile = {
      email: 'person@example.com',
      emailVerified: false,
      country: null,
      baseCurrency: null,
      segment: 'unknown',
      timeZone: 'UTC',
      onboardingState: 'country',
    };
    expect(profileSchema.parse(profile)).toStrictEqual(profile);
    expect(profileSchema.safeParse({ ...profile, extra: 1 }).success).toBe(false);
    expect(geoSchema.parse({ country: 'SG' })).toStrictEqual({ country: 'SG' });
    expect(geoSchema.parse({ country: null })).toStrictEqual({ country: null });
    expect(geoSchema.safeParse({ country: 'XXX' }).success).toBe(false);
  });

  it('list P1’s onboarding steps in order', () => {
    expect(ONBOARDING_STATES).toStrictEqual(['country', 'segment', 'done']);
  });
});
