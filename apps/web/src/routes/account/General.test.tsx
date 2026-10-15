import type { Countries, ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { ME_KEY } from '../../api/account';
import { countriesQuery } from '../../api/content';
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

const COUNTRIES: Countries = {
  DE: { currency: 'EUR' },
  SG: { currency: 'SGD', pack: 'sg' },
  US: { currency: 'USD' },
};

/** Renders General with the person and the country list already known. */
function render(me: ProfileView = PERSON): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, me);
  client.setQueryData(countriesQuery.queryKey, COUNTRIES);
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: ['/app/account/general'],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

describe('General', () => {
  it('lists every country alphabetically, none pinned, with the person’s chosen', () => {
    const markup = render();
    expect(markup).toContain('Where you live');
    const germany = markup.indexOf('>Germany</option>');
    const singapore = markup.indexOf('>Singapore</option>');
    const unitedStates = markup.indexOf('>United States</option>');
    expect(germany).toBeGreaterThan(-1);
    expect(singapore).toBeGreaterThan(germany);
    expect(unitedStates).toBeGreaterThan(singapore);
    expect(markup).toContain('value="SG" selected');
    expect(markup).toContain('Sets local names and suggestions. You can still track anything.');
  });

  it('lists every currency from content, with the default chosen', () => {
    const markup = render();
    expect(markup).toContain('Default currency');
    const eur = markup.indexOf('>EUR</option>');
    const sgd = markup.indexOf('>SGD</option>');
    const usd = markup.indexOf('>USD</option>');
    expect(eur).toBeGreaterThan(-1);
    expect(sgd).toBeGreaterThan(eur);
    expect(usd).toBeGreaterThan(sgd);
    expect(markup).toContain('value="SGD" selected');
    expect(markup).toContain('Everything is totalled in this currency.');
  });

  it('leads back to Account', () => {
    const markup = render();
    expect(markup).toContain('<h1');
    expect(markup).toContain('>General</h1>');
    expect(markup).toContain('href="/app/account"');
    expect(markup).toContain('Back to Account');
  });

  it('offers no currency before the ledger exists', () => {
    const markup = render({ ...PERSON, baseCurrency: null });
    expect(markup).toContain('Where you live');
    expect(markup).not.toContain('Default currency');
  });
});
