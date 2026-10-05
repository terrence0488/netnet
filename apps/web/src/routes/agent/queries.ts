import type {
  AgentClient,
  AgentConnection,
  AgentGuide,
  Attempt,
  AttemptInput,
} from '@netnet/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { ContentVersions } from '../../api/content';

/**
 * The Agent tab and the connect flow's data (architecture §7.2, PRD J5): the setup guides as
 * administered content, the connections, and the attempt the steps screen polls. Guides are never
 * hard-coded: every `agent` document at its live version, `listed` only, in `order`.
 */

export const GUIDES_KEY = ['content', 'agent-guides'] as const;
export const CONNECTIONS_KEY = ['agent', 'connections'] as const;

/** Every setup guide NetNet offers, `listed` only, in `order` (PRD J5). */
export const agentGuidesQuery = queryOptions({
  queryKey: GUIDES_KEY,
  queryFn: async ({ signal }): Promise<AgentGuide[]> => {
    const options = signal ? { signal } : {};
    const versions = await api.get<ContentVersions>('/content/current', options);
    const agent = versions['agent'] ?? {};
    const guides = await Promise.all(
      Object.entries(agent).map(([key, version]) =>
        api.get<AgentGuide>(`/content/agent/${key}@${version}`, options),
      ),
    );
    return guides.filter((guide) => guide.listed).sort((a, b) => a.order - b.order);
  },
  staleTime: Infinity,
});

export function useAgentGuides() {
  return useQuery(agentGuidesQuery);
}

/** The guide a connection classification names, if it is one NetNet offers. */
export function guideFor(guides: readonly AgentGuide[], client: AgentClient): AgentGuide | null {
  return guides.find((guide) => guide.id === client) ?? null;
}

export const connectionsQuery = queryOptions({
  queryKey: CONNECTIONS_KEY,
  queryFn: ({ signal }) =>
    api.get<AgentConnection[]>('/agent/connections', signal ? { signal } : {}),
});

export function useConnections() {
  return useQuery(connectionsQuery);
}

/** Revokes a connection, then lists again so the tab shows what is left. */
export function useRevokeConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.del<{ result: null; dataVersion: number | null; warnings: [] }>(
        `/agent/connections/${id}`,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });
}

/** Starts the attempt the steps screen polls (architecture §5.1). */
export function useStartAttempt() {
  return useMutation({
    mutationFn: (input: AttemptInput) => api.post<Attempt>('/agent/attempts', input),
  });
}

export function attemptQuery(id: string) {
  return queryOptions({
    queryKey: ['agent', 'attempt', id] as const,
    queryFn: ({ signal }) => api.get<Attempt>(`/agent/attempts/${id}`, signal ? { signal } : {}),
    // The screen moves on by itself (PRD J5): approved, live or failed, as the agent acts.
    refetchInterval: 2000,
  });
}
