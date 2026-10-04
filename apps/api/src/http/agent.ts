import {
  approvalDecisionSchema,
  attemptInputSchema,
  MAX_APPROVAL_QUERY_LENGTH,
} from '@netnet/contracts';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { agent, type Agent } from '../auth/agent';
import { requireSession, requireVerifiedEmail } from '../auth/session';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { isId } from '../lib/ids';

/**
 * `/api/agent/*` (architecture §7.2, PRD J5): the connection attempt the web app polls, the
 * approval page's read and decision, and the Agent tab's connections. The user is the session's,
 * never one named in the request (CONVENTIONS §3); another person's ids are `NOT_FOUND`.
 * Starting an attempt and approving need a verified email; listing, revoking and Cancel do not.
 */

/** An attempt is three enums; a decision a boolean and the page's signed query. */
const MAX_BODY_BYTES = MAX_APPROVAL_QUERY_LENGTH + 1024;

const smallBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw invalid({ body: `Send at most ${MAX_BODY_BYTES} bytes.` });
  },
});

function invalid(fields: Record<string, string>): AppError {
  return new AppError('VALIDATION_FAILED', 'Nothing was changed; fields says why.', { fields });
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw invalid({ body: 'Send a JSON object.' });
  }
}

/** Zod's issues as VALIDATION_FAILED's `fields`: each bad field and what to change. */
function invalidFields(
  issues: readonly { code: string; path: PropertyKey[]; message: string; keys?: string[] }[],
): AppError {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys ?? []) fields[key] = 'Remove it.';
    } else {
      fields[issue.path.map(String).join('.') || 'body'] = issue.message;
    }
  }
  return invalid(fields);
}

function notFound(what: string): AppError {
  return new AppError('NOT_FOUND', `There is no such ${what}.`);
}

/** The request's query string as the approval page passed it on. */
function queryOf(c: Context<AppEnv>): string {
  const query = new URL(c.req.url).search.slice(1);
  if (query.length > MAX_APPROVAL_QUERY_LENGTH) {
    throw invalid({ query: `Send at most ${MAX_APPROVAL_QUERY_LENGTH} characters.` });
  }
  return query;
}

export function agentRoutes(service: () => Agent = agent): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/attempts', smallBody, async (c) => {
    const { userId } = await requireVerifiedEmail(c);
    const input = attemptInputSchema.safeParse(await readJson(c));
    if (!input.success) throw invalidFields(input.error.issues);
    return c.json(await service().attempts.start(userId, input.data), 201);
  });

  routes.get('/attempts/:id', async (c) => {
    const { userId } = await requireSession(c);
    const id = c.req.param('id');
    if (!isId(id, 'att')) throw notFound('connection attempt');
    return c.json(await service().attempts.read(userId, id));
  });

  routes.get('/connections', async (c) => {
    const { userId } = await requireSession(c);
    return c.json(await service().connections.list(userId));
  });

  routes.delete('/connections/:id', async (c) => {
    const { userId } = await requireSession(c);
    const id = c.req.param('id');
    if (!isId(id, 'con')) throw notFound('active connection');
    const { dataVersion } = await service().connections.revoke(userId, id);
    return c.json({ result: null, dataVersion, warnings: [] });
  });

  routes.get('/approval', async (c) => {
    const { userId } = await requireVerifiedEmail(c);
    return c.json(
      await service().approval.read({ userId, headers: c.req.raw.headers }, queryOf(c)),
    );
  });

  routes.post('/approval', smallBody, async (c) => {
    const { userId } = await requireSession(c);
    const decision = approvalDecisionSchema.safeParse(await readJson(c));
    if (!decision.success) throw invalidFields(decision.error.issues);
    // Allow needs a verified email (PRD J5); Cancel only tells the agent no.
    if (decision.data.accept) await requireVerifiedEmail(c);
    return c.json(
      await service().approval.decide({ userId, headers: c.req.raw.headers }, decision.data),
    );
  });

  return routes;
}
