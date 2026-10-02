import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { BASENAME, routes } from './app/routes';
import { Shell } from './app/Shell';

function render(path: string, table: RouteObject[] = routes): string {
  const router = createMemoryRouter(table, { basename: BASENAME, initialEntries: [path] });
  return renderToStaticMarkup(<App client={new QueryClient()} router={router} />);
}

describe('the app shell', () => {
  it('frames Home with the sidebar and the tab bar, Home marked as the current page', () => {
    const html = render('/app/');
    expect(html).toContain('<h1>Home</h1>');
    expect(html).toMatch(/<main[^>]*>/);
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('aria-label="Tabs"');
    const current = html.match(/<a[^>]*aria-current="page"[^>]*>.*?<\/a>/g) ?? [];
    expect(current).toHaveLength(2);
    expect(current.every((link) => link.endsWith('Home</a>'))).toBe(true);
  });

  it('marks the Agent entry on the Agent tab', () => {
    const html = render('/app/agent');
    expect(html).toContain('<h1>Agent</h1>');
    const current = html.match(/<a[^>]*aria-current="page"[^>]*>.*?<\/a>/g) ?? [];
    expect(current.every((link) => link.endsWith('Agent</a>'))).toBe(true);
  });

  it('drops both navs on a route without chrome', () => {
    const table: RouteObject[] = [
      {
        path: '/',
        Component: Shell,
        children: [{ path: 'bare', Component: () => <h1>Bare</h1>, handle: { chrome: false } }],
      },
    ];
    const html = render('/app/bare', table);
    expect(html).toContain('<h1>Bare</h1>');
    expect(html).toContain('data-chrome="false"');
    expect(html).not.toContain('<nav');
  });

  it('answers an unknown address in plain words, with the way back', () => {
    const html = render('/app/no/such/screen');
    expect(html).toContain('This page isn’t here.');
    expect(html).toMatch(/<a class="[^"]*primary[^"]*" href="\/app"[^>]*>Go to Home<\/a>/);
  });
});
