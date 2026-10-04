import { and, desc, eq, max, sql } from 'drizzle-orm';
import type { Executor, Transaction } from './client';
import { contentAudit, contentCurrent, contentDoc } from './schema';

/**
 * Reads and writes `core.content_doc`, `content_current` and `content_audit` (architecture §6.2,
 * §6.5). Documents are immutable once written; which one is live moves, and every move is audited.
 * Only `apps/api/src/db/**` touches `core` (CONVENTIONS §3).
 */
export interface ContentRef {
  kind: string;
  key: string;
  version: number;
}

export interface CurrentDoc extends ContentRef {
  sha256: string;
}

/** Which version of each document is live. */
export async function currentVersions(db: Executor): Promise<ContentRef[]> {
  return db
    .select({ kind: contentCurrent.kind, key: contentCurrent.key, version: contentCurrent.version })
    .from(contentCurrent)
    .orderBy(contentCurrent.kind, contentCurrent.key);
}

/** One version's body, or undefined when there is no such version. */
export async function contentBody(db: Executor, ref: ContentRef): Promise<unknown> {
  const rows = await db
    .select({ body: contentDoc.body })
    .from(contentDoc)
    .where(
      and(
        eq(contentDoc.kind, ref.kind),
        eq(contentDoc.key, ref.key),
        eq(contentDoc.version, ref.version),
      ),
    )
    .limit(1);
  return rows[0]?.body;
}

/** Serialises publishes and rollbacks: each reads what is live, then moves it. */
export async function lockContent(tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('netnet.content.publish'))`);
}

/** Every live document with its body's hash. */
export async function currentDocs(tx: Transaction): Promise<CurrentDoc[]> {
  return tx
    .select({
      kind: contentCurrent.kind,
      key: contentCurrent.key,
      version: contentCurrent.version,
      sha256: contentDoc.sha256,
    })
    .from(contentCurrent)
    .innerJoin(
      contentDoc,
      and(
        eq(contentDoc.kind, contentCurrent.kind),
        eq(contentDoc.key, contentCurrent.key),
        eq(contentDoc.version, contentCurrent.version),
      ),
    );
}

/** The newest version of `kind`/`key` with this body, if one was ever published. */
export async function versionWithHash(
  tx: Transaction,
  kind: string,
  key: string,
  sha256: string,
): Promise<number | undefined> {
  const rows = await tx
    .select({ version: contentDoc.version })
    .from(contentDoc)
    .where(and(eq(contentDoc.kind, kind), eq(contentDoc.key, key), eq(contentDoc.sha256, sha256)))
    .orderBy(desc(contentDoc.version))
    .limit(1);
  return rows[0]?.version;
}

/** Writes the next version of `kind`/`key` and returns its number. */
export async function insertVersion(
  tx: Transaction,
  doc: {
    kind: string;
    key: string;
    body: unknown;
    sha256: string;
    author: string;
    sourceCommit: string | null;
  },
): Promise<number> {
  const [latest] = await tx
    .select({ version: max(contentDoc.version) })
    .from(contentDoc)
    .where(and(eq(contentDoc.kind, doc.kind), eq(contentDoc.key, doc.key)));
  const version = (latest?.version ?? 0) + 1;
  await tx.insert(contentDoc).values({ ...doc, version });
  return version;
}

/** Points `kind`/`key` at `version` and audits the move from `from`. */
export async function moveCurrent(
  tx: Transaction,
  ref: ContentRef,
  from: number | null,
  actor: string,
): Promise<void> {
  await tx
    .insert(contentCurrent)
    .values({ ...ref, updatedBy: actor, updatedAt: sql`now()` })
    .onConflictDoUpdate({
      target: [contentCurrent.kind, contentCurrent.key],
      set: { version: ref.version, updatedBy: actor, updatedAt: sql`now()` },
    });
  await tx.insert(contentAudit).values({
    kind: ref.kind,
    key: ref.key,
    fromVersion: from,
    toVersion: ref.version,
    actor,
  });
}
