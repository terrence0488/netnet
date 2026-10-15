import type { AgentGuide } from '@netnet/contracts';
import type { Client } from '../auth/classify';
import type { Profile } from '../db/profiles';
import {
  agentClientName,
  createWithLedger,
  type LedgerOptions,
  type WithLedger,
} from '../ledger/ledger';
import { todayIn } from '../ledger/scope';
import type { Actor } from '../ledger/with-user';
import { ledgerContent } from '../ledger/content';
import type { McpDeps } from './deps';

/**
 * One `/mcp` request as a tool sees it: who is calling (never from the arguments,
 * CONVENTIONS §3), the Ledger over their options, the packs and guides, and where the call's
 * after-effects go. Built in the route, after the token and the connection check out.
 */
export interface ToolCtx {
  /** The verified user id, the only one `withUser` may be given. */
  userId: string;
  connectionId: string;
  /** The connection's classification: what `agent_tool_called {client}` carries. */
  client: Client;
  /** The agent's writes and audit entries carry this name. */
  actor: Actor;
  /** The person's country, time zone and segment. */
  profile: Profile;
  /** The person's today, in their time zone, at the request's instant. */
  today: string;
  /** The request's id, for the INTERNAL an unexpected error returns. */
  requestId: string;
  /** Runs `fn` on the person's Ledger; `write: true` for a write. */
  ledger: WithLedger;
  /** The Ledger's options for this person: rates, their pack chain, their time zone. */
  options: LedgerOptions;
  deps: McpDeps;
  /** Runs work after the response: events, the connection's touch, the checked touch. */
  background: (task: Promise<unknown>) => void;
  /** The agent guide's name for a `claude` or `chatgpt` connection, from content. */
  guideName: string | undefined;
  /** The guide's name for any client: what the context calls each connection's agent. */
  guideNameFor: (client: Client) => Promise<string | undefined>;
}

export interface RequestParties {
  userId: string;
  connectionId: string;
  client: Client;
  /** The name the client registered with: untrusted third-party text. */
  clientName: string;
}

/**
 * The live agent guide's name for `client` (`claude`, `chatgpt`), or undefined for `other` and
 * when no guide is published. One read per client per request at most.
 */
export function guideNameLoader(deps: McpDeps): (client: Client) => Promise<string | undefined> {
  const names = new Map<Client, Promise<string | undefined>>();
  return (client) => {
    let loading = names.get(client);
    if (!loading) {
      loading = (async () => {
        if (client === 'other') return undefined;
        try {
          return ((await deps.content().getCurrent('agent', client)).body as AgentGuide).name;
        } catch {
          return undefined;
        }
      })();
      names.set(client, loading);
    }
    return loading;
  };
}

/** The request's context: the profile, the Ledger over its options, and the agent's name. */
export async function toolContext(
  deps: McpDeps,
  parties: RequestParties,
  requestId: string,
  background: (task: Promise<unknown>) => void,
): Promise<ToolCtx> {
  const profile = await deps.profile(parties.userId);
  const options: LedgerOptions = {
    fx: deps.fx,
    content: ledgerContent(deps.content(), profile.country),
    timeZone: profile.timeZone,
  };
  const guideNameFor = guideNameLoader(deps);
  const guideName = await guideNameFor(parties.client);
  return {
    userId: parties.userId,
    connectionId: parties.connectionId,
    client: parties.client,
    actor: {
      kind: 'agent',
      connectionId: parties.connectionId,
      clientName: agentClientName(
        { client: parties.client, clientName: parties.clientName },
        guideName,
      ),
    },
    profile,
    today: todayIn(profile.timeZone, deps.clock()),
    requestId,
    ledger: createWithLedger(deps.withUser, options),
    options,
    deps,
    background,
    guideName,
    guideNameFor,
  };
}
