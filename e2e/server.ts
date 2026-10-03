/**
 * Serves the built app the way vercel.json routes it on Vercel: function routes go to the bundled
 * function (apps/api/dist/vercel.js), /app/* falls back to the web app, everything else is a file
 * in dist/. Run `pnpm build` first.
 */
import { serve } from '@hono/node-server';
import * as fn from '@netnet/api/vercel';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const PORT = Number(process.env.PORT ?? 3100);
const FUNCTION_ROUTE = /^\/(api(\/|$)|mcp$|\.well-known\/)/;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

async function file(path: string): Promise<Response | undefined> {
  const full = normalize(join(DIST, path));
  if (!full.startsWith(DIST)) return undefined;
  try {
    const body = await readFile(full);
    return new Response(body, {
      headers: { 'Content-Type': TYPES[extname(full)] ?? 'application/octet-stream' },
    });
  } catch {
    return undefined;
  }
}

async function route(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (FUNCTION_ROUTE.test(pathname)) return fn[request.method as Method](request);
  const direct = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const found = (await file(direct)) ?? (await file(`${pathname}/index.html`));
  if (found) return found;
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return (await file('app/index.html')) ?? new Response('Not built', { status: 500 });
  }
  return new Response('Not found', { status: 404 });
}

serve({ fetch: route, port: PORT }, ({ port }) => {
  console.log(`Built app on http://localhost:${port}`);
});
