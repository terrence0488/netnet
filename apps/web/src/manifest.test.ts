/// <reference types="node" />
import { color } from '@netnet/tokens';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The manifest and index.html cannot read CSS custom properties, so they carry the paper colour
 * as a literal. These checks keep the literals equal to the tokens.
 */
const web = resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(resolve(web, file), 'utf8');

describe('the installable web app (architecture §5.2)', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown>;

  it('is scoped to /app and opens standalone', () => {
    expect(manifest).toMatchObject({
      id: '/app/',
      start_url: '/app/',
      scope: '/app/',
      display: 'standalone',
    });
  });

  it('takes the paper of the light theme, the reference theme', () => {
    expect(manifest.background_color).toBe(color.light.paper);
    expect(manifest.theme_color).toBe(color.light.paper);
  });

  it('gives the browser each theme’s paper as its theme colour', () => {
    const html = read('index.html');
    for (const theme of ['light', 'dark'] as const) {
      expect(html).toContain(
        `<meta name="theme-color" content="${color[theme].paper}" media="(prefers-color-scheme: ${theme})" />`,
      );
    }
  });
});
