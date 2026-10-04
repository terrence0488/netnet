import { createHash } from 'node:crypto';
import { newId, type IdPrefix } from '../lib/ids';
import {
  audit,
  batch,
  holding,
  holdingTag,
  ledgerState,
  prefs,
  tag,
  userType,
  value,
} from './schema';
import type { LedgerTx, WithUser } from './with-user';

/**
 * A small fictional ledger with at least one row in every `ledger` table: the preview seed
 * (`pnpm db:seed`) and the isolation suites' users A and B. Never real data (CONVENTIONS §6).
 */
export interface LedgerFixture {
  userId: string;
  baseCurrency: string;
  /** The agent connection the fixture's batch belongs to. */
  connectionId: string;
  /** Written into every name, so a test can look for it anywhere in a response. */
  marker?: string;
}

/** The fixture's ids, which are the same on every run for the same user. */
export interface SeededLedger {
  userId: string;
  typeIds: string[];
  tagId: string;
  holdingIds: string[];
  valueIds: string[];
  batchId: string;
  auditIds: string[];
}

/** The time inside every fixture id: 2026-07-31T00:00:00Z. */
const FIXTURE_ID_TIME = Date.UTC(2026, 6, 31);

/** A fixed id for `key` within `userId`'s fixture: the same on every run, never shared. */
function fixtureId(prefix: IdPrefix, userId: string, key: string): string {
  const digest = createHash('sha256').update(`${userId}:${key}`).digest();
  return newId(prefix, FIXTURE_ID_TIME, () => Uint8Array.from(digest.subarray(0, 10)));
}

/**
 * Writes the fixture through `withUser` as a `system` write, with an audit row per entity and
 * `data_version` 1. Does nothing if the user's ledger already exists, so it can run again, even
 * while another run is under way.
 */
export async function seedLedger(
  withUser: WithUser,
  fixture: LedgerFixture,
): Promise<SeededLedger> {
  return withUser(
    fixture.userId,
    { kind: 'system' },
    async (tx) => {
      const seeded = plan(tx, fixture);
      await write(tx, seeded);
      return seeded.ids;
    },
    { write: true },
  );
}

type Plan = ReturnType<typeof plan>;

function plan(tx: LedgerTx, fixture: LedgerFixture) {
  const { userId, baseCurrency, connectionId } = fixture;
  const at = tx.now();
  const id = (prefix: IdPrefix, key: string) => fixtureId(prefix, userId, key);
  const name = (text: string) => (fixture.marker ? `${fixture.marker} ${text}` : text);

  const types = [
    { userId, id: id('typ', 'cash'), universal: 'cash' as const, sort: 0 },
    { userId, id: id('typ', 'listed'), universal: 'listed' as const, sort: 1 },
    { userId, id: id('typ', 'mortgage'), universal: 'mortgage' as const, sort: 2 },
  ] satisfies (typeof userType.$inferInsert)[];
  const [cashType, listedType, mortgageType] = types.map((t) => t.id) as [string, string, string];

  const longTerm = { userId, id: id('tag', 'long-term'), name: name('Long term'), sort: 0 };

  const holdings = [
    {
      userId,
      id: id('hld', 'everyday'),
      name: name('Everyday account'),
      kind: 'asset' as const,
      typeId: cashType,
      currency: baseCurrency,
      createdAt: at,
      access: 'accessible' as const,
      accessReason: 'cash you can move today',
    },
    {
      userId,
      id: id('hld', 'index-fund'),
      name: name('World index fund'),
      kind: 'asset' as const,
      typeId: listedType,
      currency: 'EUR',
      createdAt: at,
      access: 'accessible' as const,
      accessReason: 'listed shares you can sell within days',
    },
    {
      userId,
      id: id('hld', 'home-loan'),
      name: name('Home loan'),
      kind: 'liability' as const,
      typeId: mortgageType,
      currency: baseCurrency,
      createdAt: at,
    },
  ] satisfies (typeof holding.$inferInsert)[];
  const [everyday, indexFund, homeLoan] = holdings.map((h) => h.id) as [string, string, string];

  const agentBatch = {
    userId,
    id: id('bat', 'first-turn'),
    connectionId,
    openedAt: at,
    lastWriteAt: at,
  };

  const sameCurrency = (holdingId: string, key: string, date: string, minor: number) => ({
    userId,
    id: id('val', key),
    holdingId,
    date,
    amountMinor: minor,
    currency: baseCurrency,
    baseMinor: minor,
    baseCurrency,
    fxRate: '1',
    fxSource: 'same' as const,
    source: 'web' as const,
    enteredAt: at,
    updatedAt: at,
  });
  const values = [
    sameCurrency(everyday, 'everyday-1', '2026-06-30', 1_250_000),
    sameCurrency(everyday, 'everyday-2', '2026-07-31', 1_310_050),
    {
      ...sameCurrency(indexFund, 'index-fund-1', '2026-07-31', 800_000),
      currency: 'EUR',
      baseMinor: baseCurrency === 'EUR' ? 800_000 : 868_000,
      fxRate: baseCurrency === 'EUR' ? '1' : '1.085',
      fxRateDate: baseCurrency === 'EUR' ? null : '2026-07-31',
      fxSource: baseCurrency === 'EUR' ? ('same' as const) : ('ecb' as const),
      source: 'agent' as const,
      clientName: 'Fictional agent',
      connectionId,
      batchId: agentBatch.id,
    },
    sameCurrency(homeLoan, 'home-loan-1', '2026-07-31', 32_000_000),
  ] satisfies (typeof value.$inferInsert)[];

  const homeFilter = { userId, key: 'home_filter', value: { show: 'all' } };

  const entities: { entity: string; entityId: string; after: unknown; batchId?: string }[] = [
    ...types.map((t) => ({ entity: 'type', entityId: t.id, after: t })),
    { entity: 'tag', entityId: longTerm.id, after: longTerm },
    ...holdings.map((h) => ({ entity: 'holding', entityId: h.id, after: h })),
    ...values.map((v) => ({
      entity: 'value',
      entityId: v.id,
      after: v,
      ...('batchId' in v ? { batchId: v.batchId } : {}),
    })),
    { entity: 'prefs', entityId: homeFilter.key, after: homeFilter },
  ];
  const audits = entities.map((e, index) => ({
    userId,
    id: id('aud', `seed-${index}`),
    at,
    actor: 'system' as const,
    action: 'seed',
    entity: e.entity,
    entityId: e.entityId,
    after: e.after,
    batchId: e.batchId ?? null,
  })) satisfies (typeof audit.$inferInsert)[];

  return {
    rows: { at, baseCurrency, types, longTerm, holdings, agentBatch, values, homeFilter, audits },
    links: [{ userId, holdingId: indexFund, tagId: longTerm.id }],
    ids: {
      userId,
      typeIds: types.map((t) => t.id),
      tagId: longTerm.id,
      holdingIds: holdings.map((h) => h.id),
      valueIds: values.map((v) => v.id),
      batchId: agentBatch.id,
      auditIds: audits.map((a) => a.id),
    } satisfies SeededLedger,
  };
}

async function write(tx: LedgerTx, { rows, links }: Plan): Promise<void> {
  const { db, userId } = tx;
  const created = await db
    .insert(ledgerState)
    .values({ userId, baseCurrency: rows.baseCurrency, dataVersion: 1, createdAt: rows.at })
    .onConflictDoNothing()
    .returning({ userId: ledgerState.userId });
  // The ledger exists already. A concurrent seed waits on this insert until the first commits.
  if (created.length === 0) return;
  await db.insert(userType).values(rows.types);
  await db.insert(tag).values(rows.longTerm);
  await db.insert(holding).values(rows.holdings);
  await db.insert(holdingTag).values(links);
  await db.insert(batch).values(rows.agentBatch);
  await db.insert(value).values(rows.values);
  await db.insert(prefs).values(rows.homeFilter);
  await db.insert(audit).values(rows.audits);
}
