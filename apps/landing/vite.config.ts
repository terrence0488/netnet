import { defineConfig, type Plugin } from 'vite';

/**
 * The origin link previews name (`og:url`, `og:image`), which must be absolute: production's
 * `PUBLIC_ORIGIN`, else a preview's own host, else none, and the paths stay relative (a local
 * build). Read at build time; the page itself never reads the environment.
 */
function previewOrigin(): string {
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return (process.env.PUBLIC_ORIGIN || (host ? `https://${host}` : '')).replace(/\/+$/, '');
}

/** Fills `%ORIGIN%` in index.html, before Vite reads the page's own `%…%` placeholders. */
function origin(): Plugin {
  return {
    name: 'landing-origin',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%ORIGIN%', previewOrigin()),
    },
  };
}

/** The static page at `/`. It builds first and owns the root of dist/; the web app adds dist/app. */
export default defineConfig({
  plugins: [origin()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    // Never inline a file as a data: URL: the CSP allows fonts and media only from 'self'.
    assetsInlineLimit: 0,
    // One module script and no dynamic imports: the modulepreload polyfill would be dead weight.
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
