import { ERASED_WITHIN_DAYS, type ProfileView } from '@netnet/contracts';
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

/** Renders the Delete account screen with the person already known. */
function render(): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, PERSON);
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: ['/app/account/delete'],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

describe('Delete account', () => {
  it('states the erasure window before anything can be confirmed', () => {
    expect(ERASED_WITHIN_DAYS).toBe(30);
    const markup = render();
    expect(markup).toContain('>Delete account</h1>');
    expect(markup).toContain('This erases everything');
    const window = markup.indexOf('30 days');
    expect(window).toBeGreaterThan(-1);
    // The window first, then the way out, then the deletion.
    expect(window).toBeLessThan(markup.indexOf('Export first'));
    expect(markup.indexOf('Export first')).toBeLessThan(markup.indexOf('Delete my account'));
    expect(markup).toContain('immediately stop being readable by any connected agent');
    expect(markup).toContain('href="/app/account/export"');
    expect(markup).toContain('Back to Account');
  });
});
