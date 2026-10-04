import { profilePatchSchema, type Countries, type ProfileView } from '@netnet/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireSession } from '../auth/session';
import { database, type Executor } from '../db/client';
import { accountOf, ensureProfile, updateProfile, type Profile } from '../db/profiles';
import { COUNTRIES_KEY } from '../content/publish';
import { contentStore, type ContentStore } from '../content/store';
import { baseCurrencyOf } from '../ledger/base-currency';
import { withUser } from '../ledger/with-user';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';

/**
 * `GET /api/me` and `PATCH /api/me` (architecture §7.2): the signed-in person's profile. The user
 * is the session's, never one named in the request (CONVENTIONS §3).
 */

export interface MeDeps {
  db: () => Executor;
  /** The ledger's base currency, or null before the ledger exists. */
  baseCurrency: (userId: string) => Promise<string | null>;
  /** The live country list (content). */
  countries: () => Promise<Countries>;
}

/** A profile change is a few short fields. */
const MAX_BODY_BYTES = 1024;

/** The live country list. Its absence is our fault, never the caller's, so it is not NOT_FOUND. */
export function liveCountries(store: () => ContentStore): () => Promise<Countries> {
  return async () => {
    try {
      return (await store().getCurrent('countries', COUNTRIES_KEY)).body as Countries;
    } catch (error) {
      if (error instanceof AppError) {
        throw new Error('The country list is not published.', { cause: error });
      }
      throw error;
    }
  };
}

const defaultDeps: MeDeps = {
  db: database,
  baseCurrency: (userId) => baseCurrencyOf(withUser, userId),
  countries: liveCountries(contentStore),
};

function invalid(fields: Record<string, string>): AppError {
  return new AppError('VALIDATION_FAILED', 'The profile was not changed; fields says why.', {
    fields,
  });
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw invalid({ body: 'Send a JSON object, such as {"timeZone": "Asia/Singapore"}.' });
  }
}

/** The body as a profile change, or VALIDATION_FAILED naming each field to change. */
function parseChange(body: unknown) {
  const parsed = profilePatchSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        fields[key] = 'Remove it: send country, segment, timeZone or onboardingState.';
      }
    } else {
      fields[issue.path.map(String).join('.') || 'body'] = issue.message;
    }
  }
  throw invalid(fields);
}

async function view(deps: MeDeps, userId: string, profile?: Profile): Promise<ProfileView> {
  const db = deps.db();
  const [account, current, baseCurrency] = await Promise.all([
    accountOf(db, userId),
    profile ?? ensureProfile(db, userId),
    deps.baseCurrency(userId),
  ]);
  // The session outlived its account (deleted a moment ago): the same as no session.
  if (account === null) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first: there is no such account.');
  }
  return {
    email: account.email,
    emailVerified: account.emailVerified,
    country: current.country,
    baseCurrency,
    segment: current.segment,
    timeZone: current.timeZone,
    onboardingState: current.onboardingState,
  };
}

export function meRoutes(deps: MeDeps = defaultDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const { userId } = await requireSession(c);
    return c.json(await view(deps, userId));
  });

  routes.patch(
    '/',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw invalid({ body: `Send at most ${MAX_BODY_BYTES} bytes.` });
      },
    }),
    async (c) => {
      const { userId } = await requireSession(c);
      const change = parseChange(await readJson(c));
      if (change.country !== undefined && !Object.hasOwn(await deps.countries(), change.country)) {
        throw invalid({
          country: 'Choose a country from the list: an ISO 3166-1 code, such as "SG".',
        });
      }
      const updated = await updateProfile(deps.db(), userId, change);
      if (updated === null) {
        throw invalid({
          segment: 'It is set once, in onboarding, and cannot be changed now. Leave it out.',
        });
      }
      return c.json(await view(deps, userId, updated));
    },
  );

  return routes;
}
