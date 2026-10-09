import type { AgentConnection, AgentGuide } from '@netnet/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { agentConnectionsQuery } from '../../components/AskAgent';
import { agentGuidesQuery } from '../agent/queries';
import { REFRESH_PROMPT } from './prompts';
import { StaleNote } from './StaleNote';

const CONNECTION: AgentConnection = {
  id: 'con_01KFJ0Z000000000000000000',
  clientName: 'Claude',
  client: 'claude',
  registration: 'cimd',
  nameVerified: true,
  createdAt: '2026-09-12T09:00:00.000Z',
  lastUsedAt: '2026-10-04T09:00:00.000Z',
};

const GUIDE: AgentGuide = {
  id: 'claude',
  name: 'Claude',
  listed: true,
  order: 1,
  prefillUrl: 'https://claude.ai/new?q={prompt}',
  platforms: { computer: { steps: [{ text: 'Open Settings.' }] } },
};

/** Renders the note with the connections and guides already known. */
function render(
  count: number,
  connections: AgentConnection[] | undefined,
  guides: AgentGuide[] | undefined,
): string {
  const client = new QueryClient();
  if (connections !== undefined) client.setQueryData(agentConnectionsQuery.queryKey, connections);
  if (guides !== undefined) client.setQueryData(agentGuidesQuery.queryKey, guides);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StaleNote count={count} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StaleNote', () => {
  it('says how many are out of date, singular and plural', () => {
    expect(render(1, [], [])).toContain('1 holding is out of date.');
    expect(render(2, [], [])).toContain('2 holdings are out of date.');
  });

  it('without an agent, offers to connect one', () => {
    const markup = render(2, [], []);
    expect(markup).toContain('Connect your agent to keep it current');
    expect(markup).toContain('href="/agent/connect?entry=home"');
  });

  it('with an agent, hands it the update with one tap, singular and plural', () => {
    const markup = render(2, [CONNECTION], [GUIDE]);
    expect(markup).toContain('Ask Claude to update them');
    expect(markup).toContain(`q=${encodeURIComponent(REFRESH_PROMPT)}`);
    expect(render(1, [CONNECTION], [GUIDE])).toContain('Ask Claude to update it');
  });

  it('without a prefill address, copies the prompt instead', () => {
    const { prefillUrl: _dropped, ...noPrefill } = GUIDE;
    expect(_dropped).toBeTruthy();
    const markup = render(2, [CONNECTION], [noPrefill]);
    expect(markup).toContain('Copy a prompt for Claude');
  });
});
