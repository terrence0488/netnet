import { CONTENT_KINDS, type ContentKind } from '@netnet/contracts';
import { Hono } from 'hono';
import type { ContentStore } from '../content/store';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';

/**
 * Content over REST (architecture §7.2): what is live, and immutable documents by version. Neither
 * holds user data or needs a session. A document never changes once published, so it may be cached
 * anywhere for a year.
 */
export const IMMUTABLE = 'public, max-age=31536000, immutable';

const KEY = /^[a-z][a-z0-9_]*$/;
const VERSION = /^[1-9][0-9]{0,8}$/;

function isKind(kind: string): kind is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(kind);
}

export function contentRoutes(store: () => ContentStore): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/current', async (c) => c.json(await store().currentVersions()));

  routes.get('/:kind/:ref', async (c) => {
    const kind = c.req.param('kind');
    const [key = '', version = '', ...rest] = c.req.param('ref').split('@');
    const fields: Record<string, string> = {};
    if (!isKind(kind)) fields.kind = `Use one of ${CONTENT_KINDS.join(', ')}.`;
    if (!KEY.test(key) || rest.length > 0) {
      fields.key = 'Use the document key: lowercase letters, digits and _, such as "generic".';
    }
    if (!VERSION.test(version)) fields.version = 'Give a version after @, such as generic@3.';
    if (!isKind(kind) || Object.keys(fields).length > 0) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Ask for a document as /api/content/<kind>/<key>@<version>.',
        {
          fields,
        },
      );
    }
    const doc = await store().getVersion(kind, key, Number(version));
    return c.json(doc.body as object, 200, { 'Cache-Control': IMMUTABLE });
  });

  return routes;
}
