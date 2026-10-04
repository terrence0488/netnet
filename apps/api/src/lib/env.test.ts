import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appOrigins, isProduction, publicOrigin } from './env';

const NAMES = [
  'VERCEL_ENV',
  'PUBLIC_ORIGIN',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'PORT',
  'API_PORT',
];

beforeEach(() => {
  for (const name of NAMES) vi.stubEnv(name, '');
});

afterEach(() => vi.unstubAllEnvs());

describe('publicOrigin()', () => {
  it('is PUBLIC_ORIGIN, else a preview’s branch or deployment URL, else the local dev server', () => {
    expect(publicOrigin()).toBe('http://localhost:5173');
    vi.stubEnv('VERCEL_URL', 'netnet-abc123.vercel.app');
    expect(publicOrigin()).toBe('https://netnet-abc123.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'netnet-git-p1-t11.vercel.app');
    expect(publicOrigin()).toBe('https://netnet-git-p1-t11.vercel.app');
    vi.stubEnv('PUBLIC_ORIGIN', 'https://netnet.example');
    expect(publicOrigin()).toBe('https://netnet.example');
  });
});

describe('appOrigins()', () => {
  it('in production, is the public origin alone', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PUBLIC_ORIGIN', 'https://netnet.example');
    vi.stubEnv('VERCEL_URL', 'netnet-abc123.vercel.app');
    expect(isProduction()).toBe(true);
    expect(appOrigins()).toEqual(['https://netnet.example']);
  });

  it('in a preview, is both of its URLs', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'netnet-abc123.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'netnet-git-p1-t11.vercel.app');
    expect(appOrigins()).toEqual([
      'https://netnet-git-p1-t11.vercel.app',
      'https://netnet-abc123.vercel.app',
    ]);
  });

  it('locally, is the dev server, the E2E server and the API’s own port', () => {
    expect(appOrigins()).toEqual([
      'http://localhost:5173',
      'http://localhost:3100',
      'http://localhost:8787',
    ]);
    vi.stubEnv('PORT', '4000');
    expect(appOrigins()).toContain('http://localhost:4000');
  });
});
