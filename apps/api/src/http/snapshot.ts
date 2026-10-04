import type { Snapshot } from '@netnet/contracts';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { Hono } from 'hono';
import { requireSession } from '../auth/session';
import { openLedger } from '../ledger/ledger';
import { dataVersionOf } from '../ledger/state';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';
import { log } from '../lib/log';
import { WEB, appLedgerDeps, type LedgerDeps } from './ledger-edge';

/**
 * `GET /api/snapshot` (architecture §7.2): everything the web app computes figures from, in one
 * call, values compact per holding. `If-None-Match: <dataVersion>` answers `304` when nothing has
 * been written since; the version is read first, so a `304` loads nothing else. Each snapshot sent
 * logs its size and value count: §7.2's revisit trigger is 1 MB gzipped or 20,000 values.
 */

const gzipped = promisify(gzip);

/** The snapshot's ETag: its data version, quoted as RFC 9110 has it. */
export function etagOf(dataVersion: number): string {
  return `"${dataVersion}"`;
}

/**
 * Whether `header` (If-None-Match) names `dataVersion`: as §7.2's bare number, as an ETag (`"12"`,
 * `W/"12"`), in a list, or `*`.
 */
export function matchesVersion(header: string | undefined, dataVersion: number): boolean {
  if (header === undefined) return false;
  return header.split(',').some((part) => {
    const tag = part.trim();
    return tag === '*' || tag.replace(/^W\//, '').replace(/^"(.*)"$/, '$1') === String(dataVersion);
  });
}

function valueCount(snapshot: Snapshot): number {
  return Object.values(snapshot.values).reduce((n, values) => n + values.length, 0);
}

type Outcome = { notModified: number } | { snapshot: Snapshot };

export function snapshotRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', async (c) => {
    const { userId } = await requireSession(c);
    const ifNoneMatch = c.req.header('If-None-Match');
    const profile = await deps.profile(userId);
    const options = deps.options(profile);
    const outcome = await deps.withUser<Outcome>(userId, WEB, async (tx) => {
      const version = await dataVersionOf(tx);
      if (version !== null && matchesVersion(ifNoneMatch, version)) return { notModified: version };
      return { snapshot: await openLedger(tx, options).snapshot() };
    });
    if ('notModified' in outcome) {
      return c.body(null, 304, { ETag: etagOf(outcome.notModified) });
    }

    const { snapshot } = outcome;
    const json = JSON.stringify(snapshot);
    const requestId = c.get('requestId');
    const values = valueCount(snapshot);
    afterResponse(
      c,
      gzipped(json).then((zipped) =>
        log('snapshot_sent', {
          requestId,
          userId,
          bytes: Buffer.byteLength(json),
          gzipBytes: zipped.byteLength,
          valueCount: values,
        }),
      ),
    );
    return c.body(json, 200, {
      'Content-Type': 'application/json',
      ETag: etagOf(snapshot.dataVersion),
    });
  });
}
