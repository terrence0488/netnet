import { profilePatchSchema, type Countries, type ProfileView } from '@netnet/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireSession } from '../auth/session';
import { database, type Executor } from '../db/client';
import { accountOf, ensureProfile, updateProfile, type Profile } from '../db/profiles';
import { COUNTRIES_KEY } from '../content/publish';
import { contentStore, type ContentStore } from '../content/store';
import { baseCurrencyOf } from '../ledger/base-currency';
import { appLedgerOptions } from '../ledger/content';
import { createWithLedger, type LedgerOptions } from '../ledger/ledger';
import { withUser, type WithUser } from '../ledger/with-user';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';

/**
 * `GET /api/me` and `PATCH /api/me` (architecture §7.2): the signed-in person's profile. The user
 * is the session's, never one named in the request (CONVENTIONS §3). The first country the person
 * confirms makes their ledger, in the same request.
 */

export interface MeDeps {
  db: () => Executor;
  /** The ledger's base currency, or null before the ledger exists. */
  baseCurrency: (userId: string) => Promise<string | null>;
  /** The live country list (content). */
  countries: () => Promise<Countries>;
  /**
   * Makes the person's ledger in `baseCurrency`, with their country's pack types (generic only
   * when it has no pack). Called on the first country confirmation; does nothing once it exists.
   */
  initLedger: (userId: string, profile: Profile, baseCurrency: string) => Promise<void>;
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

/**
 * `MeDeps.initLedger` over `withUser` and the person's Ledger options: `Ledger.init` with the pack
 * chain live now for their country (architecture §7.3), as the person.
 */
export function ledgerInit(
  withLedgerUser: WithUser,
  options: (profile: Profile) => LedgerOptions,
): MeDeps['initLedger'] {
  return async (userId, profile, baseCurrency) => {
    const ledgerOptions = options(profile);
    const chain = await ledgerOptions.content.chain();
    const pack = chain.map((p) => ({ key: p.id, version: p.version }));
    await createWithLedger(withLedgerUser, ledgerOptions)(
      userId,
      { kind: 'user' },
      (ledger) => ledger.init({ baseCurrency, pack }),
      { write: true },
    );
  };
}

const defaultDeps: MeDeps = {
  db: database,
  baseCurrency: (userId) => baseCurrencyOf(withUser, userId),
  countries: liveCountries(contentStore),
  initLedger: ledgerInit(withUser, appLedgerOptions),
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
      const countries = change.country === undefined ? undefined : await deps.countries();
      const country =
        change.country !== undefined && countries && Object.hasOwn(countries, change.country)
          ? countries[change.country]
          : undefined;
      if (change.country !== undefined && country === undefined) {
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
      // The first confirmed country makes the ledger, in its currency (PRD J1). A later change of
      // country leaves the ledger as it is (P3).
      if (country !== undefined && (await deps.baseCurrency(userId)) === null) {
        await deps.initLedger(userId, updated, country.currency);
      }
      return c.json(await view(deps, userId, updated));
    },
  );

  return routes;
}
