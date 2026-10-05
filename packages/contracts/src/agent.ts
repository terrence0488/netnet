import { z } from 'zod';

/**
 * Connecting an agent over REST (architecture §7.2, §7.6; PRD J5): the attempt the web app polls
 * while the person follows the steps, the approval page's read and decision, and the Agent tab's
 * connections. `client` is a classification or the guide chosen, never a name an agent registered.
 */

export const AGENT_CLIENTS = ['claude', 'chatgpt', 'other'] as const;
export type AgentClient = (typeof AGENT_CLIENTS)[number];
export const agentClientSchema = z.enum(AGENT_CLIENTS);

/** Where the person started connecting. `agent`: the Agent tab, or the agent itself. */
export const ATTEMPT_ENTRIES = ['onboarding', 'home', 'holding', 'agent'] as const;
/** The platform the steps were shown for (the "Other agent" guide has one, `any`). */
export const ATTEMPT_PLATFORMS = ['phone', 'computer', 'any'] as const;
export const ATTEMPT_STATES = ['started', 'approved', 'live', 'failed'] as const;
export const ATTEMPT_FAILED_STEPS = ['authorise', 'callback', 'discovery', 'first_call'] as const;
/**
 * Why an attempt failed, for a plain-language cause on screen: `cancelled` (Cancel on the
 * approval page), `invalid_request` (NetNet refused the agent's request), `token_rejected` (the
 * agent's code exchange was refused), `timed_out` (a step took more than 15 minutes).
 */
export const ATTEMPT_CAUSES = [
  'cancelled',
  'invalid_request',
  'token_rejected',
  'timed_out',
] as const;
export const REGISTRATIONS = ['cimd', 'dcr'] as const;

/** `POST /api/agent/attempts`. */
export const attemptInputSchema = z.strictObject({
  client: agentClientSchema,
  entry: z.enum(ATTEMPT_ENTRIES),
  platform: z.enum(ATTEMPT_PLATFORMS),
});
export type AttemptInput = z.infer<typeof attemptInputSchema>;

/** What `POST` and `GET /api/agent/attempts[/:id]` answer. */
export const attemptSchema = z.strictObject({
  id: z.string(),
  state: z.enum(ATTEMPT_STATES),
  failedStep: z.enum(ATTEMPT_FAILED_STEPS).exactOptional(),
  cause: z.enum(ATTEMPT_CAUSES).exactOptional(),
});
export type Attempt = z.infer<typeof attemptSchema>;

/** One of `GET /api/agent/connections`: active connections, newest first. */
export const agentConnectionSchema = z.strictObject({
  id: z.string(),
  /** The name the agent registered with: third-party text, shown escaped. */
  clientName: z.string(),
  client: agentClientSchema,
  registration: z.enum(REGISTRATIONS),
  /** False for a DCR client: NetNet cannot verify the name it gave. */
  nameVerified: z.boolean(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type AgentConnection = z.infer<typeof agentConnectionSchema>;

/** `GET /api/agent/approval?‹the approval page's query›`: who is asking, and for what. */
export const approvalSchema = z.strictObject({
  clientName: z.string(),
  registration: z.enum(REGISTRATIONS),
  nameVerified: z.boolean(),
  client: agentClientSchema,
  /** The CIMD URL's host, or for DCR the host the agent returns to. */
  host: z.string().nullable(),
  scopes: z.array(z.string()),
});
export type ApprovalRequest = z.infer<typeof approvalSchema>;

/** The approval page's query is a signed OAuth request: a few hundred bytes. */
export const MAX_APPROVAL_QUERY_LENGTH = 8192;

/** `POST /api/agent/approval`: Allow (`accept: true`) or Cancel, with the page's query. */
export const approvalDecisionSchema = z.strictObject({
  accept: z.boolean(),
  query: z.string().min(1).max(MAX_APPROVAL_QUERY_LENGTH),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

/** What `POST /api/agent/approval` answers: the agent's page, where the browser goes next. */
export const approvalResultSchema = z.strictObject({ url: z.string() });
export type ApprovalResult = z.infer<typeof approvalResultSchema>;
