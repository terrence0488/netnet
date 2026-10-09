import type { AgentConnection, AgentGuide, ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { ME_KEY } from '../../api/account';
import { BASENAME, routes } from '../../app/routes';
import { connectedDay, daysAgo, timeAgo } from './Agent';
import { CONNECTIONS_KEY, GUIDES_KEY } from './queries';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: true,
  country: 'SG',
  baseCurrency: 'SGD',
  segment: 'accumulating',
  timeZone: 'UTC',
  onboardingState: 'done',
};

const CLAUDE: AgentGuide = {
  id: 'claude',
  name: 'Claude',
  logo: 'images/agents/claude.svg',
  listed: true,
  order: 1,
  platforms: { computer: { steps: [{ text: 'Open Settings.' }] } },
};

const OTHER: AgentGuide = {
  id: 'other',
  name: 'Other agent',
  listed: true,
  order: 3,
  platforms: { any: { steps: [{ text: 'Add a connector.' }] } },
};

const CONNECTION: AgentConnection = {
  id: 'con_01KFJ0Z000000000000000000',
  clientName: 'Claude',
  client: 'claude',
  registration: 'cimd',
  nameVerified: true,
  createdAt: '2026-09-12T09:00:00.000Z',
  lastUsedAt: '2026-10-04T09:00:00.000Z',
};

/** Renders the Agent tab with the person, guides and connections already known. */
function render(connections: AgentConnection[], guides: AgentGuide[] = [CLAUDE, OTHER]): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, PERSON);
  client.setQueryData(GUIDES_KEY, guides);
  client.setQueryData(CONNECTIONS_KEY, connections);
  const router = createMemoryRouter(routes, { basename: BASENAME, initialEntries: ['/app/agent'] });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

describe('daysAgo', () => {
  it('says whole days as a person would', () => {
    expect([
      daysAgo(0),
      daysAgo(1),
      daysAgo(3),
      daysAgo(7),
      daysAgo(14),
      daysAgo(60),
    ]).toStrictEqual([
      'today',
      'yesterday',
      '3 days ago',
      'a week ago',
      '2 weeks ago',
      '2 months ago',
    ]);
    expect(daysAgo(400)).toBe('a year ago');
    expect(daysAgo(800)).toBe('2 years ago');
  });
});

describe('timeAgo', () => {
  it('says minutes, hours and days as a person would', () => {
    const now = new Date('2026-10-05T12:00:00.000Z').getTime();
    const at = (minutes: number) => new Date(now - minutes * 60000).toISOString();
    expect(timeAgo(at(0), now)).toBe('just now');
    expect(timeAgo(at(1), now)).toBe('a minute ago');
    expect(timeAgo(at(30), now)).toBe('30 minutes ago');
    expect(timeAgo(at(60), now)).toBe('an hour ago');
    expect(timeAgo(at(180), now)).toBe('3 hours ago');
    expect(timeAgo(at(2880), now)).toBe('2 days ago');
    expect(timeAgo(new Date(now + 60000).toISOString(), now)).toBe('just now');
  });
});

describe('connectedDay', () => {
  it('names the day the connection was made', () => {
    expect(connectedDay('2026-09-12T09:00:00.000Z')).toMatch(/2026/);
    expect(connectedDay('2026-09-12T09:00:00.000Z')).toMatch(/12/);
  });
});

describe('the Agent tab', () => {
  it('lists each connection’s name and times, with Revoke', () => {
    const markup = render([CONNECTION]);
    expect(markup).toContain('Your agent');
    expect(markup).toContain('Claude');
    expect(markup).toContain('Connected');
    expect(markup).toContain('last used');
    expect(markup).toContain('>Revoke<');
  });

  it('escapes the name the agent registered with', () => {
    const markup = render([{ ...CONNECTION, clientName: '<img src=x>' }]);
    expect(markup).toContain('&lt;img src=x&gt;');
    expect(markup).not.toContain('<img src=x>');
  });

  it('says when a connection was never used', () => {
    expect(render([{ ...CONNECTION, lastUsedAt: null }])).toContain('not used yet');
  });

  it('offers “Connect another” for what is not connected, always including another agent', () => {
    const markup = render([CONNECTION]);
    expect(markup).toContain('Connect another');
    expect(markup).not.toContain('Connect Claude');
    expect(markup).toContain('Connect another agent');
    expect(markup).toContain('/agent/connect/other?entry=agent');
  });

  it('when empty, offers each agent as a direct row', () => {
    const markup = render([]);
    expect(markup).toContain('Connect your agent');
    expect(markup).toContain('Connect Claude');
    expect(markup).toContain('Connect another agent');
    expect(markup).toContain('/agent/connect/claude?entry=agent');
    expect(markup).not.toContain('Connect to agent');
  });

  it('when empty with no guides, falls back to the alternative route', () => {
    const markup = render([], []);
    expect(markup).toContain('Let your AI agent do this');
    expect(markup).toContain('Connect to agent');
  });

  it('says what an agent can do beside the connections', () => {
    const markup = render([CONNECTION]);
    expect(markup).toContain('What it can do');
    expect(markup).toContain('you can undo anything it changes');
  });
});
