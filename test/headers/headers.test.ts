import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import vercel from '../../vercel.json' with { type: 'json' };

const ROOT = resolve(import.meta.dirname, '..', '..');

interface HeaderEntry {
  source: string;
  headers: { key: string; value: string }[];
}

const entries = vercel.headers as HeaderEntry[];

function headersFor(source: string): Record<string, string> {
  const entry = entries.find((candidate) => candidate.source === source);
  if (!entry) throw new Error(`${ROOT}/vercel.json has no headers for ${source}.`);
  return Object.fromEntries(entry.headers.map(({ key, value }) => [key, value]));
}

/**
 * The security headers every deployment serves (architecture §8; `scripts/smoke.ts` asserts the
 * same values live). Keep the two in sync.
 */
describe('vercel.json security headers', () => {
  const global = headersFor('/(.*)');

  it('sends HSTS with a two-year max-age and subdomains', () => {
    expect(global['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
  });

  it('sends nosniff, a strict referrer policy and DENY framing', () => {
    expect(global['X-Content-Type-Options']).toBe('nosniff');
    expect(global['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(global['X-Frame-Options']).toBe('DENY');
  });

  it('sends a strict CSP: self, self-hosted fonts, Sentry ingest, no framing', () => {
    const csp = global['Content-Security-Policy'] ?? '';
    for (const part of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'",
      'https://*.ingest.sentry.io',
      'https://*.ingest.us.sentry.io',
      'https://*.ingest.de.sentry.io',
    ]) {
      expect(csp).toContain(part);
    }
    expect(csp).not.toContain("'unsafe-");
    expect(csp).not.toContain('http:');
  });

  it('never caches API, MCP or metadata responses at the edge', () => {
    const api = headersFor('/(api|api/.*|mcp|\\.well-known/.*)');
    expect(api['Cache-Control']).toBe('private, no-store');
  });

  it('never caches the pages, but caches hashed assets forever', () => {
    const pages = headersFor('/(|index\\.html|app|app/(?!assets/).*)');
    expect(pages['Cache-Control']).toBe('no-cache');
    const assets = headersFor('/(assets|app/assets)/(.*)');
    expect(assets['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });
});
