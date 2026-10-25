import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { ERROR_CODES } from './errors';
import {
  AGENT_TOOLS,
  CLIENT_EVENT_NAMES,
  EVENT_NAMES,
  SEGMENTS,
  SESSIONLESS_EVENT_NAMES,
  eventSchemas,
  isClientEventName,
  isEventName,
  isSessionlessEventName,
  type ClientEvent,
  type EventName,
  type EventProps,
} from './events';

/* ---- architecture §7.7 and PRD §3.5, written out: the contract the schemas must equal ---- */

/** A prop's allowed values as the spec writes them: an enum's options, or an integer range. */
type SpecLeaf = readonly string[] | { int: readonly [number, number] };

const METHOD = ['email', 'google', 'apple'];
const SOURCE = ['web', 'agent'];
const CLIENT = ['claude', 'chatgpt', 'other'];
const CONNECTION_ENTRY = ['onboarding', 'home', 'holding', 'agent'];
const CHANNEL = ['push', 'email'];
const PLATFORM = ['ios', 'android', 'desktop'];
const PROMPT_ENTRY = ['home', 'settings'];
const TOOLS = [
  'get_financial_context',
  'list_holdings',
  'get_holding',
  'get_net_worth_history',
  'get_period_changes',
  'get_taxonomy',
  'get_setup_guide',
  'list_activity',
  'create_holding',
  'update_holding',
  'delete_holding',
  'record_values',
  'update_value',
  'delete_value',
  'upsert_type',
  'delete_type',
  'upsert_tag',
  'delete_tag',
];

/** `name?` marks an optional prop. */
const SPEC: Record<string, Record<string, SpecLeaf>> = {
  landing_view: {},
  signup_started: { method: METHOD },
  account_created: { method: METHOD },
  session_started: {},
  holding_created: { source: SOURCE, 'via?': ['guided', 'form'] },
  value_recorded: { source: SOURCE },
  value_corrected: {
    original_source: ['web', 'agent', 'system'],
    age_at_correction: { int: [0, 36_500] },
  },
  agent_connection_started: { client: CLIENT, entry: CONNECTION_ENTRY },
  agent_connection_completed: { client: CLIENT, entry: CONNECTION_ENTRY },
  agent_connection_failed: {
    step: ['authorise', 'callback', 'discovery', 'first_call'],
    client: CLIENT,
    entry: CONNECTION_ENTRY,
  },
  agent_tool_called: {
    tool: TOOLS,
    kind: ['read', 'write'],
    outcome: [
      'ok',
      'VALIDATION_FAILED',
      'OUT_OF_RANGE',
      'CURRENCY_UNSUPPORTED',
      'UNAUTHENTICATED',
      'NOT_FOUND',
      'LIKELY_DUPLICATE',
      'EMAIL_NOT_VERIFIED',
      'SCOPE_REQUIRED',
      'REAUTH_REQUIRED',
      'RATE_LIMITED',
      'INTERNAL',
    ],
    latency_ms: { int: [0, 900_000] },
    client: CLIENT,
  },
  insights_viewed: { view: ['monthly', 'quarterly', 'yearly'] },
  reminder_sent: { channel: CHANNEL },
  reminder_opened: { channel: CHANNEL },
  security_email_sent: { client: CLIENT },
  push_prompt_shown: { entry: PROMPT_ENTRY },
  push_prompt_result: { entry: PROMPT_ENTRY, result: ['granted', 'denied', 'not_now'] },
  push_enabled: { platform: PLATFORM },
  push_disabled: { platform: PLATFORM, by: ['user', 'browser', 'signout'] },
  account_deleted: {},
};

/* ---- reading a schema back ---- */

/** A prop as read back from its schema; `forbidden` is anything but enum, boolean or bounded int. */
type Leaf =
  { enum: string[] } | { int: [number, number] } | { boolean: true } | { forbidden: string };

function leafOf(schema: z.ZodType): Leaf {
  if (schema instanceof z.ZodEnum) {
    const options: string[] = Object.values(schema.enum as Record<string, string>);
    return { enum: options.sort() };
  }
  if (schema instanceof z.ZodBoolean) return { boolean: true };
  if (schema instanceof z.ZodNumber) {
    const { minValue, maxValue, isInt } = schema;
    if (isInt && minValue !== null && maxValue !== null) {
      if (Number.isFinite(minValue) && Number.isFinite(maxValue))
        return { int: [minValue, maxValue] };
    }
    return { forbidden: 'unbounded or fractional number' };
  }
  return { forbidden: schema.constructor.name };
}

function propsOf(schema: z.ZodObject): Record<string, Leaf> {
  const out: Record<string, Leaf> = {};
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    if (field instanceof z.ZodOptional) {
      const inner: z.ZodType = field.unwrap() as z.ZodType;
      out[`${key}?`] = leafOf(inner);
    } else {
      out[key] = leafOf(field);
    }
  }
  return out;
}

function isEnumSpec(leaf: SpecLeaf): leaf is readonly string[] {
  return Array.isArray(leaf);
}

function described(spec: Record<string, SpecLeaf>): Record<string, Leaf> {
  return Object.fromEntries(
    Object.entries(spec).map(([key, leaf]): [string, Leaf] => [
      key,
      isEnumSpec(leaf) ? { enum: [...leaf].sort() } : { int: [leaf.int[0], leaf.int[1]] },
    ]),
  );
}

/** Props that pass: the first option of each enum, the lowest integer, every optional prop. */
function validProps(schema: z.ZodObject): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, leaf] of Object.entries(propsOf(schema))) {
    const prop = key.replace(/\?$/, '');
    if ('enum' in leaf) out[prop] = leaf.enum.includes('web') ? 'web' : leaf.enum[0];
    else if ('int' in leaf) out[prop] = leaf.int[0];
    else if ('boolean' in leaf) out[prop] = true;
  }
  return out;
}

/** Words that say a prop carries an amount, a name or free text (N9, CONVENTIONS §6). */
const FORBIDDEN_IN_PROP_NAMES = [
  'amount',
  'value',
  'total',
  'balance',
  'price',
  'cost',
  'sum',
  'worth',
  'money',
  'currency',
  'minor',
  'name',
  'label',
  'title',
  'email',
  'phone',
  'address',
  'text',
  'message',
  'note',
  'body',
  'content',
  'document',
  'file',
  'query',
  'url',
];

function privacyProblems(name: string, schema: z.ZodObject): string[] {
  const problems: string[] = [];
  for (const [key, leaf] of Object.entries(propsOf(schema))) {
    const prop = key.replace(/\?$/, '');
    if ('forbidden' in leaf) problems.push(`${name}.${prop}: FORBIDDEN ${leaf.forbidden}`);
    if ('enum' in leaf) {
      for (const option of leaf.enum) {
        if (!/^([a-z][a-z0-9_]*|[A-Z][A-Z_]*)$/.test(option)) {
          problems.push(`${name}.${prop}: option "${option}" is not a token`);
        }
      }
    }
    for (const word of FORBIDDEN_IN_PROP_NAMES) {
      if (prop.includes(word)) problems.push(`${name}.${prop}: suggests ${word}`);
    }
  }
  return problems;
}

const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/* ---- the tests ---- */

describe('the event schemas', () => {
  it('define the 20 events of architecture §7.7, and only those', () => {
    expect(EVENT_NAMES).toHaveLength(20);
    expect([...EVENT_NAMES].sort()).toStrictEqual(Object.keys(SPEC).sort());
  });

  it.each(Object.keys(SPEC))('%s has exactly the props, enums and bounds of §7.7', (name) => {
    const schema = eventSchemas[name as EventName];
    expect(propsOf(schema)).toStrictEqual(described(SPEC[name] ?? {}));
  });

  it('name every event and prop in snake_case', () => {
    for (const name of EVENT_NAMES) {
      expect(name).toMatch(SNAKE);
      for (const prop of Object.keys(eventSchemas[name].shape)) expect(prop).toMatch(SNAKE);
    }
  });

  it('name the tools of architecture §7.4 and every error code as an outcome', () => {
    expect([...AGENT_TOOLS]).toStrictEqual(TOOLS);
    expect(eventSchemas.agent_tool_called.shape.outcome.options).toStrictEqual([
      'ok',
      ...ERROR_CODES,
    ]);
  });

  it('carry the segments of PRD §3.5', () => {
    expect([...SEGMENTS]).toStrictEqual(['starting_out', 'accumulating', 'established', 'unknown']);
  });

  it.each(EVENT_NAMES)('%s accepts a valid example', (name) => {
    const schema = eventSchemas[name];
    expect(schema.safeParse(validProps(schema)).success).toBe(true);
  });

  it('allow via only on a holding created on the web', () => {
    const schema = eventSchemas.holding_created;
    expect(schema.safeParse({ source: 'web', via: 'guided' }).success).toBe(true);
    expect(schema.safeParse({ source: 'web' }).success).toBe(true);
    expect(schema.safeParse({ source: 'agent' }).success).toBe(true);
    expect(schema.safeParse({ source: 'agent', via: 'form' }).success).toBe(false);
  });

  it('give each event its props type', () => {
    expectTypeOf(eventSchemas).toExtend<Record<EventName, z.ZodObject>>();
    expectTypeOf<EventProps<'signup_started'>>().toEqualTypeOf<{
      method: 'email' | 'google' | 'apple';
    }>();
    expectTypeOf<ClientEvent>().toExtend<{ name: string; props: object }>();
  });
});

describe('privacy (N9): the schemas', () => {
  it('have only enum, boolean and bounded integer props, and no prop suggests an amount or a name', () => {
    const problems = EVENT_NAMES.flatMap((name) => privacyProblems(name, eventSchemas[name]));
    expect(problems).toStrictEqual([]);
  });

  it('would catch free text, an unbounded number or an amount-like name (the check itself)', () => {
    const leaky = z.strictObject({
      note: z.string(),
      count: z.number(),
      total_minor: z.int().min(0).max(10),
      items: z.array(z.string()),
    });
    expect(privacyProblems('leaky', leaky)).toStrictEqual([
      'leaky.note: FORBIDDEN ZodString',
      'leaky.note: suggests note',
      'leaky.count: FORBIDDEN unbounded or fractional number',
      'leaky.total_minor: suggests total',
      'leaky.total_minor: suggests minor',
      'leaky.items: FORBIDDEN ZodArray',
    ]);
  });

  it.each(EVENT_NAMES)('%s rejects a prop it does not define', (name) => {
    const schema = eventSchemas[name];
    const result = schema.safeParse({ ...validProps(schema), amount: 1200 });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['amount'] }),
    );
  });

  it('reject free text in an enum prop, and fractional or out-of-range integers', () => {
    expect(eventSchemas.signup_started.safeParse({ method: 'My savings 12,000' }).success).toBe(
      false,
    );
    const corrected = eventSchemas.value_corrected;
    expect(corrected.safeParse({ original_source: 'agent', age_at_correction: 2 }).success).toBe(
      true,
    );
    for (const age of [1.5, -1, 36_501, '2']) {
      expect(
        corrected.safeParse({ original_source: 'agent', age_at_correction: age }).success,
      ).toBe(false);
    }
  });
});

describe('client events', () => {
  it('are the names §7.7 marks client', () => {
    expect([...CLIENT_EVENT_NAMES]).toStrictEqual([
      'landing_view',
      'signup_started',
      'session_started',
      'agent_connection_started',
      'insights_viewed',
      'push_prompt_shown',
      'push_prompt_result',
    ]);
    for (const name of CLIENT_EVENT_NAMES) expect(isEventName(name)).toBe(true);
  });

  it('only landing_view and signup_started go without a session', () => {
    expect([...SESSIONLESS_EVENT_NAMES]).toStrictEqual(['landing_view', 'signup_started']);
    expect(isSessionlessEventName('landing_view')).toBe(true);
    expect(isSessionlessEventName('signup_started')).toBe(true);
    expect(isSessionlessEventName('session_started')).toBe(false);
  });

  it('landing_view takes no props', () => {
    expect(eventSchemas.landing_view.safeParse({}).success).toBe(true);
    expect(eventSchemas.landing_view.safeParse({ visitor: '0123456789abcdef' }).success).toBe(
      false,
    );
    expect(eventSchemas.landing_view.safeParse({ referrer: 'https://example.com' }).success).toBe(
      false,
    );
  });

  it('tell names apart', () => {
    expect(isEventName('value_recorded')).toBe(true);
    expect(isEventName('toString')).toBe(false);
    expect(isEventName(42)).toBe(false);
    expect(isClientEventName('insights_viewed')).toBe(true);
    expect(isClientEventName('value_recorded')).toBe(false);
    expect(isClientEventName('landing_view')).toBe(true);
  });
});
