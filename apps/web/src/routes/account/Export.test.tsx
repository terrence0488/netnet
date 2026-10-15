import type { ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { ME_KEY } from '../../api/account';
import { BASENAME, routes } from '../../app/routes';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: true,
  country: 'SG',
  baseCurrency: 'SGD',
  segment: 'accumulating',
  timeZone: 'UTC',
  onboardingState: 'done',
};

/** Renders the Export screen with the person already known. */
function render(): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, PERSON);
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: ['/app/account/export'],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

describe('Export', () => {
  it('offers the bundle as JSON, or CSV instead', () => {
    const markup = render();
    expect(markup).toContain('>Export</h1>');
    expect(markup).toContain('Everything, in one file');
    expect(markup).toContain('including original currencies and the rates used');
    expect(markup).toContain('Download JSON');
    expect(markup).toContain('Download CSV instead');
    expect(markup).toContain('Back to Account');
  });
});
