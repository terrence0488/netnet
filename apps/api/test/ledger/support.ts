import type { PackRef, Universal, VersionedPack } from '@netnet/contracts';
import { expect } from 'vitest';
import { createFx, type RateReader } from '../../src/content/fx';
import { agentConnection } from '../../src/db/schema';
import type { StoredRate } from '../../src/db/fx-rates';
import { AppError } from '../../src/lib/errors';
import {
  openLedger,
  type Ledger,
  type LedgerContent,
  type LedgerOptions,
} from '../../src/ledger/ledger';
import type { Actor } from '../../src/ledger/with-user';
import { FIXED_NOW, ensureAccount, type TestDatabase } from '../isolation/harness';

/**
 * What the Ledger suites share: fictional packs (an imaginary country "qz" and generic), fake
 * exchange rates behind the real `crossRate`, a clock the tests move, and helpers to act as a user
 * or an agent. Every name and figure is made up (CONVENTIONS §6).
 */

const everyType = <T>(value: (u: Universal) => T): Record<Universal, T> => ({
  cash: value('cash'),
  listed: value('listed'),
  retirement: value('retirement'),
  property: value('property'),
  vehicle: value('vehicle'),
  equity: value('equity'),
  crypto: value('crypto'),
  mortgage: value('mortgage'),
  loan: value('loan'),
  wrapper: value('wrapper'),
  card: value('card'),
  other: value('other'),
});

export const GENERIC_V1: VersionedPack = {
  id: 'generic',
  version: 1,
  locale: null,
  currency: null,
  labels: { ...everyType((u) => `Label ${u}`), cash: 'Cash and savings' },
  examples: {},
  meaning: everyType((u) => `Meaning of ${u}.`),
  cadenceDays: { ...everyType(() => 90), cash: 30, property: 365 },
  defaults: {
    cash: { access: 'accessible', reason: 'it is money in the bank' },
    listed: { access: 'accessible', reason: 'you can sell listed shares within days' },
    retirement: {
      access: 'locked',
      reason: 'a retirement account is locked',
      until: 'until you can withdraw',
    },
    vehicle: { access: 'illiquid', reason: 'you would sell it first' },
  },
  questions: {
    property: {
      ask: 'Do you live in it?',
      answers: [
        {
          id: 'home',
          label: 'Yes',
          access: 'locked',
          reason: 'it is your home',
          until: 'while you live in it',
        },
        { id: 'let', label: 'No', access: 'illiquid', reason: 'you would sell it first' },
      ],
    },
    other: {
      ask: 'Could you use it within a month?',
      answers: [
        { id: 'now', label: 'Yes', access: 'accessible', reason: 'you said you could' },
        { id: 'sell', label: 'By selling it', access: 'illiquid', reason: 'you would sell it' },
        { id: 'tied', label: 'No', access: 'locked', reason: 'you said it is tied up' },
      ],
    },
  },
  types: [],
  checklist: [],
};

/** An imaginary country's pack: only what differs from generic. */
export const COUNTRY_V1: VersionedPack = {
  id: 'qz',
  version: 1,
  locale: 'en-GB',
  currency: 'EUR',
  labels: { cash: 'Current account' },
  examples: {},
  meaning: {},
  cadenceDays: { cash: 14 },
  defaults: { wrapper: { access: 'locked', reason: 'the scheme keeps it until you retire' } },
  questions: {
    equity: {
      ask: 'Has it vested?',
      answers: [
        { id: 'vested', label: 'Yes', access: 'accessible', reason: 'it has vested' },
        {
          id: 'unvested',
          label: 'Not yet',
          access: 'locked',
          reason: 'it has not vested',
          until: 'until it vests',
        },
      ],
    },
  },
  types: [{ key: 'auto_loan', u: 'loan', label: 'Auto loan' }],
  checklist: [],
};

/** Published pack versions, and which is live; `publish` adds a version and makes it live. */
export class FakeContent {
  private readonly versions = new Map<string, VersionedPack>();
  private readonly live = new Map<string, number>();

  constructor(packs: readonly VersionedPack[]) {
    for (const pack of packs) this.publish(pack);
  }

  publish(pack: VersionedPack): void {
    this.versions.set(`${pack.id}@${pack.version}`, pack);
    if ((this.live.get(pack.id) ?? 0) < pack.version) this.live.set(pack.id, pack.version);
  }

  private get(key: string, version: number): VersionedPack {
    const pack = this.versions.get(`${key}@${version}`);
    if (!pack) throw new AppError('NOT_FOUND', `No pack ${key}@${version}.`);
    return pack;
  }

  /** The live chain for a country with pack `countryPack` (or none). */
  forCountry(countryPack: string | null): LedgerContent {
    return {
      chain: () =>
        Promise.resolve(
          [...(countryPack ? [countryPack] : []), 'generic'].map((key) =>
            this.get(key, this.live.get(key) ?? 0),
          ),
        ),
      packs: (ref) => Promise.resolve(ref.map(({ key, version }) => this.get(key, version))),
    };
  }

  /** The live chain's reference. */
  ref(countryPack: string | null): PackRef {
    return [...(countryPack ? [countryPack] : []), 'generic'].map((key) => ({
      key,
      version: this.live.get(key) ?? 0,
    }));
  }
}

/** Fictional rates per USD, all dated 2026-07-01: earlier dates get the nearest later one. */
const PER_USD: Record<string, string> = {
  EUR: '0.8',
  GBP: '0.75',
  JPY: '150',
  KWD: '0.3',
};
export const RATE_DATE = '2026-07-01';

export interface CountingRates extends RateReader {
  lookups: number;
}

export function fakeRates(): CountingRates {
  const reader: CountingRates = {
    lookups: 0,
    neighbours(currency, date) {
      reader.lookups += 1;
      const perUsd = PER_USD[currency];
      const rate: StoredRate | undefined =
        perUsd === undefined ? undefined : { date: RATE_DATE, currency, perUsd, source: 'ecb' };
      return Promise.resolve(
        date >= RATE_DATE
          ? { onOrBefore: rate, after: undefined }
          : { onOrBefore: undefined, after: rate },
      );
    },
    currencies: () => Promise.resolve(Object.keys(PER_USD)),
  };
  return reader;
}

/** A clock the tests set and move; it starts at FIXED_NOW. */
export class TestClock {
  private at = FIXED_NOW.getTime();
  readonly now = (): Date => new Date(this.at);
  set(date: Date): void {
    this.at = date.getTime();
  }
  advance(ms: number): void {
    this.at += ms;
  }
}

export const USER: Actor = { kind: 'user' };
export const agentActor = (connectionId: string, clientName = 'Fictional agent'): Actor => ({
  kind: 'agent',
  connectionId,
  clientName,
});

let users = 0;

/** A new user id, unique in this run. */
export function newUserId(): string {
  users += 1;
  return `usr_01K1G4KX00TEST${String(users).padStart(12, '0')}`;
}

let connections = 0;

export interface LedgerSuite {
  db: TestDatabase;
  clock: TestClock;
  content: FakeContent;
  rates: CountingRates;
  /** The options for a user in country pack `qz` (or `null` for none). */
  options(country?: string | null, overrides?: Partial<LedgerOptions>): LedgerOptions;
  /** Runs `fn` on `userId`'s Ledger as `actor`: a read, or a write with `write`. */
  as(
    userId: string,
    actor?: Actor,
    country?: string | null,
  ): {
    read<T>(fn: (l: Ledger) => Promise<T>): Promise<T>;
    write<T>(fn: (l: Ledger) => Promise<T>): Promise<T>;
  };
  /** A new user with an initialised ledger in `baseCurrency` (USD unless given). */
  newUser(baseCurrency?: string, country?: string | null): Promise<string>;
  /** A new active agent connection for `userId`. */
  connect(userId: string, client?: 'claude' | 'chatgpt' | 'other'): Promise<string>;
  /** Rows the owner sees, for checking. */
  rows<R extends Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
  /** The user's type id for `universal` (the plain one). */
  typeId(userId: string, universal: Universal): Promise<string>;
}

export function ledgerSuite(db: TestDatabase): LedgerSuite {
  const clock = new TestClock();
  const content = new FakeContent([GENERIC_V1, COUNTRY_V1]);
  const rates = fakeRates();
  const fx = createFx(rates);
  const withUser = db.withUserOn(db.app, clock.now);

  const options = (country: string | null = 'qz', overrides: Partial<LedgerOptions> = {}) => ({
    fx,
    content: content.forCountry(country),
    timeZone: 'UTC',
    ...overrides,
  });

  const suite: LedgerSuite = {
    db,
    clock,
    content,
    rates,
    options,
    as(userId, actor = USER, country = 'qz') {
      return {
        read: (fn) => withUser(userId, actor, (tx) => fn(openLedger(tx, options(country)))),
        write: (fn) =>
          withUser(userId, actor, (tx) => fn(openLedger(tx, options(country))), { write: true }),
      };
    },
    async newUser(baseCurrency = 'USD', country = 'qz') {
      const userId = newUserId();
      await suite
        .as(userId, USER, country)
        .write((l) => l.init({ baseCurrency, pack: content.ref(country) }));
      return userId;
    },
    async connect(userId, client = 'other') {
      connections += 1;
      const id = `con_01K1G4KX00TEST${String(connections).padStart(12, '0')}`;
      await ensureAccount(db, userId);
      await db.appDb.insert(agentConnection).values({
        id,
        userId,
        clientId: `https://agent.example/${id}.json`,
        clientName: 'Fictional agent',
        registration: 'cimd',
        client,
        createdAt: FIXED_NOW,
      });
      return id;
    },
    async rows<R extends Record<string, unknown>>(text: string, params: unknown[] = []) {
      return (await db.owner.query<R>(text, params)).rows;
    },
    async typeId(userId, universal) {
      const [row] = await suite.rows<{ id: string }>(
        `select id from ledger.user_type where user_id = $1 and universal = $2
          and pack_type_key is null and custom_name is null order by sort limit 1`,
        [userId, universal],
      );
      if (!row) throw new Error(`No ${universal} type for ${userId}`);
      return row.id;
    },
  };
  return suite;
}

/** The user's `data_version`, or null before init. */
export async function dataVersion(suite: LedgerSuite, userId: string): Promise<number | null> {
  const [row] = await suite.rows<{ data_version: number }>(
    'select data_version from ledger.ledger_state where user_id = $1',
    [userId],
  );
  return row?.data_version ?? null;
}

export interface AuditRowSeen {
  id: string;
  actor: string;
  client_name: string | null;
  connection_id: string | null;
  batch_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
}

/** The user's audit rows, oldest first. */
export async function auditRows(suite: LedgerSuite, userId: string): Promise<AuditRowSeen[]> {
  return suite.rows<AuditRowSeen & Record<string, unknown>>(
    `select id, actor, client_name, connection_id, batch_id, action, entity, entity_id, before, after
       from ledger.audit where user_id = $1 order by at, id`,
    [userId],
  );
}

/** How many rows `userId` has in each `ledger` table. */
export async function rowCounts(
  suite: LedgerSuite,
  userId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [
    'ledger_state',
    'user_type',
    'tag',
    'holding',
    'holding_tag',
    'batch',
    'value',
    'prefs',
    'audit',
  ]) {
    const [row] = await suite.rows<{ n: number }>(
      `select count(*)::int as n from ledger.${table} where user_id = $1`,
      [userId],
    );
    counts[table] = row?.n ?? 0;
  }
  return counts;
}

/** The AppError `promise` rejects with (failing the test if it resolves or throws another). */
export async function appError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError, but the call succeeded');
}

/* Asymmetric matchers typed as what they stand for, so they fit inside typed objects. */
export const anyString = expect.any(String) as string;
export const anyNumber = expect.any(Number) as number;
export const matching = (pattern: RegExp) => expect.stringMatching(pattern) as string;
export const containing = (text: string) => expect.stringContaining(text) as string;
export const like = <T extends object>(object: T) => expect.objectContaining(object as never) as T;
