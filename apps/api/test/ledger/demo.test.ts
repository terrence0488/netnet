import {
  demoHouseholdSchema,
  type ContextInput,
  type DemoHousehold,
  type FinancialContext,
  type VersionedPack,
} from '@netnet/contracts';
import { compileContext, periods } from '@netnet/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import householdJson from '../../../../content/demo/household.json' with { type: 'json' };
import { readContent } from '../../../../scripts/content-check';
import { main } from '../../../../scripts/demo-load';
import { publishContent } from '../../src/content/publish';
import { createContentStore, databaseContent } from '../../src/content/store';
import { DemoRefused, loadDemoHousehold } from '../../src/db/demo';
import { ledgerContent } from '../../src/ledger/content';
import { openLedger, type LedgerOptions } from '../../src/ledger/ledger';
import { seedLedger } from '../../src/ledger/seed';
import { createWithUser } from '../../src/ledger/with-user';
import { createTestDatabase, ensureAccount, type TestDatabase } from '../isolation/harness';
import { auditRows, rowCounts, type LedgerSuite } from './support';

/**
 * The demo household (P4-T1) loaded into an account against Postgres, as `demo:load` does: the
 * repository's household and content, published as `content:publish` would. It loads only into a
 * verified account with no holding, all or nothing, as `system`; it leaves every other account
 * alone; the loaded account shows every feature the household is for; and its context at the
 * household's end date is pinned byte for byte (content/demo/household.context.json, beside the
 * household, because it names the household's local schemes). Every name and figure is made up.
 */

const household: DemoHousehold = demoHouseholdSchema.parse(householdJson);
/** The morning after the household's end date, in Singapore. */
const LOADED_AT = new Date('2026-10-01T02:00:00Z');
const clock = () => LOADED_AT;
const META = { author: 'Fictional Author', sourceCommit: 'b'.repeat(40) };

let db: TestDatabase;
let users = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  const { docs, errors } = readContent();
  expect(errors).toStrictEqual([]);
  await publishContent(db.appDb, docs, META);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** A new account as sign-up makes it, verified unless told otherwise; its id and email. */
async function newAccount(verified = true): Promise<{ userId: string; email: string }> {
  users += 1;
  const userId = `usr_01K1G4KX00DEM0${String(users).padStart(12, '0')}`;
  const email = `Demo.Person.${users}@Example.com`;
  await db.owner.query(
    `insert into core."user" (id, name, email, email_verified) values ($1, '', $2, $3)`,
    [userId, email.toLowerCase(), verified],
  );
  await db.owner.query(
    `insert into core.profile (user_id, time_zone) values ($1, 'Asia/Singapore')`,
    [userId],
  );
  return { userId, email };
}

const load = (email: string, body: DemoHousehold = household) =>
  loadDemoHousehold(db.appDb, body, email, { clock });

/** What `rowCounts` and `auditRows` need of the Ledger suite: the owner's view. */
const owner = {
  rows: async <R extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
    (await db.owner.query<R>(text, params)).rows,
} as LedgerSuite;

async function one<R extends Record<string, unknown>>(text: string, params: unknown[]) {
  const [row] = await owner.rows<R>(text, params);
  if (!row) throw new Error(`no row for ${text}`);
  return row;
}

const profileOf = (userId: string) =>
  one<{ country: string | null; segment: string; onboarding_state: string }>(
    'select country, segment, onboarding_state from core.profile where user_id = $1',
    [userId],
  );

const ledgerOf = async (userId: string) =>
  (
    await owner.rows<{ base_currency: string; data_version: number }>(
      'select base_currency, data_version from ledger.ledger_state where user_id = $1',
      [userId],
    )
  )[0] ?? null;

/** The account's ledger as the app reads it, and the live chain, through `withUser`. */
async function contextOf(userId: string): Promise<{ data: ContextInput; chain: VersionedPack[] }> {
  const options: LedgerOptions = {
    fx: { crossRate: () => Promise.reject(new Error('no rate is looked up')) },
    content: ledgerContent(createContentStore({ source: databaseContent(() => db.appDb) }), 'SG'),
    timeZone: 'Asia/Singapore',
  };
  const withUser = createWithUser(() => ({ db: db.appDb, clock }));
  const data = await withUser(userId, { kind: 'user' }, (tx) => openLedger(tx, options).context());
  return { data, chain: [...(await options.content.chain())] };
}

/** Each holding's database id → its place in the file, for a golden file that is the same bytes on every run. */
async function stableIds(userId: string): Promise<Map<string, string>> {
  const rows = await owner.rows<{ id: string; name: string }>(
    'select id, name from ledger.holding where user_id = $1',
    [userId],
  );
  const place = new Map(household.holdings.map((h, i) => [h.name, i + 1]));
  return new Map(
    rows.map((r) => [r.id, `hld_demo_${String(place.get(r.name) ?? 0).padStart(2, '0')}`]),
  );
}

const totalValues = household.holdings.reduce((n, h) => n + h.values.length, 0);
const totalTagLinks = household.holdings.reduce((n, h) => n + (h.tags?.length ?? 0), 0);
const fileHolding = (predicate: (h: DemoHousehold['holdings'][number]) => boolean) => {
  const found = household.holdings.find(predicate);
  if (!found) throw new Error('the household has no such holding');
  return found;
};

describe('the demo household, loaded into a fresh account', () => {
  let userId: string;
  let email: string;
  let loaded: Awaited<ReturnType<typeof load>>;

  beforeAll(async () => {
    ({ userId, email } = await newAccount());
    loaded = await load(email);
  }, 60_000);

  it('returns counts only, and writes every holding, value and tag', async () => {
    expect(loaded).toStrictEqual({
      holdings: household.holdings.length,
      archived: 1,
      withoutValue: 1,
      values: totalValues,
      tags: household.tags.length,
    });
    expect(household.holdings.length).toBeGreaterThanOrEqual(18);
    expect(household.holdings.length).toBeLessThanOrEqual(24);
    const counts = await rowCounts(owner, userId);
    expect(counts).toMatchObject({
      ledger_state: 1,
      holding: household.holdings.length,
      value: totalValues,
      tag: household.tags.length,
      holding_tag: totalTagLinks,
      batch: 0,
    });
  });

  it('sets the country as onboarding would: SG, onboarding done, the segment, SGD and SG’s types', async () => {
    expect(await profileOf(userId)).toStrictEqual({
      country: 'SG',
      segment: 'established',
      onboarding_state: 'done',
    });
    const types = await owner.rows<{ universal: string; pack_type_key: string | null }>(
      'select universal, pack_type_key from ledger.user_type where user_id = $1',
      [userId],
    );
    expect(types.filter((t) => t.pack_type_key === null)).toHaveLength(12);
    expect(types.filter((t) => t.pack_type_key !== null)).toStrictEqual([
      { universal: 'loan', pack_type_key: 'car_loan' },
    ]);
    // One write for the ledger, one per tag, one per holding.
    expect(await ledgerOf(userId)).toStrictEqual({
      base_currency: 'SGD',
      data_version: 1 + household.tags.length + household.holdings.length,
    });
  });

  it('audits every row it wrote, as system, outside any agent batch', async () => {
    const audits = await auditRows(owner, userId);
    // The ledger, its 13 types (12 universal, SG's car loan), the tags, the holdings, the values
    // and the one holding archived.
    expect(audits).toHaveLength(
      1 + 13 + household.tags.length + household.holdings.length + totalValues + 1,
    );
    expect(new Set(audits.map((a) => a.actor))).toStrictEqual(new Set(['system']));
    expect(audits.every((a) => a.batch_id === null && a.connection_id === null)).toBe(true);
    expect(audits.filter((a) => a.entity === 'holding' && a.action === 'update')).toHaveLength(1);
  });

  it('keeps each value as dated in the file, with its own rate as given, written by system', async () => {
    const rows = await owner.rows<{
      name: string;
      date: string;
      amount_minor: string;
      currency: string;
      base_minor: string;
      fx_rate: string;
      fx_source: string;
      given_rate: string | null;
      given_rate_into: string | null;
      source: string;
    }>(
      `select h.name, v.date::text as date, v.amount_minor::text as amount_minor, v.currency,
              v.base_minor::text as base_minor, v.fx_rate::text as fx_rate, v.fx_source,
              v.given_rate::text as given_rate, v.given_rate_into, v.source
         from ledger.value v join ledger.holding h on h.user_id = v.user_id and h.id = v.holding_id
        where v.user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(totalValues);
    expect(new Set(rows.map((r) => r.source))).toStrictEqual(new Set(['system']));
    const stored = new Map(rows.map((r) => [`${r.name}|${r.date}`, r]));
    for (const h of household.holdings) {
      for (const v of h.values) {
        const row = stored.get(`${h.name}|${v.date}`);
        expect(row?.amount_minor, `${h.name} ${v.date}`).toBe(
          String(Math.round(Number(v.amount) * 100)),
        );
        if (v.fxRate === undefined) {
          expect(row).toMatchObject({ fx_source: 'same', fx_rate: '1', given_rate: null });
        } else {
          expect(Number(row?.given_rate)).toBe(Number(v.fxRate));
          expect(row).toMatchObject({ fx_source: 'user', given_rate_into: 'SGD' });
          expect(Number(row?.fx_rate)).toBe(Number(v.fxRate));
        }
      }
    }
    // An exact conversion, half away from zero: the account abroad's last value.
    const abroad = fileHolding((h) => h.currency === 'GBP');
    const last = abroad.values.at(-1);
    if (!last?.fxRate) throw new Error('the account abroad has a rate');
    const amountCents = BigInt(Math.round(Number(last.amount) * 100));
    const rateScaled = BigInt(last.fxRate.replace('.', ''));
    const scale = 10n ** BigInt(last.fxRate.split('.')[1]?.length ?? 0);
    const expected = (amountCents * rateScaled * 2n + scale) / (2n * scale);
    expect(stored.get(`${abroad.name}|${last.date}`)?.base_minor).toBe(String(expected));
  });

  it('applies each holding’s accessibility with the live SG pack, kept with its reason and until', async () => {
    const rows = await owner.rows<{
      name: string;
      access: string | null;
      access_until: string | null;
      archived: boolean;
    }>(
      `select name, access, access_until, archived_at is not null as archived
         from ledger.holding where user_id = $1`,
      [userId],
    );
    const byName = new Map(rows.map((r) => [r.name, r]));
    const expected: Record<string, [string | null, boolean]> = {
      cash: ['accessible', false],
      listed: ['accessible', false],
      crypto: ['accessible', false],
      vehicle: ['illiquid', false],
      retirement: ['locked', true],
      property: ['locked', true],
      equity: ['locked', true],
      wrapper: ['locked', true],
      other: ['undecided', false],
      mortgage: [null, false],
      loan: [null, false],
      card: [null, false],
    };
    for (const h of household.holdings) {
      const row = byName.get(h.name);
      const [access, until] = expected[h.universal] ?? [];
      expect(row?.access, h.name).toBe(access);
      expect(row?.access_until !== null, h.name).toBe(until);
      expect(row?.archived, h.name).toBe(h.archived === true);
    }
  });

  it('shows every feature the household is for, in its context at the end date', async () => {
    const { data, chain } = await contextOf(userId);
    const ctx = compileContext(data, chain, household.endDate);
    expect(ctx.as_of).toBe(household.endDate);
    expect(ctx.currency).toBe('SGD');
    // Could use: cash, listed and crypto; locked and undecided money is not in it.
    expect(ctx.totals.could_use).toBeGreaterThan(0);
    expect(ctx.totals.locked).toBeGreaterThan(ctx.totals.could_use);
    expect(ctx.totals.sell_first).toBeGreaterThan(0);
    expect(ctx.totals.undecided).toBeGreaterThan(0);
    expect(ctx.totals.net_worth).toBeGreaterThan(1_000_000);
    expect(ctx.holdings.some((h) => h.access === 'locked' && h.until !== null)).toBe(true);
    // The archived holding is left out; one undecided, one stale over 400 days, one with no value.
    expect(ctx.picture).toMatchObject({
      holdings: household.holdings.length - 1,
      stale: 1,
      undecided: 1,
      without_value: 1,
      freshness: 'some_stale',
    });
    expect(ctx.picture.oldest_value_days).toBeGreaterThan(400);
    expect(ctx.exposure.by_currency.map((c) => c.currency).sort()).toStrictEqual([
      'GBP',
      'MYR',
      'SGD',
      'USD',
    ]);
    expect(ctx.picture.notes).toHaveLength(5);
  });

  it('carries the months a holding was not updated in (J11)', async () => {
    const { data } = await contextOf(userId);
    const carried = (holdingIds?: readonly string[]) =>
      periods(
        data.values,
        holdingIds ? data.holdings.filter((h) => holdingIds.includes(h.id)) : data.holdings,
        'monthly',
        household.endDate,
      )
        .filter((p) => p.carried)
        .map((p) => p.start.slice(0, 7));
    const idOf = async (name: string) =>
      (
        await one<{ id: string }>(
          'select id from ledger.holding where user_id = $1 and name = $2',
          [userId, name],
        )
      ).id;

    // A gap in the middle of a holding's history: those months are carried on its own page.
    const gapped = fileHolding((h) => h.universal === 'listed' && h.currency === 'USD');
    expect(carried([await idOf(gapped.name)])).toStrictEqual(['2024-05', '2024-06']);
    // The stale holding is carried every month after its last value, everywhere it counts.
    const stale = fileHolding((h) => h.universal === 'vehicle');
    const lastStale = stale.values.at(-1)?.date ?? '';
    const afterStale = carried([await idOf(stale.name)]);
    expect(afterStale[0]).toBe('2025-08');
    expect(afterStale.at(-1)).toBe('2026-09');
    expect(lastStale < '2025-08-01').toBe(true);
    // The household: its gaps, then every month from the stale value on; never the first months.
    const all = carried();
    expect(all).toEqual(expect.arrayContaining(['2024-05', '2024-06', '2025-02', ...afterStale]));
    expect(all).not.toContain('2023-11');
  });

  it('pins its context at the end date byte for byte (golden)', async () => {
    const { data, chain } = await contextOf(userId);
    const ctx: FinancialContext = compileContext(data, chain, household.endDate);
    let golden = `${JSON.stringify(ctx, null, 2)}\n`;
    for (const [id, stable] of await stableIds(userId)) golden = golden.replaceAll(id, stable);
    expect(golden).not.toMatch(/hld_0/);
    await expect(golden).toMatchFileSnapshot('../../../../content/demo/household.context.json');
  });

  it('refuses a second load into the same account, and writes nothing', async () => {
    const before = {
      counts: await rowCounts(owner, userId),
      ledger: await ledgerOf(userId),
      audits: (await auditRows(owner, userId)).map((a) => a.id),
      profile: await profileOf(userId),
    };
    // The same account in any case: the address is matched as sign-up stores it, lower case.
    await expect(load(email.toUpperCase())).rejects.toThrow(
      new DemoRefused(
        'The account already has holdings: the demo household loads only into an account with none. Nothing was written.',
      ),
    );
    expect({
      counts: await rowCounts(owner, userId),
      ledger: await ledgerOf(userId),
      audits: (await auditRows(owner, userId)).map((a) => a.id),
      profile: await profileOf(userId),
    }).toStrictEqual(before);
  });
});

describe('demo:load refuses', () => {
  it('an email no account has', async () => {
    await expect(load('nobody.here@example.com')).rejects.toThrow(
      new DemoRefused(
        'No account has that email address: sign up with it first. Nothing was written.',
      ),
    );
  });

  it('an account whose email is not verified, and changes nothing', async () => {
    const { userId, email } = await newAccount(false);
    await expect(load(email)).rejects.toThrow(
      new DemoRefused(
        'That account has not verified its email address: verify it first. Nothing was written.',
      ),
    );
    expect(await profileOf(userId)).toStrictEqual({
      country: null,
      segment: 'unknown',
      onboarding_state: 'country',
    });
    expect(await ledgerOf(userId)).toBeNull();
  });

  it('an account that has an archived holding only', async () => {
    const { userId, email } = await newAccount();
    const one = {
      ...household,
      tags: [],
      holdings: [{ ...fileHolding((h) => h.archived === true) }],
    };
    await load(email, one);
    const before = await rowCounts(owner, userId);
    await expect(load(email)).rejects.toBeInstanceOf(DemoRefused);
    expect(await rowCounts(owner, userId)).toStrictEqual(before);
  });

  it('a holding the Ledger refuses, writing none of the household', async () => {
    const { userId, email } = await newAccount();
    const broken: DemoHousehold = {
      ...household,
      holdings: [
        ...household.holdings.slice(0, 3),
        { ...fileHolding((h) => h.universal === 'equity'), access: 'maybe' },
      ],
    };
    await expect(load(email, broken)).rejects.toThrow(
      new DemoRefused(
        'Holding 4 of 4 was refused (VALIDATION_FAILED at access): nothing was written.',
      ),
    );
    expect(await ledgerOf(userId)).toBeNull();
    expect((await rowCounts(owner, userId)).audit).toBe(0);
  });
});

describe('demo:load into an account that has a ledger but no holding', () => {
  it('starts it over in SGD with SG’s types, and uses a tag it already has', async () => {
    const { userId, email } = await newAccount();
    const options: LedgerOptions = {
      fx: { crossRate: () => Promise.reject(new Error('no rate is looked up')) },
      content: ledgerContent(createContentStore({ source: databaseContent(() => db.appDb) }), 'GB'),
      timeZone: 'Asia/Singapore',
    };
    const withUser = createWithUser(() => ({ db: db.appDb, clock }));
    const chain = await options.content.chain();
    await withUser(
      userId,
      { kind: 'user' },
      async (tx) => {
        const ledger = openLedger(tx, options);
        await ledger.init({
          baseCurrency: 'GBP',
          pack: chain.map((p) => ({ key: p.id, version: p.version })),
        });
        await ledger.upsertTag({ name: 'joint' });
      },
      { write: true },
    );

    const loaded = await load(email);
    expect(loaded.tags).toBe(household.tags.length - 1);
    expect((await ledgerOf(userId))?.base_currency).toBe('SGD');
    const keys = await owner.rows<{ pack_type_key: string | null }>(
      'select pack_type_key from ledger.user_type where user_id = $1 and pack_type_key is not null',
      [userId],
    );
    expect(keys).toStrictEqual([{ pack_type_key: 'car_loan' }]);
    expect((await rowCounts(owner, userId)).tag).toBe(household.tags.length);
  });
});

describe('demo:load leaves every other account alone', () => {
  it('writes nothing to, and reads nothing of, another account’s ledger', async () => {
    const otherId = 'usr_01K1G4KX00DEM0THER00000001';
    await ensureAccount(db, otherId);
    await db.owner.query(
      `insert into core.agent_connection (id, user_id, client_id, client_name, registration, client, created_at)
       values ('con_01K1G4KX00DEM0THER00000001', $1, 'https://agent.example/other.json', 'Fictional agent', 'cimd', 'other', now())`,
      [otherId],
    );
    await seedLedger(db.withUser, {
      userId: otherId,
      baseCurrency: 'EUR',
      connectionId: 'con_01K1G4KX00DEM0THER00000001',
      marker: 'MARKER-DEMO-OTHER',
    });
    const snapshot = async () => ({
      counts: await rowCounts(owner, otherId),
      ledger: await ledgerOf(otherId),
      audits: (await auditRows(owner, otherId)).map((a) => [a.id, a.after]),
      values: await owner.rows(
        'select id, amount_minor::text, base_minor::text, row_version from ledger.value where user_id = $1 order by id',
        [otherId],
      ),
    });
    const before = await snapshot();

    const { userId, email } = await newAccount();
    await load(email);
    expect(await snapshot()).toStrictEqual(before);
    // Nothing of the other account's reached the loaded one.
    const leaked = await owner.rows(
      `select 1 from ledger.holding where user_id = $1 and name like 'MARKER-DEMO-OTHER%'`,
      [userId],
    );
    expect(leaked).toStrictEqual([]);
  });
});

describe('the demo:load script', () => {
  /** Runs the script's main against the test database, capturing what it prints. */
  async function run(args: string[]) {
    const lines: string[] = [];
    const code = await main(args, {
      databaseUrl: db.app.options.connectionString,
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
      clock,
    });
    return { code, lines };
  }

  /** Every name, tag and amount in the household: none may be printed. */
  const secrets = [
    ...household.holdings.map((h) => h.name),
    ...household.tags,
    ...household.holdings.flatMap((h) => h.values.map((v) => v.amount)),
  ];
  const printsNothingPrivate = (lines: string[], email: string) => {
    const text = lines.join('\n');
    expect(text.toLowerCase()).not.toContain(email.toLowerCase());
    expect(text).not.toContain('@');
    for (const secret of secrets) expect(text).not.toContain(secret);
  };

  it('prints counts only on success', async () => {
    const { email } = await newAccount();
    const { code, lines } = await run(['--env', 'local', '--email', email]);
    expect(code).toBe(0);
    expect(lines).toStrictEqual([
      `demo:load: local: ${household.holdings.length} holdings (1 archived, 1 without a value), ${totalValues} values and ${household.tags.length} new tags loaded.`,
    ]);
    printsNothingPrivate(lines, email);
  });

  it('exits 1 with a plain message on a second load, an unknown or unverified account, or bad arguments', async () => {
    const { email } = await newAccount();
    expect((await run(['--env', 'local', '--email', email])).code).toBe(0);
    const again = await run(['--env', 'production', '--email', email]);
    expect(again).toStrictEqual({
      code: 1,
      lines: [
        'demo:load: production: refused. The account already has holdings: the demo household loads only into an account with none. Nothing was written.',
      ],
    });
    printsNothingPrivate(again.lines, email);

    const unknown = await run(['--env', 'local', '--email', 'nobody.here@example.com']);
    expect(unknown.code).toBe(1);
    printsNothingPrivate(unknown.lines, 'nobody.here@example.com');

    const unverified = await newAccount(false);
    const refused = await run(['--env', 'local', '--email', unverified.email]);
    expect(refused.code).toBe(1);
    expect(refused.lines[0]).toMatch(/^demo:load: local: refused\. That account has not verified/);
    printsNothingPrivate(refused.lines, unverified.email);

    for (const args of [[], ['--env', 'staging', '--email', email], ['--env', 'local'], ['--x']]) {
      const bad = await run(args);
      expect(bad.code, args.join(' ')).toBe(1);
      expect(bad.lines).toHaveLength(1);
      printsNothingPrivate(bad.lines, email);
    }
  });
});
