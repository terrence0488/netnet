import type { DemoHousehold, PackRef } from '@netnet/contracts';
import { sql } from 'drizzle-orm';
import { createContentStore, databaseContent } from '../content/store';
import type { Fx } from '../content/fx';
import { ledgerContent } from '../ledger/content';
import { DemoRefused, HAS_HOLDINGS, hasHoldings, loadHousehold } from '../ledger/demo';
import type { LedgerOptions } from '../ledger/ledger';
import { createWithUser } from '../ledger/with-user';
import { AppError } from '../lib/errors';
import type { Database } from './client';
import { ensureProfile, updateProfile } from './profiles';
import { user } from './schema';

export { DemoRefused, type LoadedHousehold } from '../ledger/demo';

/**
 * `pnpm demo:load` (P4-T1): the fictional demo household into the verified account with an email,
 * on any environment. It runs as `netnet_app`, like the app, so the grants and row-level security
 * apply to it. The account must have no holding; it is then set to the household's country as
 * onboarding would set it (onboarding done, the segment if none was given), and the household is
 * written through the Ledger as `system`, all or nothing (`loadHousehold`).
 */

/** Every value in the household gives its rate; a lookup means the file is not what was checked. */
const NO_RATES: Fx = {
  crossRate: () =>
    Promise.reject(
      new DemoRefused(
        'A value gives no rate of its own, so a published one would be looked up: run pnpm content:check. Nothing was written.',
      ),
    ),
};

/** The account with `email` (any case), or null when there is none. */
async function accountByEmail(
  db: Database,
  email: string,
): Promise<{ userId: string; emailVerified: boolean } | null> {
  const rows = await db
    .select({ userId: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(sql`lower(${user.email}) = lower(${email.trim()})`)
    .limit(1);
  return rows[0] ?? null;
}

export interface DemoLoadOptions {
  /** The clock the Ledger's writes run on; tests pass a fixed one. */
  clock?: () => Date;
}

/**
 * Loads `household` into the account with `email`, or refuses (`DemoRefused`) with nothing
 * written: no such account, an email not verified, an account that already has holdings, or
 * content not published on this database. Returns counts only.
 */
export async function loadDemoHousehold(
  db: Database,
  household: DemoHousehold,
  email: string,
  opts: DemoLoadOptions = {},
) {
  const clock = opts.clock ?? (() => new Date());
  const account = await accountByEmail(db, email);
  if (!account) {
    throw new DemoRefused(
      'No account has that email address: sign up with it first. Nothing was written.',
    );
  }
  if (!account.emailVerified) {
    throw new DemoRefused(
      'That account has not verified its email address: verify it first. Nothing was written.',
    );
  }
  const withUser = createWithUser(() => ({ db, clock }));
  if (await hasHoldings(withUser, account.userId)) throw new DemoRefused(HAS_HOLDINGS);

  const profile = await ensureProfile(db, account.userId);
  const options: LedgerOptions = {
    fx: NO_RATES,
    content: ledgerContent(
      createContentStore({ source: databaseContent(() => db) }),
      household.country,
    ),
    timeZone: profile.timeZone,
  };
  let pack: PackRef;
  try {
    pack = (await options.content.chain()).map((p) => ({ key: p.id, version: p.version }));
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    throw new DemoRefused(
      'The content is not published on this database: run pnpm content:publish first. Nothing was written.',
      { cause: error },
    );
  }

  // As onboarding does: the profile first, then the ledger in the country's currency and types.
  await updateProfile(db, account.userId, {
    country: household.country,
    onboardingState: 'done',
    ...(profile.segment === 'unknown' ? { segment: household.segment } : {}),
  });
  return loadHousehold(withUser, options, account.userId, household, pack);
}
