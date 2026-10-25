import type {
  ErrorCode,
  McpCreateHoldingOutput,
  McpGetHoldingOutput,
  McpGetTaxonomyOutput,
  McpUpsertTagOutput,
  McpUpsertTypeOutput,
} from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOOL_REGISTRY } from '../../src/mcp/registry';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  callTool,
  connectAgent,
  errOf,
  json,
  mcpRequest,
  mcpTestApp,
  okOf,
  onboarded,
  restRequest,
  rpcOf,
  type ConnectedAgent,
  type McpTestApp,
} from './support';

/**
 * An agent's error names the tool's own fields (PRD J6, M12): for every write tool, each path its
 * validation and not-found errors name, in `fields`, in the message and in each field's message,
 * is a parameter of the tool's `inputSchema` as `tools/list` advertises it (as it is, or within
 * the item a field belongs to), or a parameter of a tool the message points to. A key the agent
 * sent that the tool does not have is named as it was sent. The message lists `fields` as they
 * are. The registry check fails when a write tool has no cases here; a new Ledger path without its
 * rename fails the case that reaches it. REST, whose contract is camelCase, answers the same
 * Ledger errors in the Ledger's own words.
 */

let db: TestDatabase;
let target: McpTestApp;

/** A JSON Schema node, as far as a field path walks it. */
interface JsonSchema {
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
}

/** Each tool's `inputSchema`, as `tools/list` gives it to the agent. */
let schemas: Record<string, JsonSchema>;

interface Fixture {
  agent: ConnectedAgent;
  userId: string;
  /** The plain cash type: `pot` and `franc` use it. */
  cashType: string;
  /** A custom cash type nothing uses. */
  noticeType: string;
  /** EUR, the default currency, with a value. */
  pot: string;
  potValue: string;
  /** CHF, a currency the fake rates do not have. */
  franc: string;
  /** A liability, which has no accessibility. */
  loan: string;
  joint: string;
  ours: string;
}

let f: Fixture;

beforeAll(async () => {
  db = await createTestDatabase();
  target = await mcpTestApp(db);
  const userId = await onboarded(target);
  const agent = await connectAgent(target, userId, { client: 'claude', clientName: 'Claude' });
  const call = (name: string, args: Record<string, unknown> = {}) =>
    callTool(target, agent.token, name, args);
  const listed = await rpcOf(
    await mcpRequest(target, agent.token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  );
  const tools = (listed.body.result as { tools: { name: string; inputSchema: JsonSchema }[] })
    .tools;
  schemas = Object.fromEntries(tools.map((t) => [t.name, t.inputSchema]));

  const taxonomy = okOf<McpGetTaxonomyOutput>(await call('get_taxonomy'));
  const cashType = taxonomy.types.find(
    (t) => t.universal_type === 'cash' && t.pack_type_key === null,
  )!.id;
  const noticeType = okOf<McpUpsertTypeOutput>(
    await call('upsert_type', { name: 'Notice account', universal_type: 'cash' }),
  ).result.id;
  const joint = okOf<McpUpsertTagOutput>(await call('upsert_tag', { name: 'Joint' })).result.id;
  const ours = okOf<McpUpsertTagOutput>(await call('upsert_tag', { name: 'Ours' })).result.id;
  const create = async (args: Record<string, unknown>) =>
    okOf<McpCreateHoldingOutput>(await call('create_holding', args)).result.id;
  const pot = await create({
    name: 'Everyday pot',
    kind: 'asset',
    type_id: cashType,
    currency: 'EUR',
    opening_value: { amount: '1200.00', date: '2026-07-01' },
  });
  const franc = await create({
    name: 'Franc tin',
    kind: 'asset',
    type_id: cashType,
    currency: 'CHF',
  });
  const loan = await create({
    name: 'Bike loan',
    kind: 'liability',
    universal_type: 'loan',
    currency: 'EUR',
  });
  const potValue = okOf<McpGetHoldingOutput>(await call('get_holding', { holding_id: pot })).values
    .items[0]!.id;
  f = { agent, userId, cashType, noticeType, pot, potValue, franc, loan, joint, ours };
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const NO_HOLDING = 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZZ';
const NO_VALUE = 'val_01K1G4KX00ZZZZZZZZZZZZZZZZZ';
const NO_TYPE = 'typ_01K1G4KX00ZZZZZZZZZZZZZZZZZ';
const NO_TAG = 'tag_01K1G4KX00ZZZZZZZZZZZZZZZZZ';
const OTHER_NO_TAG = 'tag_01K1G4KX00YYYYYYYYYYYYYYYYY';
/** More than a day after the fixed today (2026-08-01). */
const TOO_LATE = '2026-09-30';

/** One failing call and what its error names. */
interface Case {
  what: string;
  args: (fixture: Fixture) => Record<string, unknown>;
  code: ErrorCode;
  /** Every path `fields` names, in its order; none for an error about the call as a whole. */
  fields?: readonly string[];
  /** Of `fields`, the keys the agent sent that the tool does not have: named as sent. */
  sent?: readonly string[];
}

const asset = (fx: Fixture, more: Record<string, unknown> = {}) => ({
  name: 'Rainy-day pot',
  kind: 'asset',
  type_id: fx.cashType,
  currency: 'EUR',
  ...more,
});

/** Every write tool's validation and not-found errors, and the agent's misspelt fields. */
const CASES: Record<string, readonly Case[]> = {
  create_holding: [
    {
      what: 'both namings of the type, refused by its schema',
      args: (x) => asset(x, { universal_type: 'cash' }),
      code: 'VALIDATION_FAILED',
      fields: ['type_id'],
    },
    {
      what: 'a field it does not have, though the Ledger has it',
      args: (x) => asset(x, { access: 'now' }),
      code: 'VALIDATION_FAILED',
      fields: ['access'],
      sent: ['access'],
    },
    {
      what: 'a type that is not there',
      args: (x) => asset(x, { type_id: NO_TYPE }),
      code: 'NOT_FOUND',
      fields: ['type_id'],
    },
    {
      what: 'a tag that is not there',
      args: (x) => asset(x, { tag_ids: [x.joint, NO_TAG] }),
      code: 'NOT_FOUND',
      fields: ['tag_ids[1]'],
    },
    {
      what: 'an answer that does not fit the type',
      args: (x) => asset(x, { access_answer: 'bogus' }),
      code: 'VALIDATION_FAILED',
      fields: ['access_answer'],
    },
    {
      what: 'an answer for a liability',
      args: () => ({
        name: 'Car loan',
        kind: 'liability',
        universal_type: 'loan',
        currency: 'EUR',
        access_answer: 'now',
      }),
      code: 'VALIDATION_FAILED',
      fields: ['access_answer'],
    },
    {
      what: 'a currency not in circulation',
      args: (x) => asset(x, { currency: 'ZZZ' }),
      code: 'CURRENCY_UNSUPPORTED',
      fields: ['currency'],
    },
    {
      what: 'a first value in a currency with no rate',
      args: (x) => asset(x, { currency: 'CHF', opening_value: { amount: '10.00' } }),
      code: 'CURRENCY_UNSUPPORTED',
      fields: ['currency'],
    },
    {
      what: 'a first value that is not an amount',
      args: (x) => asset(x, { opening_value: { amount: 'twelve' } }),
      code: 'VALIDATION_FAILED',
      fields: ['opening_value.amount'],
    },
    {
      what: 'a first value dated too late, with too many decimals',
      args: (x) => asset(x, { opening_value: { amount: '10.001', date: TOO_LATE } }),
      code: 'OUT_OF_RANGE',
      fields: ['opening_value.date', 'opening_value.amount'],
    },
    {
      what: 'a rate for a first value in the default currency',
      args: (x) => asset(x, { opening_value: { amount: '10.00', fx_rate: '1.2' } }),
      code: 'VALIDATION_FAILED',
      fields: ['opening_value.fx_rate'],
    },
    {
      what: 'more problems than the message spells out',
      args: (x) => asset(x, { type_id: NO_TYPE, currency: 'ZZZ', tag_ids: [NO_TAG, OTHER_NO_TAG] }),
      code: 'NOT_FOUND',
      fields: ['type_id', 'currency', 'tag_ids[0]', 'tag_ids[1]'],
    },
    {
      what: 'a likely duplicate, and how to create it anyway',
      args: (x) => asset(x, { name: 'Everyday pot' }),
      code: 'LIKELY_DUPLICATE',
    },
  ],
  update_holding: [
    {
      what: 'a holding that is not there',
      args: () => ({ holding_id: NO_HOLDING, name: 'Elsewhere' }),
      code: 'NOT_FOUND',
    },
    {
      what: 'a type that is not there',
      args: (x) => ({ holding_id: x.pot, type_id: NO_TYPE }),
      code: 'NOT_FOUND',
      fields: ['type_id'],
    },
    {
      what: 'a tag that is not there',
      args: (x) => ({ holding_id: x.pot, tag_ids: [NO_TAG] }),
      code: 'NOT_FOUND',
      fields: ['tag_ids[0]'],
    },
    {
      what: 'an answer that does not fit the type',
      args: (x) => ({ holding_id: x.pot, access_answer: 'bogus' }),
      code: 'VALIDATION_FAILED',
      fields: ['access_answer'],
    },
    {
      what: 'an answer for a liability',
      args: (x) => ({ holding_id: x.loan, access_answer: 'now' }),
      code: 'VALIDATION_FAILED',
      fields: ['access_answer'],
    },
    {
      what: 'a cadence of no days, refused by its schema',
      args: (x) => ({ holding_id: x.pot, cadence_days: 0 }),
      code: 'VALIDATION_FAILED',
      fields: ['cadence_days'],
    },
    {
      what: 'the Ledger’s name for its id',
      args: (x) => ({ holdingId: x.pot, name: 'Elsewhere' }),
      code: 'VALIDATION_FAILED',
      fields: ['holding_id', 'holdingId'],
      sent: ['holdingId'],
    },
  ],
  delete_holding: [
    {
      what: 'a holding that is not there',
      args: () => ({ holding_id: NO_HOLDING }),
      code: 'NOT_FOUND',
    },
    {
      what: 'a blank id, refused by its schema',
      args: () => ({ holding_id: '' }),
      code: 'VALIDATION_FAILED',
      fields: ['holding_id'],
    },
    {
      what: 'the Ledger’s name for its id',
      args: (x) => ({ holdingId: x.pot }),
      code: 'VALIDATION_FAILED',
      fields: ['holding_id', 'holdingId'],
      sent: ['holdingId'],
    },
  ],
  record_values: [
    {
      what: 'a holding that is not there, after one that is (P3’s case)',
      args: (x) => ({
        values: [
          { holding_id: x.pot, amount: '1250.00', date: '2026-07-28' },
          { holding_id: NO_HOLDING, amount: '10.00' },
        ],
      }),
      code: 'NOT_FOUND',
      fields: ['values[1].holding_id'],
    },
    {
      what: 'more problems than the message spells out',
      args: () => ({
        values: Array.from({ length: 4 }, () => ({ holding_id: NO_HOLDING, amount: '1.00' })),
      }),
      code: 'NOT_FOUND',
      fields: [0, 1, 2, 3].map((i) => `values[${i}].holding_id`),
    },
    {
      what: 'a value that is not an amount',
      args: (x) => ({ values: [{ holding_id: x.pot, amount: 'twelve' }] }),
      code: 'VALIDATION_FAILED',
      fields: ['values[0].amount'],
    },
    {
      what: 'an amount with too many decimals',
      args: (x) => ({ values: [{ holding_id: x.pot, amount: '10.001' }] }),
      code: 'OUT_OF_RANGE',
      fields: ['values[0].amount'],
    },
    {
      what: 'a date too late',
      args: (x) => ({ values: [{ holding_id: x.pot, amount: '10.00', date: TOO_LATE }] }),
      code: 'OUT_OF_RANGE',
      fields: ['values[0].date'],
    },
    {
      what: 'a holding’s currency with no rate',
      args: (x) => ({ values: [{ holding_id: x.franc, amount: '10.00' }] }),
      code: 'CURRENCY_UNSUPPORTED',
      fields: ['values[0].currency'],
    },
    {
      what: 'a currency not in circulation',
      args: (x) => ({ values: [{ holding_id: x.pot, amount: '10.00', currency: 'ZZZ' }] }),
      code: 'CURRENCY_UNSUPPORTED',
      fields: ['values[0].currency'],
    },
    {
      what: 'a rate for a value in the default currency',
      args: (x) => ({ values: [{ holding_id: x.pot, amount: '10.00', fx_rate: '1.2' }] }),
      code: 'VALIDATION_FAILED',
      fields: ['values[0].fx_rate'],
    },
    {
      what: 'no values, refused by its schema',
      args: () => ({ values: [] }),
      code: 'VALIDATION_FAILED',
      fields: ['values'],
    },
    {
      what: 'the Ledger’s name for the rate',
      args: (x) => ({ values: [{ holding_id: x.pot, amount: '10.00', fxRate: '1.2' }] }),
      code: 'VALIDATION_FAILED',
      fields: ['values[0].fxRate'],
      sent: ['values[0].fxRate'],
    },
  ],
  update_value: [
    {
      what: 'a value that is not there',
      args: () => ({ value_id: NO_VALUE, amount: '10.00' }),
      code: 'NOT_FOUND',
    },
    {
      what: 'a value that is not an amount',
      args: (x) => ({ value_id: x.potValue, amount: 'twelve' }),
      code: 'VALIDATION_FAILED',
      fields: ['amount'],
    },
    {
      what: 'a date too late',
      args: (x) => ({ value_id: x.potValue, date: TOO_LATE }),
      code: 'OUT_OF_RANGE',
      fields: ['date'],
    },
    {
      what: 'a currency with no rate',
      args: (x) => ({ value_id: x.potValue, currency: 'CHF' }),
      code: 'CURRENCY_UNSUPPORTED',
      fields: ['currency'],
    },
    {
      what: 'a rate for a value in the default currency',
      args: (x) => ({ value_id: x.potValue, fx_rate: '1.2' }),
      code: 'VALIDATION_FAILED',
      fields: ['fx_rate'],
    },
    {
      what: 'the Ledger’s name for the rate',
      args: (x) => ({ value_id: x.potValue, fxRate: '1.2' }),
      code: 'VALIDATION_FAILED',
      fields: ['fxRate'],
      sent: ['fxRate'],
    },
  ],
  delete_value: [
    {
      what: 'a value that is not there',
      args: () => ({ value_id: NO_VALUE }),
      code: 'NOT_FOUND',
    },
    {
      what: 'an id that is not text, refused by its schema',
      args: () => ({ value_id: 42 }),
      code: 'VALIDATION_FAILED',
      fields: ['value_id'],
    },
    {
      what: 'the Ledger’s name for its id',
      args: (x) => ({ valueId: x.potValue }),
      code: 'VALIDATION_FAILED',
      fields: ['value_id', 'valueId'],
      sent: ['valueId'],
    },
  ],
  upsert_type: [
    {
      what: 'a type that is not there',
      args: () => ({ type_id: NO_TYPE, name: 'Elsewhere' }),
      code: 'NOT_FOUND',
    },
    {
      what: 'another universal type for a type',
      args: (x) => ({ type_id: x.cashType, name: 'Day to day', universal_type: 'listed' }),
      code: 'VALIDATION_FAILED',
      fields: ['universal_type'],
    },
    {
      what: 'a new type without its universal type, refused by its schema',
      args: () => ({ name: 'Notice account' }),
      code: 'VALIDATION_FAILED',
      fields: ['universal_type'],
    },
    {
      what: 'the Ledger’s name for the universal type',
      args: () => ({ name: 'Notice account', universal: 'cash' }),
      code: 'VALIDATION_FAILED',
      fields: ['universal', 'universal_type'],
      sent: ['universal'],
    },
  ],
  delete_type: [
    {
      what: 'a type that is not there',
      args: () => ({ type_id: NO_TYPE }),
      code: 'NOT_FOUND',
    },
    {
      what: 'a move into itself',
      args: (x) => ({ type_id: x.noticeType, move_holdings_to: x.noticeType }),
      code: 'VALIDATION_FAILED',
      fields: ['move_holdings_to'],
    },
    {
      what: 'a move into a type that is not there',
      args: (x) => ({ type_id: x.noticeType, move_holdings_to: NO_TYPE }),
      code: 'NOT_FOUND',
      fields: ['move_holdings_to'],
    },
    {
      what: 'a type holdings use, with nowhere to move them',
      args: (x) => ({ type_id: x.cashType }),
      code: 'VALIDATION_FAILED',
      fields: ['move_holdings_to'],
    },
    {
      what: 'the Ledger’s name for the move',
      args: (x) => ({ type_id: x.cashType, moveTo: x.noticeType }),
      code: 'VALIDATION_FAILED',
      fields: ['moveTo'],
      sent: ['moveTo'],
    },
  ],
  upsert_tag: [
    {
      what: 'a tag that is not there',
      args: () => ({ tag_id: NO_TAG, name: 'Elsewhere' }),
      code: 'NOT_FOUND',
    },
    {
      what: 'a new tag with a name taken',
      args: () => ({ name: 'joint' }),
      code: 'VALIDATION_FAILED',
      fields: ['name'],
    },
    {
      what: 'a rename to a name taken, pointing to the merge',
      args: (x) => ({ tag_id: x.ours, name: 'JOINT' }),
      code: 'VALIDATION_FAILED',
      fields: ['name'],
    },
    {
      what: 'a blank name, refused by its schema',
      args: () => ({ name: '  ' }),
      code: 'VALIDATION_FAILED',
      fields: ['name'],
    },
    {
      what: 'the Ledger’s name for its id',
      args: (x) => ({ tagId: x.ours, name: 'Shared' }),
      code: 'VALIDATION_FAILED',
      fields: ['tagId'],
      sent: ['tagId'],
    },
  ],
  delete_tag: [
    {
      what: 'a tag that is not there',
      args: () => ({ tag_id: NO_TAG }),
      code: 'NOT_FOUND',
    },
    {
      what: 'a merge into itself',
      args: (x) => ({ tag_id: x.ours, merge_into: x.ours }),
      code: 'VALIDATION_FAILED',
      fields: ['merge_into'],
    },
    {
      what: 'a merge into a tag that is not there',
      args: (x) => ({ tag_id: x.ours, merge_into: NO_TAG }),
      code: 'NOT_FOUND',
      fields: ['merge_into'],
    },
    {
      what: 'the Ledger’s name for the merge',
      args: (x) => ({ tag_id: x.ours, mergeInto: x.joint }),
      code: 'VALIDATION_FAILED',
      fields: ['mergeInto'],
      sent: ['mergeInto'],
    },
  ],
};

const WRITE_TOOLS = TOOL_REGISTRY.filter((t) => t.kind === 'write');
const TOOL_NAMES = new Set(TOOL_REGISTRY.map((t) => t.name as string));

/** Whether `path` (`values[1].holding_id`) is a parameter of `schema`, nested or not. */
function isParameter(schema: JsonSchema | undefined, path: string): boolean {
  const segments = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  const rebuilt = segments.reduce(
    (out, s) => (s.startsWith('[') ? `${out}${s}` : out === '' ? s : `${out}.${s}`),
    '',
  );
  if (schema === undefined || segments.length === 0 || rebuilt !== path) return false;
  const choices = (node: JsonSchema): JsonSchema[] => [
    node,
    ...(node.anyOf ?? []).flatMap(choices),
  ];
  let at: JsonSchema[] = [schema];
  for (const segment of segments) {
    at = at.flatMap(choices).flatMap((node) => {
      const next = segment.startsWith('[') ? node.items : node.properties?.[segment];
      return next === undefined ? [] : [next];
    });
    if (at.length === 0) return false;
  }
  return true;
}

/**
 * What `text` names that is a field path, outside the double quotes around what the agent or
 * the content gave: a name with an index or a dot (`values[1].holding_id`), a camelCase name
 * (`fxRate`) and a snake_case one (`merge_into`). A plain word is not one.
 */
function pathsIn(text: string): string[] {
  const outside = text
    .split('"')
    .filter((_, i) => i % 2 === 0)
    .join(' ');
  return [...outside.matchAll(/(?<![\w.[\]])[A-Za-z_]\w*(?:\[\d+\]|\.[A-Za-z_]\w*)*/g)]
    .map((m) => m[0])
    .filter(
      (t) => /[.[]/.test(t) || /^[a-z][a-z0-9]*[A-Z]/.test(t) || /^[a-z]+(?:_[a-z]+)+$/.test(t),
    );
}

describe('every write tool’s errors name its own fields', () => {
  it('has cases for every write tool: a validation error, a not-found and a misspelt field', () => {
    expect(Object.keys(CASES).sort()).toStrictEqual(WRITE_TOOLS.map((t) => t.name).sort());
    for (const [tool, cases] of Object.entries(CASES)) {
      expect(
        cases.some((c) => c.code === 'NOT_FOUND'),
        tool,
      ).toBe(true);
      expect(
        cases.some((c) => c.code !== 'NOT_FOUND' && c.fields !== undefined && c.sent === undefined),
        tool,
      ).toBe(true);
      expect(
        cases.some((c) => c.sent !== undefined),
        tool,
      ).toBe(true);
    }
  });

  it('renames each Ledger name to a parameter of the tool', () => {
    for (const tool of WRITE_TOOLS) {
      for (const to of Object.values(tool.renames)) {
        expect(isParameter(schemas[tool.name], to), `${tool.name}: ${to}`).toBe(true);
      }
    }
  });

  for (const [tool, cases] of Object.entries(CASES)) {
    describe(tool, () => {
      for (const c of cases) {
        it(c.what, async () => {
          const error = errOf(await callTool(target, f.agent.token, tool, c.args(f)), c.code);
          const fields = error.fields ?? {};
          const seen = JSON.stringify(error);
          expect(Object.keys(fields), seen).toStrictEqual([...(c.fields ?? [])]);

          // The message lists the fields as `fields` has them, the first one first.
          const entries = Object.entries(fields);
          if (entries[0]) expect(error.message.startsWith(`${entries[0][0]}: `), seen).toBe(true);
          for (const [path, message] of entries.slice(0, 3)) {
            expect(error.message, seen).toContain(`${path}: ${message}`);
          }

          // Every path named is the tool's: as it is, or within the item a field belongs to
          // ("values[0].fx_rate: … leave fx_rate out"), or one of a tool the message points to.
          const sent = new Set(c.sent ?? []);
          const named = [
            ...Object.keys(fields),
            ...pathsIn(error.message),
            ...Object.values(fields).flatMap(pathsIn),
          ];
          const items = Object.keys(fields).flatMap((p) => {
            const parent = p.replace(/(?:\.[^.[\]]+|\[\d+\])$/, '');
            return parent === p ? [] : [parent];
          });
          const pointedTo = named.filter((p) => TOOL_NAMES.has(p) && p !== tool);
          for (const path of named) {
            if (sent.has(path) || TOOL_NAMES.has(path)) continue;
            const known =
              isParameter(schemas[tool], path) ||
              items.some((item) => isParameter(schemas[tool], `${item}.${path}`)) ||
              pointedTo.some((other) => isParameter(schemas[other], path));
            expect(known, `${path} in ${seen}`).toBe(true);
          }
        });
      }
    });
  }
});

describe('REST keeps the Ledger’s own names', () => {
  /** REST's error body for `method path body`, after checking its status. */
  async function restError(
    status: number,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ code: string; message: string; fields?: Record<string, string> }> {
    const res = await restRequest(target, f.userId, method, path, body);
    return (await json<{ error: { code: string; message: string } }>(res, status)).error;
  }

  async function mcpError(tool: string, args: Record<string, unknown>, code: ErrorCode) {
    return errOf(await callTool(target, f.agent.token, tool, args), code);
  }

  const baseRate = (field: string) =>
    `The value is in EUR, the base currency, so its rate is 1: leave ${field} out.`;

  it('names a value’s rate fxRate over REST and fx_rate to the agent', async () => {
    expect(
      await restError(400, 'POST', `/api/holdings/${f.pot}/values`, {
        amount: '10.00',
        fxRate: '1.2',
      }),
    ).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: `fxRate: ${baseRate('fxRate')}`,
      fields: { fxRate: baseRate('fxRate') },
    });
    expect(
      await mcpError(
        'record_values',
        { values: [{ holding_id: f.pot, amount: '10.00', fx_rate: '1.2' }] },
        'VALIDATION_FAILED',
      ),
    ).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: `values[0].fx_rate: ${baseRate('fx_rate')}`,
      fields: { 'values[0].fx_rate': baseRate('fx_rate') },
    });
  });

  it('names a new holding’s type and first value in camelCase over REST', async () => {
    const missing = `There is no type "${NO_TYPE}" in this account.`;
    expect(
      await restError(404, 'POST', '/api/holdings', {
        name: 'Rainy-day pot',
        kind: 'asset',
        typeId: NO_TYPE,
        currency: 'EUR',
        via: 'form',
        opening: { amount: '10.00', fxRate: '1.2' },
      }),
    ).toStrictEqual({
      code: 'NOT_FOUND',
      message: `typeId: ${missing} opening.fxRate: ${baseRate('fxRate')}`,
      fields: { typeId: missing, 'opening.fxRate': baseRate('fxRate') },
    });
    expect(
      await mcpError(
        'create_holding',
        asset(f, { type_id: NO_TYPE, opening_value: { amount: '10.00', fx_rate: '1.2' } }),
        'NOT_FOUND',
      ),
    ).toStrictEqual({
      code: 'NOT_FOUND',
      message: `type_id: ${missing} opening_value.fx_rate: ${baseRate('fx_rate')}`,
      fields: { type_id: missing, 'opening_value.fx_rate': baseRate('fx_rate') },
    });
  });

  it('points to moveTo over REST and move_holdings_to for the agent', async () => {
    const refused = (field: string) =>
      `2 holdings use this type: give ${field}, the type to move them to.`;
    expect(await restError(400, 'DELETE', `/api/types/${f.cashType}`)).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: `moveTo: ${refused('moveTo')}`,
      fields: { moveTo: refused('moveTo') },
    });
    expect(
      await mcpError('delete_type', { type_id: f.cashType }, 'VALIDATION_FAILED'),
    ).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: `move_holdings_to: ${refused('move_holdings_to')}`,
      fields: { move_holdings_to: refused('move_holdings_to') },
    });
  });

  it('points to deleteTag and mergeInto over REST, delete_tag and merge_into for the agent', async () => {
    const taken = (tool: string, field: string) =>
      `Another tag already has this name ("${f.joint}"): merge into it with ${tool} and ${field}.`;
    expect(await restError(400, 'PATCH', `/api/tags/${f.ours}`, { name: 'JOINT' })).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: `name: ${taken('deleteTag', 'mergeInto')}`,
      fields: { name: taken('deleteTag', 'mergeInto') },
    });
    expect(
      await mcpError('upsert_tag', { tag_id: f.ours, name: 'JOINT' }, 'VALIDATION_FAILED'),
    ).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: `name: ${taken('delete_tag', 'merge_into')}`,
      fields: { name: taken('delete_tag', 'merge_into') },
    });
  });
});
