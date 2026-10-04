/** True only on the production deployment. Previews and local runs are stricter. */
export function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** True on any Vercel deployment (production, preview or `vercel dev`), false in a local run. */
function onVercel(): boolean {
  return (process.env.VERCEL_ENV ?? '') !== '';
}

/** The web app's local dev server (`pnpm dev`), which proxies /api to the function. */
const LOCAL_ORIGIN = 'http://localhost:5173';

function https(host: string | undefined): string | undefined {
  return host ? `https://${host}` : undefined;
}

/**
 * The one origin NetNet is served from (architecture §5.2): `PUBLIC_ORIGIN` (`https://‹domain›`),
 * else a preview's branch URL or deployment URL, else the local dev server. Links in messages and
 * Better Auth's base URL are built on it.
 */
export function publicOrigin(): string {
  return (
    process.env.PUBLIC_ORIGIN ||
    https(process.env.VERCEL_BRANCH_URL) ||
    https(process.env.VERCEL_URL) ||
    LOCAL_ORIGIN
  );
}

/**
 * Every origin NetNet's own pages can send a request from: the public origin, and a preview's
 * other URL. Locally, also the built app's server for E2E (`PORT`, default 3100) and the API on
 * its own port (`API_PORT`, default 8787).
 */
export function appOrigins(): string[] {
  const origins = [publicOrigin()];
  if (!isProduction()) {
    origins.push(
      ...[https(process.env.VERCEL_BRANCH_URL), https(process.env.VERCEL_URL)].filter(
        (origin): origin is string => origin !== undefined,
      ),
    );
  }
  if (!onVercel()) {
    origins.push(
      LOCAL_ORIGIN,
      `http://localhost:${process.env.PORT || 3100}`,
      `http://localhost:${process.env.API_PORT || 8787}`,
    );
  }
  return [...new Set(origins)];
}
