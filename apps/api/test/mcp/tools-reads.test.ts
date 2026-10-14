import type {
  McpCreateHoldingOutput,
  McpGetFinancialContextOutput,
  McpGetHoldingOutput,
  McpGetNetWorthHistoryOutput,
  McpGetPeriodChangesOutput,
  McpGetSetupGuideOutput,
  McpGetTaxonomyOutput,
  McpListHoldingsOutput,
} from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  errOf,
  ledgerOf,
  mcpTestApp,
  newPerson,
  okOf,
  onboarded,
  type ConnectedAgent,
  type McpTestApp,
} from './support';

/**
 * The seven read tools (architecture §7.4): a happy path, a validation error and not-found each,
 * and the proof that a read changes nothing.
 */

let db: TestDatabase;
let target: McpTestApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = await mcpTestApp(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

interface Seeded {
  agent: ConnectedAgent;
  cashType: string;
  listedType: string;
  propertyType: string;
  freshHolding: string;
  staleHolding: string;
  gbpHolding: string;
}

/** A person with three holdings: a fresh EUR one, a stale EUR one and a GBP one. */
async function seeded(): Promise<Seeded> {
  const userId = await onboarded(target);
  const agent = await connectAgent(target, userId, { client: 'claude', clientName: 'Claude' });
  const taxonomy = okOf<McpGetTaxonomyOutput>(await callTool(target, agent.token, 'get_taxonomy'));
  const plain = (universal: string) =>
    taxonomy.types.find((t) => t.universal_type === universal && t.pack_type_key === null)!.id;
  const cashType = plain('cash');
  const listedType = plain('listed');
  const propertyType = plain('property');
  const create = async (args: Record<string, unknown>) =>
    okOf<McpCreateHoldingOutput>(await callTool(target, agent.token, 'create_holding', args))
      .result;
  const fresh = await create({
    name: 'Everyday pot',
    kind: 'asset',
    type_id: cashType,
    currency: 'EUR',
    opening_value: { amount: '1200.00', date: '2026-07-01' },
  });
  const stale = await create({
    name: 'Old tin',
    kind: 'asset',
    type_id: cashType,
    currency: 'EUR',
    opening_value: { amount: '50.00', date: '2026-06-01' },
  });
  const gbp = await create({
    name: 'London shares',
    kind: 'asset',
    type_id: listedType,
    currency: 'GBP',
  });
  await callTool(target, agent.token, 'record_values', {
    values: [
      { holding_id: fresh.id, amount: '1250.00', date: '2026-07-28' },
      { holding_id: gbp.id, amount: '400.00', date: '2026-07-15' },
    ],
  });
  await target.settle();
  return {
    agent,
    cashType,
    listedType,
    propertyType,
    freshHolding: fresh.id,
    staleHolding: stale.id,
    gbpHolding: gbp.id,
  };
}

async function dataVersion(userId: string): Promise<number | null> {
  const { rows } = await db.owner.query<{ data_version: number }>(
    `select data_version from ledger.ledger_state where user_id = $1`,
    [userId],
  );
  return rows[0]?.data_version ?? null;
}

describe('get_financial_context', () => {
  it('returns the whole picture in one call', async () => {
    const { agent } = await seeded();
    const context = okOf<McpGetFinancialContextOutput>(
      await callTool(target, agent.token, 'get_financial_context', { baseline: 'last_month' }),
    );
    expect(context.currency).toBe('EUR');
    expect(context.as_of).toBe('2026-08-01');
    expect(context.totals.net_worth).toBeGreaterThan(0);
    expect(context.totals.change.baseline).toBe('last_month');
    expect(context.picture.holdings).toBe(3);
    expect(context.holdings).toHaveLength(3);
    expect(context.answer_guide.length).toBeGreaterThan(0);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(8192);
  });

  it('rejects an unknown baseline', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'get_financial_context', { baseline: 'last_week' }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('baseline');
  });

  it('needs a ledger', async () => {
    const userId = await newPerson(target);
    const agent = await connectAgent(target, userId);
    errOf(await callTool(target, agent.token, 'get_financial_context'), 'NOT_FOUND');
  });
});

describe('list_holdings', () => {
  it('lists with latest values, and pages', async () => {
    const { agent } = await seeded();
    const first = okOf<McpListHoldingsOutput>(
      await callTool(target, agent.token, 'list_holdings', { limit: 2 }),
    );
    expect(first.holdings).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    expect(first.holdings[0]?.latest?.amount).toBe(1250);
    expect(first.holdings[0]?.access).toBe('accessible');
    const second = okOf<McpListHoldingsOutput>(
      await callTool(target, agent.token, 'list_holdings', { limit: 2, cursor: first.next_cursor }),
    );
    expect(second.holdings).toHaveLength(1);
    expect(second.next_cursor).toBeNull();
  });

  it('filters by staleness and query', async () => {
    const { agent } = await seeded();
    const stale = okOf<McpListHoldingsOutput>(
      await callTool(target, agent.token, 'list_holdings', { stale_only: true }),
    );
    expect(stale.holdings.map((h) => h.name)).toStrictEqual(['Old tin']);
    const queried = okOf<McpListHoldingsOutput>(
      await callTool(target, agent.token, 'list_holdings', { query: 'london' }),
    );
    expect(queried.holdings.map((h) => h.name)).toStrictEqual(['London shares']);
  });

  it('rejects a limit over 100', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'list_holdings', { limit: 101 }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('limit');
  });

  it('names an unknown type filter', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'list_holdings', {
        type_ids: ['typ_01K1G4KX00ZZZZZZZZZZZZ'],
      }),
      'NOT_FOUND',
    );
    expect(error.fields).toHaveProperty('type_ids[0]');
  });
});

describe('get_holding', () => {
  it('returns the holding with a page of its values', async () => {
    const { agent, freshHolding } = await seeded();
    const holding = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: freshHolding }),
    );
    expect(holding.name).toBe('Everyday pot');
    expect(holding.type_label).toBe('Current account');
    expect(holding.values.items.map((v) => v.amount)).toStrictEqual([1250, 1200]);
    expect(holding.values.items[0]?.source).toBe('agent');
    expect(holding.values.next_cursor).toBeNull();
  });

  it('rejects a values limit over 500', async () => {
    const { agent, freshHolding } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'get_holding', {
        holding_id: freshHolding,
        values_limit: 501,
      }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('values_limit');
  });

  it('names an unknown holding', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'get_holding', {
        holding_id: 'hld_01K1G4KX00ZZZZZZZZZZZZ',
      }),
      'NOT_FOUND',
    );
  });
});

describe('get_net_worth_history', () => {
  it('returns the series, carried or observed', async () => {
    const { agent } = await seeded();
    const history = okOf<McpGetNetWorthHistoryOutput>(
      await callTool(target, agent.token, 'get_net_worth_history', { interval: 'month' }),
    );
    expect(history.currency).toBe('EUR');
    expect(history.interval).toBe('month');
    expect(history.points.length).toBeGreaterThan(0);
    expect(history.points.at(-1)?.total).toBeGreaterThan(0);
    for (const point of history.points) expect(typeof point.carried).toBe('boolean');
  });

  it('splits by currency', async () => {
    const { agent } = await seeded();
    const history = okOf<McpGetNetWorthHistoryOutput>(
      await callTool(target, agent.token, 'get_net_worth_history', { group_by: 'currency' }),
    );
    expect(history.group_by).toBe('currency');
    const last = history.points.at(-1);
    expect(Object.keys(last?.groups ?? {}).sort()).toStrictEqual(['EUR', 'GBP']);
  });

  it('orders its range', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'get_net_worth_history', {
        from: '2026-08-01',
        to: '2026-01-01',
      }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('from');
  });

  it('needs a ledger', async () => {
    const userId = await newPerson(target);
    const agent = await connectAgent(target, userId);
    errOf(await callTool(target, agent.token, 'get_net_worth_history'), 'NOT_FOUND');
  });
});

describe('get_period_changes', () => {
  it('returns each period newest first, with its change and ranked drivers', async () => {
    const { agent, freshHolding, staleHolding, gbpHolding } = await seeded();
    const gbp = okOf<McpGetHoldingOutput>(
      await callTool(target, agent.token, 'get_holding', { holding_id: gbpHolding }),
    );
    const gbpBase = gbp.latest?.base_amount ?? 0;
    expect(gbpBase).toBeGreaterThan(0);
    const result = await callTool(target, agent.token, 'get_period_changes', {
      view: 'monthly',
    });
    const table = okOf<McpGetPeriodChangesOutput>(result);
    expect(result.content[0]?.text).toBe('3 monthly periods in EUR.');
    expect(table.currency).toBe('EUR');
    expect(table.view).toBe('monthly');
    expect(table.periods.map((p) => [p.start, p.end])).toEqual([
      ['2026-08-01', '2026-08-01'],
      ['2026-07-01', '2026-07-31'],
      ['2026-06-01', '2026-06-30'],
    ]);
    expect(table.periods[2]).toStrictEqual({
      start: '2026-06-01',
      end: '2026-06-30',
      end_value: 50,
      change: 50,
      change_pct: null,
      carried: false,
      drivers: [{ holding_id: staleHolding, name: 'Old tin', contribution: 50 }],
    });
    const july = table.periods[1]!;
    expect(july.end_value).toBe(1250 + 50 + gbpBase);
    expect(july.change).toBe(1250 + gbpBase);
    expect(july.carried).toBe(true);
    expect(july.drivers).toStrictEqual([
      { holding_id: freshHolding, name: 'Everyday pot', contribution: 1250 },
      { holding_id: gbpHolding, name: 'London shares', contribution: gbpBase },
    ]);
    expect(table.periods[0]).toMatchObject({
      end_value: july.end_value,
      change: 0,
      change_pct: 0,
      carried: true,
      drivers: [],
    });
  });

  it('pages the newest periods with each one’s top drivers', async () => {
    const { agent, freshHolding } = await seeded();
    const table = okOf<McpGetPeriodChangesOutput>(
      await callTool(target, agent.token, 'get_period_changes', {
        view: 'monthly',
        periods: 2,
        drivers: 1,
      }),
    );
    expect(table.periods.map((p) => p.start)).toEqual(['2026-08-01', '2026-07-01']);
    expect(table.periods[1]?.drivers).toStrictEqual([
      { holding_id: freshHolding, name: 'Everyday pot', contribution: 1250 },
    ]);
    const quarterly = okOf<McpGetPeriodChangesOutput>(
      await callTool(target, agent.token, 'get_period_changes', {
        view: 'quarterly',
        periods: 1,
      }),
    );
    expect(quarterly.periods.map((p) => [p.start, p.end])).toEqual([['2026-07-01', '2026-08-01']]);
  });

  it('names a bad view and counts outside 1 to 24 periods and 1 to 25 drivers', async () => {
    const { agent } = await seeded();
    const view = errOf(
      await callTool(target, agent.token, 'get_period_changes', { view: 'weekly' }),
      'VALIDATION_FAILED',
    );
    expect(view.fields).toHaveProperty('view');
    const many = errOf(
      await callTool(target, agent.token, 'get_period_changes', { view: 'monthly', periods: 25 }),
      'VALIDATION_FAILED',
    );
    expect(many.fields).toHaveProperty('periods');
    const none = errOf(
      await callTool(target, agent.token, 'get_period_changes', { view: 'monthly', drivers: 0 }),
      'VALIDATION_FAILED',
    );
    expect(none.fields).toHaveProperty('drivers');
  });

  it('needs a ledger', async () => {
    const userId = await newPerson(target);
    const agent = await connectAgent(target, userId);
    errOf(
      await callTool(target, agent.token, 'get_period_changes', { view: 'monthly' }),
      'NOT_FOUND',
    );
  });
});

describe('get_taxonomy', () => {
  it('returns types with labels and meanings, and tags', async () => {
    const { agent, cashType } = await seeded();
    const taxonomy = okOf<McpGetTaxonomyOutput>(
      await callTool(target, agent.token, 'get_taxonomy'),
    );
    const cash = taxonomy.types.find((t) => t.id === cashType);
    expect(cash?.label).toBe('Current account');
    expect(cash?.meaning).toBe('Meaning of cash.');
    expect(taxonomy.types.some((t) => t.pack_type_key === 'auto_loan')).toBe(true);
    expect(taxonomy.tags).toStrictEqual([]);
  });

  it('rejects arguments', async () => {
    const { agent } = await seeded();
    errOf(
      await callTool(target, agent.token, 'get_taxonomy', { country: 'QZ' }),
      'VALIDATION_FAILED',
    );
  });

  it('needs a ledger', async () => {
    const userId = await newPerson(target);
    const agent = await connectAgent(target, userId);
    errOf(await callTool(target, agent.token, 'get_taxonomy'), 'NOT_FOUND');
  });
});

describe('get_setup_guide', () => {
  it('answers the profile country by default', async () => {
    const { agent } = await seeded();
    const guide = okOf<McpGetSetupGuideOutput>(
      await callTool(target, agent.token, 'get_setup_guide'),
    );
    expect(guide.country).toBe('QZ');
    expect(guide.currency).toBe('EUR');
    expect(guide.checklist.map((i) => i.id)).toStrictEqual(['motor', 'everyday', 'home']);
    expect(guide.checklist[0]?.type_label).toBe('Auto loan');
    expect(guide.questions.map((q) => q.universal_type)).toContain('equity');
    expect(guide.questions.map((q) => q.universal_type)).toContain('property');
    expect(guide.other_question.ask).toBe('Could you use it within a month?');
  });

  it('answers a country without a pack with generic', async () => {
    const { agent } = await seeded();
    const guide = okOf<McpGetSetupGuideOutput>(
      await callTool(target, agent.token, 'get_setup_guide', { country: 'GB' }),
    );
    expect(guide.country).toBe('GB');
    expect(guide.currency).toBe('GBP');
    expect(guide.checklist.map((i) => i.id)).toStrictEqual(['everyday', 'home']);
  });

  it('answers no country with generic', async () => {
    const userId = await newPerson(target);
    const agent = await connectAgent(target, userId);
    const guide = okOf<McpGetSetupGuideOutput>(
      await callTool(target, agent.token, 'get_setup_guide'),
    );
    expect(guide.country).toBeNull();
    expect(guide.currency).toBeNull();
    expect(guide.checklist.length).toBeGreaterThan(0);
  });

  it('rejects a malformed country', async () => {
    const { agent } = await seeded();
    const error = errOf(
      await callTool(target, agent.token, 'get_setup_guide', { country: 'QZZ' }),
      'VALIDATION_FAILED',
    );
    expect(error.fields).toHaveProperty('country');
  });

  it('names an unknown country', async () => {
    const { agent } = await seeded();
    errOf(await callTool(target, agent.token, 'get_setup_guide', { country: 'XX' }), 'NOT_FOUND');
  });
});

describe('reads change nothing', () => {
  it('leaves data_version and every row as they were', async () => {
    const { agent, freshHolding, cashType } = await seeded();
    const before = await ledgerOf(target, agent.userId);
    const version = await dataVersion(agent.userId);
    const calls: [string, Record<string, unknown>][] = [
      ['get_financial_context', { baseline: 'last_year' }],
      ['list_holdings', { limit: 1 }],
      ['get_holding', { holding_id: freshHolding }],
      ['get_net_worth_history', { group_by: 'access' }],
      ['get_period_changes', { view: 'monthly' }],
      ['get_taxonomy', {}],
      ['get_setup_guide', {}],
      ['list_holdings', { type_ids: [cashType], archived: 'include' }],
    ];
    for (const [name, args] of calls) {
      const result = await callTool(target, agent.token, name, args);
      expect(result.isError ?? false, name).toBe(false);
    }
    await target.settle();
    expect(await ledgerOf(target, agent.userId)).toBe(before);
    expect(await dataVersion(agent.userId)).toBe(version);
  });
});
