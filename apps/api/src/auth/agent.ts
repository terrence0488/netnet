import { contentStore } from '../content/store';
import { database } from '../db/client';
import { appVersion } from '../events/app-version';
import { track } from '../events/track';
import { withUser } from '../ledger/with-user';
import { inBackground } from '../lib/after-response';
import { publicOrigin } from '../lib/env';
import { log } from '../lib/log';
import { notify } from '../notify/notify';
import { createApproval, type Approval, type ApprovalDeps } from './approval';
import { createAttempts, type Attempts } from './attempts';
import { auth } from './auth';
import { guideHostsFrom } from './classify';
import { createConnections, type Connections } from './connections';

/**
 * Agent connections as one service (PRD J5): attempts, connections and the approval page's API,
 * over one set of dependencies. Tests build their own with `createAgent`.
 */
export interface Agent {
  attempts: Attempts;
  connections: Connections;
  approval: Approval;
}

export type AgentServiceDeps = Omit<ApprovalDeps, 'attempts' | 'connections'> &
  Pick<Parameters<typeof createConnections>[0], 'withUser' | 'notify'>;

export function createAgent(deps: AgentServiceDeps): Agent {
  const attempts = createAttempts(deps);
  const connections = createConnections(deps);
  const approval = createApproval({ ...deps, attempts, connections });
  return { attempts, connections, approval };
}

let shared: Agent | undefined;

/** The running app's service. Built on first use, so nothing connects until a request needs it. */
export function agent(): Agent {
  shared ??= createAgent({
    db: database,
    clock: () => new Date(),
    track,
    appVersion,
    background: (task) =>
      inBackground(task, () => log('agent_task_failed', { errorCode: 'INTERNAL' })),
    auth,
    origin: publicOrigin,
    guides: guideHostsFrom(contentStore),
    withUser,
    notify,
  });
  return shared;
}

/**
 * For the MCP server (P1-T15), after a successful tool call: the connection's attempt goes `live`
 * (the first call only; false otherwise).
 */
export function markAttemptLive(userId: string, connectionId: string): Promise<boolean> {
  return agent().attempts.markLive(userId, connectionId);
}

/** For the MCP server (P1-T15), after each tool call: `last_used_at` and `first_call_at`. */
export function touchConnection(connectionId: string): Promise<void> {
  return agent().connections.touch(connectionId);
}
