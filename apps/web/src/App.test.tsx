import type { Countries, ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { ME_KEY, geoQuery } from './api/account';
import { countriesQuery } from './api/content';
import { BASENAME, routes } from './app/routes';
import { Shell } from './app/Shell';

/** A fictional person, signed in and onboarded. */
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
  MY: { currency: 'MYR', pack: 'my' },
  SG: { currency: 'SGD', pack: 'sg' },
  DE: { currency: 'EUR' },
};

/** Renders a path with who is signed in already known, as the app knows it after one request. */
function render(path: string, me: ProfileView | null = PERSON, table: RouteObject[] = routes) {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, me);
  client.setQueryData(geoQuery.queryKey, { country: 'SG' });
  client.setQueryData(countriesQuery.queryKey, COUNTRIES);
  const router = createMemoryRouter(table, { basename: BASENAME, initialEntries: [path] });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

const current = (html: string) => html.match(/<a[^>]*aria-current="page"[^>]*>.*?<\/a>/g) ?? [];

describe('the app shell', () => {
  it('frames Home with the sidebar and the tab bar, Home marked as the current page', () => {
    const html = render('/app/');
    expect(html).toContain('<h1>Home</h1>');
    expect(html).toMatch(/<main[^>]*>/);
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('aria-label="Tabs"');
    expect(current(html)).toHaveLength(2);
    expect(current(html).every((link) => link.endsWith('Home</a>'))).toBe(true);
  });

  it('marks the Agent entry on the Agent tab', () => {
    const html = render('/app/agent');
    expect(html).toContain('<h1>Your agent</h1>');
    expect(current(html).every((link) => link.endsWith('Agent</a>'))).toBe(true);
  });

  it('drops both navs on a route without chrome', () => {
    const table: RouteObject[] = [
      {
        path: '/',
        Component: Shell,
        children: [{ path: 'bare', Component: () => <h1>Bare</h1>, handle: { chrome: false } }],
      },
    ];
    const html = render('/app/bare', PERSON, table);
    expect(html).toContain('<h1>Bare</h1>');
    expect(html).toContain('data-chrome="false"');
    expect(html).not.toContain('<nav');
  });

  it('answers an unknown address in plain words, with the way back', () => {
    const html = render('/app/no/such/screen');
    expect(html).toContain('This page isn’t here.');
    expect(html).toMatch(/<a class="[^"]*primary[^"]*" href="\/app"[^>]*>Go to Home<\/a>/);
  });

  it('waits to learn who is signed in before showing a screen with chrome', () => {
    const client = new QueryClient();
    const router = createMemoryRouter(routes, { basename: BASENAME, initialEntries: ['/app/'] });
    const html = renderToStaticMarkup(<App client={client} router={router} />);
    expect(html).not.toContain('<h1>Home</h1>');
    expect(html).toContain('Loading');
  });
});

describe('the account screens', () => {
  it('sign-up asks for an email and nothing else, without chrome', () => {
    const html = render('/app/signup', null);
    expect(html).toContain('Create your account');
    expect(html).toContain('type="email"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toMatch(/Where do you live|closest to you|Totals in/);
    expect(html).not.toContain('<nav');
    expect(html).toContain('href="/app/login"');
  });

  it('log-in offers Forgot password and the way to create an account', () => {
    const html = render('/app/login?next=%2Fagent', null);
    expect(html).toContain('<h1');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('href="/app/forgot?next=%2Fagent"');
    expect(html).toContain('href="/app/signup?next=%2Fagent"');
  });

  it('a reset page without a working token says so, with the way to a new link', () => {
    const html = render('/app/reset?error=INVALID_TOKEN', null);
    expect(html).toContain('This link doesn’t work any more');
    expect(html).toContain('href="/app/forgot"');
    expect(render('/app/reset?token=abcdefghijklmnop', null)).toContain('Choose a new password');
  });

  it('the verify link’s page says the address is verified, or offers a new link', () => {
    expect(render('/app/verify')).toContain('Your email is verified');
    const unverified = { ...PERSON, emailVerified: false };
    const failed = render('/app/verify?error=INVALID_TOKEN', unverified);
    expect(failed).toContain('That link didn’t work');
    expect(failed).toContain('Send a new link');
    expect(render('/app/verify?error=INVALID_TOKEN', null)).toContain(
      'href="/app/login?next=%2Faccount"',
    );
  });

  it('Account shows who is signed in, the unverified line, and Log out', () => {
    const html = render('/app/account', { ...PERSON, emailVerified: false });
    expect(html).toContain('avery@example.com');
    expect(html).toContain('Not verified yet.');
    expect(html).toContain('Resend the link');
    expect(html).toContain('Log out');
  });
});

describe('onboarding', () => {
  const NEW: ProfileView = {
    ...PERSON,
    emailVerified: false,
    country: null,
    baseCurrency: null,
    segment: 'unknown',
    onboardingState: 'country',
  };

  it('asks where the person lives, the looked-up country offered for one tap', () => {
    const html = render('/app/onboarding/country', NEW);
    expect(html).toContain('1 of 2');
    expect(html).toContain('Where do you live?');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Singapore<\/button>/);
    expect(html).toContain('Somewhere else');
    expect(html).toContain('Totals in <b>SGD</b>');
    expect(html).toContain('We’ve sent a link to');
    expect(html).not.toContain('<nav');
  });

  it('asks the segment second, with Back and Skip', () => {
    const html = render('/app/onboarding/segment', { ...NEW, onboardingState: 'segment' });
    expect(html).toContain('2 of 2');
    expect(html).toContain('Which is closest to you?');
    expect(html).toContain('href="/app/onboarding/country"');
    expect(html).toMatch(/>Skip<\/button>/);
  });
});
