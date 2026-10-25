import { z } from 'zod';
import { ERROR_CODES } from './errors';

/**
 * The analytics events (PRD §3.5, architecture §7.7). Each has one strict schema, and every prop
 * is an enum, a boolean or a bounded integer, so no amount, name or document text can reach
 * `analytics.event` (N9). Adding a prop means changing its schema here. `segment`, `user_id` and
 * `app_version` are not props: `track()` attaches them itself.
 */

/** The persona every event carries (PRD §3.5): `unknown` until onboarding sets it. */
export const SEGMENTS = ['starting_out', 'accumulating', 'established', 'unknown'] as const;
export type Segment = (typeof SEGMENTS)[number];
export const segmentSchema = z.enum(SEGMENTS);

/** The MCP tools (architecture §7.4). `agent_tool_called {tool}` names one. */
export const AGENT_TOOLS = [
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
] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

/* ---------------------------------------------------------------- props */

/** How someone signed up: Google, Apple or email. */
const method = z.enum(['email', 'google', 'apple']);
/** Who wrote: the person on the web, or an agent. */
const source = z.enum(['web', 'agent']);
/** The guide chosen (client side) or the connection's classification (server side, §3). */
const client = z.enum(['claude', 'chatgpt', 'other']);
/** Where a connection attempt began. */
const connectionEntry = z.enum(['onboarding', 'home', 'holding', 'agent']);
/** How the comeback reminder went. */
const channel = z.enum(['push', 'email']);
/** The device a push endpoint belongs to (architecture §6.2, `notification_endpoint`). */
const platform = z.enum(['ios', 'android', 'desktop']);
/** Where the push prompt was shown. */
const promptEntry = z.enum(['home', 'settings']);

/** An integer from `min` to `max`, both included. */
function bounded(min: number, max: number) {
  return z.int().min(min).max(max);
}

/** Days; a century covers any value's age. */
const MAX_AGE_DAYS = 36_500;
/** Fifteen minutes: longer than any function can run, so a real latency always fits. */
const MAX_LATENCY_MS = 900_000;

const noProps = z.strictObject({});

const connection = z.strictObject({ client, entry: connectionEntry });

export const eventSchemas = {
  landing_view: noProps,
  signup_started: z.strictObject({ method }),
  account_created: z.strictObject({ method }),
  session_started: noProps,
  holding_created: z
    .strictObject({ source, via: z.enum(['guided', 'form']).optional() })
    .refine((p) => p.via === undefined || p.source === 'web', {
      path: ['via'],
      message: 'Send via only with source "web"; an agent has no guided or form path.',
    }),
  value_recorded: z.strictObject({ source }),
  value_corrected: z.strictObject({
    /** The corrected value's own `source` (architecture §6.3), which can also be `system`. */
    original_source: z.enum(['web', 'agent', 'system']),
    age_at_correction: bounded(0, MAX_AGE_DAYS),
  }),
  agent_connection_started: connection,
  agent_connection_completed: connection,
  agent_connection_failed: z.strictObject({
    step: z.enum(['authorise', 'callback', 'discovery', 'first_call']),
    client,
    entry: connectionEntry,
  }),
  agent_tool_called: z.strictObject({
    tool: z.enum(AGENT_TOOLS),
    kind: z.enum(['read', 'write']),
    /** `ok`, or the error code the call returned (architecture §7.5). */
    outcome: z.enum(['ok', ...ERROR_CODES]),
    latency_ms: bounded(0, MAX_LATENCY_MS),
    client,
  }),
  insights_viewed: z.strictObject({ view: z.enum(['monthly', 'quarterly', 'yearly']) }),
  reminder_sent: z.strictObject({ channel }),
  reminder_opened: z.strictObject({ channel }),
  security_email_sent: z.strictObject({ client }),
  push_prompt_shown: z.strictObject({ entry: promptEntry }),
  push_prompt_result: z.strictObject({
    entry: promptEntry,
    result: z.enum(['granted', 'denied', 'not_now']),
  }),
  push_enabled: z.strictObject({ platform }),
  push_disabled: z.strictObject({ platform, by: z.enum(['user', 'browser', 'signout']) }),
  account_deleted: noProps,
} as const satisfies Record<string, z.ZodObject>;

export type EventName = keyof typeof eventSchemas;

/** The props `name` takes, as its emitter writes them. */
export type EventProps<N extends EventName> = z.input<(typeof eventSchemas)[N]>;

export const EVENT_NAMES = Object.keys(eventSchemas) as [EventName, ...EventName[]];

export const eventNameSchema = z.enum(EVENT_NAMES);

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && Object.hasOwn(eventSchemas, value);
}

/* ---------------------------------------------------------------- client events */

/**
 * The events architecture §7.7 marks *client*, which `POST /api/events` accepts. Every other name
 * is the server's.
 */
export const CLIENT_EVENT_NAMES = [
  'landing_view',
  'signup_started',
  'session_started',
  'agent_connection_started',
  'insights_viewed',
  'push_prompt_shown',
  'push_prompt_result',
] as const satisfies readonly EventName[];

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

/**
 * The client events accepted without a session: the account does not exist yet. `landing_view`
 * never carries one, even from a signed-in browser: the server fills its `visitor` hash instead
 * (architecture §6.4).
 */
export const SESSIONLESS_EVENT_NAMES = [
  'landing_view',
  'signup_started',
] as const satisfies readonly ClientEventName[];

export function isClientEventName(value: unknown): value is ClientEventName {
  return (CLIENT_EVENT_NAMES as readonly unknown[]).includes(value);
}

export function isSessionlessEventName(name: EventName): boolean {
  return (SESSIONLESS_EVENT_NAMES as readonly string[]).includes(name);
}

/** The body of `POST /api/events`: one client event. */
export type ClientEvent = {
  [N in ClientEventName]: { name: N; props: EventProps<N> };
}[ClientEventName];
