import { describe, expect, it } from 'vitest';
import {
  ERASED_WITHIN_DAYS,
  ONBOARDING_STATES,
  accountDeletionSchema,
  canonicalTimeZone,
  geoSchema,
  profilePatchSchema,
  profileSchema,
  reminderTokenSchema,
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
  it('accepts any of its five fields, alone or together, and nothing at all', () => {
    expect(profilePatchSchema.parse({})).toStrictEqual({});
    expect(profilePatchSchema.parse({ baseCurrency: 'eur' })).toStrictEqual({
      baseCurrency: 'EUR',
    });
    expect(
      profilePatchSchema.parse({
        country: 'SG',
        baseCurrency: 'SGD',
        segment: 'starting_out',
        timeZone: 'europe/london',
        onboardingState: 'done',
      }),
    ).toStrictEqual({
      country: 'SG',
      baseCurrency: 'SGD',
      segment: 'starting_out',
      timeZone: 'Europe/London',
      onboardingState: 'done',
    });
  });

  it.each([
    [{ country: 'sg' }, 'country'],
    [{ country: 'SGP' }, 'country'],
    [{ country: null }, 'country'],
    [{ baseCurrency: 'ZZZ' }, 'baseCurrency'],
    [{ baseCurrency: 'US' }, 'baseCurrency'],
    [{ baseCurrency: null }, 'baseCurrency'],
    [{ segment: 'rich' }, 'segment'],
    [{ timeZone: 'Nowhere/Land' }, 'timeZone'],
    [{ onboardingState: 'onboard' }, 'onboardingState'],
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

  it('list the onboarding steps in order', () => {
    expect(ONBOARDING_STATES).toStrictEqual(['country', 'segment', 'start', 'basics', 'done']);
  });
});

describe('reminderTokenSchema', () => {
  it('accepts the token and refuses anything around it', () => {
    expect(reminderTokenSchema.parse({ token: 'r1.payload.sig' })).toStrictEqual({
      token: 'r1.payload.sig',
    });
    expect(reminderTokenSchema.safeParse({}).success).toBe(false);
    expect(reminderTokenSchema.safeParse({ token: '' }).success).toBe(false);
    expect(reminderTokenSchema.safeParse({ token: 'x'.repeat(1025) }).success).toBe(false);
    expect(reminderTokenSchema.safeParse({ token: 'r1.a.b', extra: 1 }).success).toBe(false);
    expect(reminderTokenSchema.safeParse({ token: 42 }).success).toBe(false);
  });
});

describe('accountDeletionSchema', () => {
  it('is the 30-day window, restated (PRD J10)', () => {
    expect(ERASED_WITHIN_DAYS).toBe(30);
    expect(accountDeletionSchema.parse({ erasedWithinDays: 30 })).toStrictEqual({
      erasedWithinDays: 30,
    });
    expect(accountDeletionSchema.safeParse({}).success).toBe(false);
    expect(accountDeletionSchema.safeParse({ erasedWithinDays: 7 }).success).toBe(false);
    expect(accountDeletionSchema.safeParse({ erasedWithinDays: 30, extra: 1 }).success).toBe(false);
  });
});
