import { z } from 'zod';
import { countryCodeSchema } from './content';
import { segmentSchema } from './events';

/**
 * The account's own REST contracts (architecture §7.2): `GET /api/geo`, and `GET` and `PATCH
 * /api/me`, the profile every request needs (§6.2).
 */

/** Where onboarding resumes (PRD J1): the steps in order, then Home. */
export const ONBOARDING_STATES = ['country', 'segment', 'start', 'basics', 'done'] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];
export const onboardingStateSchema = z.enum(ONBOARDING_STATES);

const MAX_TIME_ZONE_LENGTH = 64;

/** The IANA zone `value` names, in its canonical spelling, or null when it names none. */
export function canonicalTimeZone(value: string): string | null {
  if (value === '' || value.length > MAX_TIME_ZONE_LENGTH) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** An IANA time zone such as `Asia/Singapore`, as the browser reports it; stored canonically. */
export const timeZoneSchema = z
  .string()
  .refine(
    (value) => canonicalTimeZone(value) !== null,
    'Use an IANA time zone such as "Asia/Singapore", as the browser reports it.',
  )
  .transform((value) => canonicalTimeZone(value) ?? value);

/** `GET /api/me`, and what `PATCH /api/me` answers with. */
export const profileSchema = z.strictObject({
  email: z.string(),
  emailVerified: z.boolean(),
  /** Null until the person confirms where they live. */
  country: countryCodeSchema.nullable(),
  /** Null until the ledger exists, which the first confirmed country makes. */
  baseCurrency: z.string().nullable(),
  segment: segmentSchema,
  timeZone: z.string(),
  onboardingState: onboardingStateSchema,
});
export type ProfileView = z.infer<typeof profileSchema>;

/**
 * `PATCH /api/me`. Every field is optional. `country` must be on the country list (with or without
 * a pack); `segment` is accepted only while it is `unknown` (it is set once, PRD §3.5).
 */
export const profilePatchSchema = z.strictObject({
  country: countryCodeSchema.exactOptional(),
  segment: segmentSchema.exactOptional(),
  timeZone: timeZoneSchema.exactOptional(),
  onboardingState: onboardingStateSchema.exactOptional(),
});
export type ProfilePatch = z.input<typeof profilePatchSchema>;

/** `GET /api/geo`: the country the request came from, by our CDN's IP lookup (PRD §2.3 rule 2). */
export const geoSchema = z.strictObject({ country: countryCodeSchema.nullable() });
export type Geo = z.infer<typeof geoSchema>;
