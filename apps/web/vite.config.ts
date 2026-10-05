import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const API = `http://localhost:${process.env.API_PORT ?? 8787}`;

const CONTENT = join(import.meta.dirname, '..', '..', 'content');
const IMAGE_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Serves `content/images/` at `/content/*` in development, as the built app serves
 * `dist/content/images/` (architecture §7.1; `pnpm content:images` copies it there).
 */
function contentImages(): Plugin {
  return {
    name: 'content-images',
    configureServer(server) {
      server.middlewares.use('/content/', (request, response, next) => {
        void (async () => {
          try {
            const path = normalize(join(CONTENT, (request.url ?? '').split('?')[0] ?? ''));
            if (!path.startsWith(CONTENT)) {
              response.statusCode = 404;
              response.end();
              return;
            }
            const body = await readFile(path);
            const extension = path.slice(path.lastIndexOf('.'));
            response.setHeader(
              'Content-Type',
              IMAGE_TYPES[extension] ?? 'application/octet-stream',
            );
            response.end(body);
          } catch {
            next();
          }
        })();
      });
    },
  };
}

/** The web app lives at /app on the one origin (architecture §5.2). */
export default defineConfig({
  base: '/app/',
  plugins: [react(), contentImages()],
  // VERCEL_ENV tells a production build to leave the component gallery out (src/app/routes.tsx).
  envPrefix: ['VITE_', 'VERCEL_ENV'],
  build: {
    outDir: '../../dist/app',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': API,
      '/mcp': API,
      '/.well-known': API,
    },
  },
});
