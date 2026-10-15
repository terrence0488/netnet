import type { AgentConnection, Countries, ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { ME_KEY } from '../../api/account';
import { countriesQuery } from '../../api/content';
import { BASENAME, routes } from '../../app/routes';
import { agentConnectionsQuery } from '../../components/AskAgent';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: true,
  country: 'SG',
  baseCurrency: 'SGD',
  segment: 'accumulating',
  timeZone: 'UTC',
  onboardingState: 'done',
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

const COUNTRIES: Countries = {
  DE: { currency: 'EUR' },
  SG: { currency: 'SGD', pack: 'sg' },
  US: { currency: 'USD' },
};

/** Renders the Account tab with the person and connections already known. */
function render(
  me: ProfileView | null = PERSON,
  connections: AgentConnection[] = [CONNECTION],
): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, me);
  client.setQueryData(countriesQuery.queryKey, COUNTRIES);
  client.setQueryData(agentConnectionsQuery.queryKey, connections);
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: ['/app/account'],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

describe('the Account tab', () => {
  it('names who is signed in, with the way into types and tags and out', () => {
    const markup = render();
    expect(markup).toContain('avery@example.com');
    expect(markup).toContain('Settings');
    expect(markup).toContain('Types and tags');
    expect(markup).toContain('href="/app/account/taxonomy"');
    expect(markup).toContain('Log out');
    expect(markup).toContain('NetNet never sells your data or sees your documents.');
  });

  it('leads into General, showing the country and currency', () => {
    const markup = render();
    expect(markup).toContain('>General</span>');
    expect(markup).toContain('href="/app/account/general"');
    expect(markup).toContain('Singapore · SGD');
  });

  it('offers to resend while the email is unverified', () => {
    const markup = render({ ...PERSON, emailVerified: false });
    expect(markup).toContain('Not verified yet.');
    expect(markup).toContain('Resend the link');
  });

  it('names the connected clients, or none yet', () => {
    expect(render()).toContain('Connected clients');
    expect(render()).toContain('Claude');
    expect(render(PERSON, [])).toContain('none yet');
  });

  it('leads into Privacy and security: export and deletion', () => {
    const markup = render();
    expect(markup).toContain('Privacy and security');
    expect(markup).toContain('Export everything');
    expect(markup).toContain('href="/app/account/export"');
    expect(markup).toContain('Delete account');
    expect(markup).toContain('href="/app/account/delete"');
  });
});
