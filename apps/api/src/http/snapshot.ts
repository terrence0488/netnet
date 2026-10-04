import type { PackRef, Snapshot } from '@netnet/contracts';
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
 * call, values compact per holding. Its ETag is the data version with the pack chain it was built
 * with, so a write and a content publish each change it; `If-None-Match` with the current one
 * answers `304`, and reads only the version to tell. Each snapshot sent logs its size and value
 * count: §7.2's revisit trigger is 1 MB gzipped or 20,000 values.
 */

const gzipped = promisify(gzip);

/**
 * The snapshot's ETag (RFC 9110, quoted): its data version and each pack it was built with, such
 * as `"12:qz@3:generic@2"`. Opaque to the web app, which sends it back as it came.
 */
export function etagOf(dataVersion: number, packRef: PackRef): string {
  return `"${[String(dataVersion), ...packRef.map((p) => `${p.key}@${p.version}`)].join(':')}"`;
}

/** Whether `header` (If-None-Match) names `etag`: strong or weak, alone or in a list, or `*`. */
export function matchesEtag(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  return header.split(',').some((part) => {
    const tag = part.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}

function valueCount(snapshot: Snapshot): number {
  return Object.values(snapshot.values).reduce((n, values) => n + values.length, 0);
}

type Outcome = { notModified: string } | { snapshot: Snapshot };

export function snapshotRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', async (c) => {
    const { userId } = await requireSession(c);
    const ifNoneMatch = c.req.header('If-None-Match');
    const profile = await deps.profile(userId);
    const options = deps.options(profile);
    // The pack chain live now: a content publish changes it, and so the ETag, as a write does.
    const packRef =
      ifNoneMatch === undefined
        ? undefined
        : (await options.content.chain()).map((p) => ({ key: p.id, version: p.version }));
    const outcome = await deps.withUser<Outcome>(userId, WEB, async (tx) => {
      const version = await dataVersionOf(tx);
      if (version !== null && packRef !== undefined) {
        const etag = etagOf(version, packRef);
        if (matchesEtag(ifNoneMatch, etag)) return { notModified: etag };
      }
      return { snapshot: await openLedger(tx, options).snapshot() };
    });
    if ('notModified' in outcome) {
      return c.body(null, 304, { ETag: outcome.notModified });
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
      ETag: etagOf(snapshot.dataVersion, snapshot.packRef),
    });
  });
}
