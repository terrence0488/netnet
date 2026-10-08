import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorSearch, ProviderButtons } from './ProviderButtons';

const PROPS = {
  mode: 'signup' as const,
  screen: '/signup' as const,
  search: '',
  onProblem: () => {},
};

function render(): string {
  return renderToStaticMarkup(<ProviderButtons {...PROPS} />);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ProviderButtons', () => {
  it('renders nothing when no provider is enabled', () => {
    vi.stubEnv('VITE_AUTH_GOOGLE', '');
    vi.stubEnv('VITE_AUTH_APPLE', '');
    expect(render()).toBe('');
  });

  it('renders each enabled provider’s official button above an "or" divider', () => {
    vi.stubEnv('VITE_AUTH_GOOGLE', '1');
    vi.stubEnv('VITE_AUTH_APPLE', '1');
    const html = render();
    expect(html).toContain('Continue with Google');
    expect(html).toContain('Continue with Apple');
    // Google's button first, as the prototype stacks them.
    expect(html.indexOf('Continue with Google')).toBeLessThan(html.indexOf('Continue with Apple'));
    expect(html).toContain('>or</span>');
    // The marks are decoration: screen readers hear only the labels.
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain('<title>');
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('renders only the enabled provider, divider and all', () => {
    vi.stubEnv('VITE_AUTH_GOOGLE', '1');
    vi.stubEnv('VITE_AUTH_APPLE', '');
    const html = render();
    expect(html).toContain('Continue with Google');
    expect(html).not.toContain('Continue with Apple');
    expect(html).toContain('>or</span>');
  });
});

describe('errorSearch()', () => {
  it('names the provider, keeps where login was headed, and drops an older error', () => {
    expect(errorSearch('', 'google')).toBe('?provider=google');
    expect(errorSearch('?next=%2Fagent', 'apple')).toBe('?next=%2Fagent&provider=apple');
    expect(errorSearch('?provider=google&error=access_denied', 'apple')).toBe('?provider=apple');
  });
});
