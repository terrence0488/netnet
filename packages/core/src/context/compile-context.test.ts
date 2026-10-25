import type {
  ContextHolding,
  ContextInput,
  ContextValue,
  FinancialContext,
  HoldingAccess,
  ValueSource,
} from '@netnet/contracts';
import { UNIVERSALS, financialContextSchema } from '@netnet/contracts';
import { CURRENCY_EXPONENTS } from '@netnet/contracts/currencies';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveAccess } from '../access';
import { addDays } from '../dates';
import { compileContext } from './compile-context';
import { utf8Length } from './size';
import {
  ABROAD,
  CHAIN,
  EMPTY,
  ESTABLISHED,
  INJECTED_CLIENT_NAME,
  LARGE,
  STARTING_OUT,
  TODAY,
  account,
} from './test-accounts';

const compile = (data: ContextInput, baseline?: 'initial' | 'last_update') =>
  compileContext(data, CHAIN, TODAY, baseline ? { baseline } : {});
const bytes = (ctx: FinancialContext) => utf8Length(JSON.stringify(ctx));
const holdingNamed = (ctx: FinancialContext, name: string) => {
  const found = ctx.holdings.find((h) => h.name === name);
  if (!found) throw new Error(`${name} is not listed`);
  return found;
};

/** A holding as the Ledger hands it over; accessibility as given, not resolved. */
function holding(id: string, overrides: Partial<ContextHolding> = {}): ContextHolding {
  return {
    id,
    name: `Holding ${id}`,
    kind: 'asset',
    typeId: 'typ_cash',
    universal: 'cash',
    currency: 'EUR',
    cadenceDays: null,
    archived: false,
    access: 'accessible',
    tagIds: [],
    accessReason: 'it’s money in the bank',
    accessUntil: null,
    accessBasis: null,
    ...overrides,
  };
}

function value(
  holdingId: string,
  date: string,
  baseMinor: number,
  overrides: Partial<ContextValue> = {},
): ContextValue {
  return {
    id: `val_${holdingId}_${date}`,
    holdingId,
    date,
    amountMinor: baseMinor,
    currency: 'EUR',
    baseMinor,
    source: 'web',
    clientName: null,
    connectionId: null,
    ...overrides,
  };
}

const input = (overrides: Partial<ContextInput>): ContextInput => ({
  baseCurrency: 'EUR',
  holdings: [],
  values: [],
  types: [{ id: 'typ_cash', universal: 'cash', packTypeKey: null, customName: null }],
  tags: [],
  connections: [],
  ...overrides,
});

describe('compileContext', () => {
  describe('totals', () => {
    const ctx = compile(STARTING_OUT);

    it('are the position and its change, in major units of the base currency', () => {
      expect(ctx.as_of).toBe(TODAY);
      expect(ctx.currency).toBe('EUR');
      expect(ctx.totals).toStrictEqual({
        net_worth: -12579.5,
        assets: 4920.5,
        owed: 17500,
        could_use: 3120.5,
        sell_first: 0,
        locked: 0,
        undecided: 1800,
        owed_to_could_use: 5.61,
        // Everyday account +470.50; Gold coins was first valued after 2026-08-31, so it adds
        // nothing; the loan fell by 500.00. Against 2650.00 + 1800.00 − 18000.00.
        change: { baseline: 'last_month', since: '2026-08-31', amount: 970.5, pct: 7.16 },
      });
    });

    it('never count undecided in could_use, and always report it, first among the notes', () => {
      expect(ctx.picture.undecided).toBe(1);
      expect(ctx.picture.notes[0]).toBe(
        'Accessibility of “Gold coins” is undecided: it counts in net_worth, not in could_use',
      );
      expect(holdingNamed(ctx, 'Gold coins').access).toBe('undecided');
      expect(ctx.answer_guide[0]).toMatchObject({
        use: 'totals.could_use',
        never: 'totals.net_worth',
      });
    });

    it('compare with the baseline asked for', () => {
      expect(compile(STARTING_OUT, 'initial').totals.change).toStrictEqual({
        baseline: 'initial',
        since: '2026-06-30',
        amount: 1220.5,
        pct: 8.84,
      });
      expect(compile(EMPTY).totals.change).toStrictEqual({
        baseline: 'last_month',
        since: null,
        amount: null,
        pct: null,
      });
    });

    it('give no debt ratio when nothing could be used', () => {
      const ctx = compile(
        input({
          holdings: [holding('loan', { kind: 'liability', access: null, accessReason: null })],
          values: [value('loan', '2026-09-01', 50_000)],
        }),
      );
      expect(ctx.totals.owed_to_could_use).toBeNull();
      expect(ctx.exposure).toStrictEqual({ by_currency: [], concentration: [] });
    });
  });

  describe('holdings', () => {
    it('say what each listed type is once, in the order the holdings first use it', () => {
      for (const data of [STARTING_OUT, ESTABLISHED, LARGE, ABROAD]) {
        const ctx = compile(data);
        const used = [...new Set(ctx.holdings.map((h) => h.type))];
        expect(ctx.types.map((t) => t.type)).toStrictEqual(used);
        expect(ctx.types.every((t) => t.meaning.length > 0)).toBe(true);
      }
      expect(compile(EMPTY).types).toStrictEqual([]);
    });

    it('carry what each one is, its access as applied, its value and its change', () => {
      const ctx = compile(STARTING_OUT);
      expect(ctx.types).toContainEqual({
        type: 'Current account',
        meaning:
          'Money in a bank or savings account. Counts toward net worth and toward what can be used now.',
      });
      expect(holdingNamed(ctx, 'Everyday account')).toStrictEqual({
        id: 'hld_001',
        name: 'Everyday account',
        type: 'Current account',
        tags: ['Emergency fund'],
        currency: 'EUR',
        access: 'accessible',
        access_reason: 'it’s money in the bank',
        until: null,
        value: {
          amount: 3120.5,
          currency: 'EUR',
          base: 3120.5,
          as_of: '2026-09-20',
          age_days: 7,
          stale: false,
          written_by: 'agent:Claude',
        },
        change: { amount: 470.5, pct: 17.75 },
      });
    });

    it('carry the holding’s own currency, between tags and access, value or none', () => {
      const ctx = compile(
        input({
          holdings: [
            holding('valued', { currency: 'USD' }),
            holding('unvalued', { currency: 'JPY' }),
            holding('loan', {
              kind: 'liability',
              currency: 'GBP',
              access: null,
              accessReason: null,
            }),
          ],
          values: [
            value('valued', '2026-09-20', 10_000, { currency: 'USD', amountMinor: 10_000 }),
            value('loan', '2026-09-20', 50_000, { currency: 'GBP', amountMinor: 50_000 }),
          ],
        }),
      );
      const byId = new Map(ctx.holdings.map((h) => [h.id, h]));
      expect(byId.get('valued')).toMatchObject({ currency: 'USD' });
      expect(byId.get('unvalued')).toMatchObject({ currency: 'JPY', value: null });
      expect(byId.get('loan')).toMatchObject({ currency: 'GBP', access: 'owed' });
      for (const entry of ctx.holdings) {
        const keys = Object.keys(entry);
        expect(keys.slice(keys.indexOf('tags'), keys.indexOf('access') + 1)).toStrictEqual([
          'tags',
          'currency',
          'access',
        ]);
      }
    });

    it('keep the holding’s currency at the top when its latest value is in another', () => {
      const ctx = compile(
        input({
          holdings: [holding('a', { currency: 'USD' })],
          values: [value('a', '2026-09-20', 92, { amountMinor: 100, currency: 'EUR' })],
        }),
      );
      expect(ctx.holdings[0]).toMatchObject({ currency: 'USD', value: { currency: 'EUR' } });
    });

    it('list a liability as owed, its change being its contribution to net worth', () => {
      expect(holdingNamed(compile(STARTING_OUT), 'Study loan')).toMatchObject({
        access: 'owed',
        access_reason: null,
        until: null,
        value: { amount: 17500, base: 17500 },
        change: { amount: 500, pct: 2.78 },
      });
    });

    it('give the original amount and currency beside the stored base amount', () => {
      expect(holdingNamed(compile(ABROAD), 'Savings bonds').value).toStrictEqual({
        amount: 3000000,
        currency: 'JPY',
        base: 18600,
        as_of: '2026-04-30',
        age_days: 150,
        stale: true,
        written_by: 'web',
      });
    });

    it('label types by the current pack, and keep accessibility and its reason as applied', () => {
      const ctx = compile(ABROAD);
      // Applied in xa; labelled and explained by qz, where the holder lives now.
      expect(ctx.types).toContainEqual({
        type: 'Workplace pension',
        meaning:
          'A workplace retirement scheme. Counts toward net worth, never toward what can be spent this month.',
      });
      expect(holdingNamed(ctx, 'Provident plan')).toMatchObject({
        type: 'Workplace pension',
        access: 'locked',
        access_reason: 'the plan keeps it until the withdrawal age',
        until: 'until the withdrawal age',
      });
      // xb's type and default: today's chain would make it sell-first, but it stays as applied.
      expect(resolveAccess(CHAIN, 'listed').access).toBe('illiquid');
      expect(holdingNamed(ctx, 'Savings bonds')).toMatchObject({
        type: 'Shares & funds',
        access: 'locked',
        access_reason: 'the bonds can’t be cashed before they mature',
      });
      expect(holdingNamed(ctx, 'Flat in the old town').type).toBe('Flat abroad');
    });

    it('name who wrote each value by guide, never by the name an agent registered', () => {
      const connections: ContextInput['connections'] = [
        { id: 'con_claude', client: 'claude', guideName: 'Claude' },
        { id: 'con_chatgpt', client: 'chatgpt', guideName: 'ChatGPT' },
        { id: 'con_unguided', client: 'claude' },
        { id: 'con_other', client: 'other', guideName: 'Not a guide' },
      ];
      const written = (source: ValueSource, connectionId: string | null) => {
        const ctx = compile(
          input({
            connections,
            holdings: [holding('h')],
            values: [value('h', '2026-09-20', 100, { source, connectionId, clientName: 'Evil' })],
          }),
        );
        expect(JSON.stringify(ctx)).not.toContain('Evil');
        return ctx.holdings[0]?.value?.written_by;
      };
      expect(written('web', null)).toBe('web');
      expect(written('system', null)).toBe('system');
      expect(written('agent', 'con_claude')).toBe('agent:Claude');
      expect(written('agent', 'con_chatgpt')).toBe('agent:ChatGPT');
      expect(written('agent', 'con_unguided')).toBe('agent:other');
      expect(written('agent', 'con_other')).toBe('agent:other');
      expect(written('agent', 'con_revoked_and_gone')).toBe('agent:other');
      expect(written('agent', null)).toBe('agent:other');

      const ctx = compile(STARTING_OUT);
      expect(holdingNamed(ctx, 'Study loan').value?.written_by).toBe('agent:other');
      expect(JSON.stringify(ctx)).not.toContain(INJECTED_CLIENT_NAME);
    });

    it('leave archived holdings out of everything', () => {
      const ctx = compile(ESTABLISHED);
      const archived = ESTABLISHED.holdings.filter((h) => h.archived);
      expect(archived).toHaveLength(2);
      for (const h of archived) {
        expect(JSON.stringify(ctx)).not.toContain(h.id);
        expect(JSON.stringify(ctx)).not.toContain(h.name);
      }
      expect(ctx.picture.holdings).toBe(30);
      expect(ctx.holdings.length + ctx.omitted.holdings).toBe(30);
    });

    it('ignore values dated after today', () => {
      const ctx = compile(
        input({
          holdings: [holding('h')],
          values: [value('h', '2026-09-20', 100), value('h', '2026-09-28', 999)],
        }),
      );
      expect(ctx.holdings[0]?.value).toMatchObject({ amount: 1, as_of: '2026-09-20' });
      expect(ctx.totals.net_worth).toBe(1);
    });

    it('are largest first, either way, capped at 25, with the rest summarised by type', () => {
      const ctx = compile(LARGE);
      const sizes = ctx.holdings.map((h) => Math.abs(h.value?.base ?? 0));
      expect(sizes).toStrictEqual([...sizes].sort((a, b) => b - a));
      expect(ctx.holdings.length).toBeLessThanOrEqual(25);
      expect(ctx.holdings.length + ctx.omitted.holdings).toBe(200);
      expect(ctx.omitted.by_type.reduce((n, t) => n + t.holdings, 0)).toBe(ctx.omitted.holdings);
      expect(ctx.omitted.by_type.find((t) => t.type === 'Loan')).toMatchObject({
        holdings: 2,
        assets: 0,
        owed: 52060,
      });
      const listed = ctx.holdings.reduce((sum, h) => sum + (h.value?.base ?? 0), 0);
      const summarised = ctx.omitted.by_type.reduce((sum, t) => sum + t.assets - t.owed, 0);
      expect(listed + summarised).toBeCloseTo(ctx.totals.net_worth, 2);
      expect(ctx.omitted.hint).toBe('list_holdings returns every holding');

      // Small enough entries all fit, so exactly 25 are listed.
      const many = compile(
        input({ holdings: Array.from({ length: 30 }, (_, i) => holding(`h${i + 10}`)) }),
      );
      expect(many.holdings).toHaveLength(25);
      expect(many.omitted).toMatchObject({
        holdings: 5,
        by_type: [{ type: 'Current account', holdings: 5, assets: 0, owed: 0 }],
      });
    });

    it('break ties by id, so equal holdings keep one order', () => {
      const ctx = compile(
        input({
          holdings: ['h3', 'h1', 'h2'].map((id) => holding(id)),
          values: ['h2', 'h3', 'h1'].map((id) => value(id, '2026-09-20', 100)),
        }),
      );
      expect(ctx.holdings.map((h) => h.id)).toStrictEqual(['h1', 'h2', 'h3']);
      expect(ctx.exposure.concentration.map((c) => c.holding_id)).toStrictEqual(['h1', 'h2', 'h3']);
    });

    it('list tags by name, each once, and pass over a tag that no longer exists', () => {
      const ctx = compile(
        input({
          tags: [
            { id: 'tag_b', name: 'Joint' },
            { id: 'tag_a', name: 'Emergency fund' },
          ],
          holdings: [holding('h', { tagIds: ['tag_b', 'tag_gone', 'tag_a', 'tag_b'] })],
        }),
      );
      expect(ctx.holdings[0]?.tags).toStrictEqual(['Emergency fund', 'Joint']);
    });

    it('label a holding whose type is missing by its universal type', () => {
      const ctx = compile(input({ types: [], holdings: [holding('h')] }));
      expect(ctx.holdings[0]?.type).toBe('Current account');
    });

    it('cut every name to 64 characters', () => {
      const long = 'N'.repeat(100);
      const ctx = compile(
        input({
          types: [{ id: 'typ_cash', universal: 'cash', packTypeKey: null, customName: long }],
          tags: [{ id: 'tag', name: long }],
          holdings: [holding('h', { name: long, tagIds: ['tag'], access: 'undecided' })],
          values: [value('h', '2026-09-20', 100)],
        }),
      );
      const cut = `${'N'.repeat(63)}…`;
      expect(ctx.holdings[0]).toMatchObject({ name: cut, type: cut, tags: [cut] });
      expect(ctx.exposure.concentration[0]?.name).toBe(cut);
      expect(ctx.picture.notes[0]).toContain(`“${cut}”`);
      expect(JSON.stringify(ctx)).not.toContain('N'.repeat(64));
    });
  });

  describe('picture', () => {
    const at = (date: string) => (id: string) => value(id, date, 100);
    const ofFour = (staleCount: number) =>
      compile(
        input({
          holdings: ['a', 'b', 'c', 'd'].map((id) => holding(id)),
          values: ['a', 'b', 'c', 'd'].map((id, i) =>
            at(i < staleCount ? '2026-06-30' : '2026-09-20')(id),
          ),
        }),
      ).picture;

    it('is empty with no value, fresh with none stale, mostly stale past half', () => {
      expect(compile(EMPTY).picture).toStrictEqual({
        holdings: 0,
        stale: 0,
        undecided: 0,
        without_value: 0,
        oldest_value_days: null,
        freshness: 'empty',
        notes: ['No holdings have been added yet'],
      });
      expect(compile(input({ holdings: [holding('a')] })).picture).toMatchObject({
        holdings: 1,
        without_value: 1,
        oldest_value_days: null,
        freshness: 'empty',
      });
      expect(ofFour(0)).toMatchObject({ stale: 0, freshness: 'fresh', oldest_value_days: 7 });
      expect(ofFour(2)).toMatchObject({ stale: 2, freshness: 'some_stale' });
      expect(ofFour(3)).toMatchObject({
        stale: 3,
        freshness: 'mostly_stale',
        oldest_value_days: 89,
      });
    });

    it('notes what is undecided, missing, stale and converted, most important first', () => {
      expect(compile(ESTABLISHED).picture.notes).toStrictEqual([
        'Accessibility of 2 holdings is undecided, the largest “Holiday cabin share”: they count in net_worth, not in could_use',
        '“Watch” has no value yet, so no total includes it',
        '9 values are past their usual update interval; the largest, “Startup options”, is 180 days old',
        'Values in 3 other currencies are converted to the base currency at the rate of each value’s date, not today’s',
        'NetNet only knows what has been added',
      ]);
      expect(ofFour(1).notes).toStrictEqual([
        'The value of “Holding a” is 89 days old, past its usual update interval',
        'NetNet only knows what has been added',
      ]);
      expect(compile(input({ holdings: [holding('a'), holding('b')] })).picture.notes[0]).toBe(
        '2 holdings have no value yet, so no total includes them',
      );
      expect(
        compile(
          input({
            holdings: [holding('a', { currency: 'USD' })],
            values: [value('a', '2026-09-20', 92, { amountMinor: 100, currency: 'USD' })],
          }),
        ).picture.notes[0],
      ).toBe(
        'Values in 1 other currency are converted to the base currency at the rate of each value’s date, not today’s',
      );
    });
  });

  describe('exposure', () => {
    it('shares assets by currency and by holding, largest first', () => {
      const { exposure } = compile(ABROAD);
      expect(exposure.by_currency).toStrictEqual([
        { currency: 'CAD', share: 0.94 },
        { currency: 'JPY', share: 0.05 },
        { currency: 'EUR', share: 0.01 },
      ]);
      expect(exposure.concentration[0]).toStrictEqual({
        holding_id: 'hld_004',
        name: 'Flat in the old town',
        share: 0.77,
      });
    });

    it('lists at most ten holdings, and only assets worth more than nothing', () => {
      const ctx = compile(
        input({
          holdings: [
            ...Array.from({ length: 12 }, (_, i) => holding(`h${i + 10}`)),
            holding('zero'),
            holding('loan', { kind: 'liability', access: null }),
          ],
          values: [
            ...Array.from({ length: 12 }, (_, i) => value(`h${i + 10}`, '2026-09-20', 100 + i)),
            value('zero', '2026-09-20', 0),
            value('loan', '2026-09-20', 10_000),
          ],
        }),
      );
      expect(ctx.exposure.concentration).toHaveLength(10);
      expect(ctx.exposure.concentration[0]?.holding_id).toBe('h21');
      expect(JSON.stringify(ctx.exposure)).not.toMatch(/zero|loan/);
    });
  });

  describe('the 8 KB budget', () => {
    it('first lists fewer holdings, keeping every other part', () => {
      const ctx = compile(LARGE);
      expect(ctx.holdings.length).toBeLessThan(25);
      expect(ctx.exposure.concentration).toHaveLength(10);
      expect(bytes(ctx)).toBeLessThanOrEqual(8192);
      expect(bytes(compileContext(LARGE, CHAIN, TODAY, {}))).toBe(bytes(ctx));
    });

    /**
     * Holdings each of its own type, with names of 64 characters (`fill` pads them), half of
     * them undecided and a third stale, so every part of the document is long.
     */
    const crowded = (n: number, currencies: readonly string[] = ['EUR', 'USD'], fill = '.') => {
      const holdings = Array.from({ length: n }, (_, i) =>
        holding(`h${String(i).padStart(3, '0')}`, {
          name: `Holding ${i} `.padEnd(64, fill),
          typeId: `typ_${i}`,
          universal: 'other',
          access: i % 2 ? 'undecided' : 'locked',
          currency: currencies[i % currencies.length] ?? 'EUR',
        }),
      );
      return input({
        types: holdings.map((h, i) => ({
          id: h.typeId,
          universal: 'other',
          packTypeKey: null,
          customName: `A type of the user's own, number ${i}`.padEnd(64, '.'),
        })),
        holdings: [...holdings, holding('nothing-yet')],
        values: holdings.map((h, i) =>
          value(h.id, i % 3 ? '2026-09-20' : '2025-01-31', 1_000 + i, {
            currency: h.currency,
            amountMinor: 1_000 + i,
          }),
        ),
      });
    };

    it('then keeps five concentration entries, then three notes, the first always undecided', () => {
      // One holding and one type more each time: the document outgrows the budget step by step.
      const states = Array.from({ length: 31 }, (_, k) => {
        const n = 40 + k;
        const ctx = compile(crowded(n));
        expect(bytes(ctx)).toBeLessThanOrEqual(8192);
        expect(ctx.picture.notes[0]).toMatch(/^Accessibility of \d+ holdings is undecided/);
        expect(ctx.omitted.holdings + ctx.holdings.length).toBe(n + 1);
        return {
          listed: ctx.holdings.length,
          concentration: ctx.exposure.concentration.length,
          notes: ctx.picture.notes.length,
          // Every holding is of a type of its own, so a full summary has an entry per holding.
          allTypes: ctx.omitted.by_type.length === ctx.omitted.holdings,
        };
      });
      for (const state of states) {
        if (state.concentration < 10) expect(state.listed).toBe(0);
        if (state.notes < 5) expect(state.concentration).toBe(5);
        if (!state.allTypes) expect(state.notes).toBe(3);
      }
      expect(states[0]).toMatchObject({ concentration: 10, notes: 5, allTypes: true });
      expect(states).toContainEqual({ listed: 0, concentration: 5, notes: 5, allTypes: true });
      expect(states).toContainEqual({ listed: 0, concentration: 5, notes: 3, allTypes: true });
      expect(states.at(-1)).toStrictEqual({
        listed: 0,
        concentration: 5,
        notes: 3,
        allTypes: false,
      });
    });

    it('and for hundreds of types or currencies, drops the smallest types, then currencies', () => {
      const codes = Object.keys(CURRENCY_EXPONENTS);
      // Names of control characters, which JSON writes six bytes each.
      const ctx = compile(crowded(codes.length, codes, '\u0001'));
      expect(ctx.omitted.by_type).toStrictEqual([]);
      expect(ctx.exposure.by_currency.length).toBeGreaterThan(100);
      expect(ctx.exposure.by_currency.length).toBeLessThan(codes.length);
      expect(ctx.picture.notes[0]).toMatch(/^Accessibility of \d+ holdings is undecided/);
      expect(bytes(ctx)).toBeLessThanOrEqual(8192);
    });
  });

  describe('over random fictional accounts', () => {
    const CURRENCIES = ['EUR', 'USD', 'JPY', 'BHD'] as const;
    const ACCESS: (HoldingAccess | null)[] = [
      'accessible',
      'illiquid',
      'locked',
      'undecided',
      null,
    ];
    const name = fc.string({ unit: 'binary', minLength: 1, maxLength: 120 });

    const accounts = fc
      .record({
        types: fc.array(fc.option(name, { nil: null }), { minLength: 1, maxLength: 30 }),
        tags: fc.array(name, { maxLength: 8 }),
        holdings: fc.array(
          fc.record({
            name,
            liability: fc.boolean(),
            type: fc.nat(),
            universal: fc.constantFrom(...UNIVERSALS),
            currency: fc.constantFrom(...CURRENCIES),
            access: fc.constantFrom(...ACCESS),
            archived: fc.boolean(),
            tags: fc.array(fc.nat(), { maxLength: 3 }),
            cadence: fc.option(fc.integer({ min: 1, max: 400 }), { nil: null }),
            values: fc.array(
              fc.record({
                day: fc.integer({ min: 0, max: 1_100 }),
                minor: fc.integer({ min: -(10 ** 6), max: 10 ** 10 }),
                source: fc.constantFrom<ValueSource>('web', 'agent', 'system'),
              }),
              { maxLength: 3 },
            ),
          }),
          { maxLength: 220 },
        ),
      })
      .map(({ types, tags, holdings }): ContextInput => {
        const typeIds = types.map((_, i) => `typ_${i}`);
        const tagIds = tags.map((_, i) => `tag_${i}`);
        return {
          baseCurrency: 'EUR',
          types: types.map((customName, i) => ({
            id: `typ_${i}`,
            universal: UNIVERSALS[i % UNIVERSALS.length]!,
            packTypeKey: null,
            customName,
          })),
          tags: tags.map((tag, i) => ({ id: `tag_${i}`, name: tag })),
          connections: [
            { id: 'con_0', client: 'claude', guideName: 'Claude' },
            { id: 'con_1', client: 'other' },
          ],
          holdings: holdings.map((h, i) =>
            holding(`hld_${i}`, {
              name: h.name,
              kind: h.liability ? 'liability' : 'asset',
              typeId: typeIds[h.type % typeIds.length]!,
              universal: h.universal,
              currency: h.currency,
              cadenceDays: h.cadence,
              archived: h.archived && i % 5 === 0,
              access: h.liability ? null : h.access,
              accessReason: h.access === 'undecided' ? null : 'a reason as applied',
              tagIds: h.tags.flatMap((t) => (tagIds.length ? [tagIds[t % tagIds.length]!] : [])),
            }),
          ),
          values: holdings.flatMap((h, i) =>
            h.values.map((v, j) =>
              value(`hld_${i}`, addDays('2023-10-01', v.day), v.minor, {
                id: `val_${i}_${j}`,
                currency: h.currency,
                source: v.source,
                connectionId: v.source === 'agent' ? `con_${j % 3}` : null,
                clientName: v.source === 'agent' ? INJECTED_CLIENT_NAME : null,
              }),
            ),
          ),
        };
      });

    it('stay within 8 KB, fit the schema and report every undecided holding', () => {
      fc.assert(
        fc.property(accounts, (data) => {
          const ctx = compile(data);
          expect(bytes(ctx)).toBeLessThanOrEqual(8192);
          expect(JSON.stringify(financialContextSchema.parse(ctx))).toBe(JSON.stringify(ctx));
          expect(JSON.stringify(ctx)).not.toContain(INJECTED_CLIENT_NAME);

          const undecided = data.holdings.filter(
            (h) => !h.archived && h.kind === 'asset' && (h.access ?? 'undecided') === 'undecided',
          );
          expect(ctx.picture.undecided).toBe(undecided.length);
          if (undecided.length > 0) expect(ctx.picture.notes[0]).toMatch(/^Accessibility of /);
          for (const h of ctx.holdings.filter((h) => h.access === 'undecided')) {
            expect(undecided.map((u) => u.id)).toContain(h.id);
          }
        }),
        { numRuns: 60 },
      );
    });

    it('give the same bytes whatever order the input arrives in', () => {
      fc.assert(
        fc.property(accounts, fc.integer(), (data, seed) => {
          const shuffle = <T>(items: readonly T[]) =>
            items
              .map((item, i) => ({ item, key: (i * 7_919 + seed) % 104_729 }))
              .sort((a, b) => a.key - b.key)
              .map(({ item }) => item);
          const shuffled: ContextInput = {
            ...data,
            holdings: shuffle(data.holdings),
            values: shuffle(data.values),
            types: shuffle(data.types),
            tags: shuffle(data.tags),
          };
          expect(JSON.stringify(compile(shuffled))).toBe(JSON.stringify(compile(data)));
        }),
        { numRuns: 30 },
      );
    });
  });
});

describe('account fixtures', () => {
  it('apply accessibility through the chain they name', () => {
    const data = account({
      types: [{ id: 'typ_home', universal: 'property', packTypeKey: null, customName: null }],
      holdings: [{ name: 'Home', typeId: 'typ_home', answer: 'home' }],
    });
    expect(data.holdings[0]).toMatchObject({
      access: 'locked',
      accessReason: 'it’s your home',
      accessUntil: 'while you live in it',
      accessBasis: { via: 'answer', pack: 'generic', pack_version: 7 },
    });
  });
});
