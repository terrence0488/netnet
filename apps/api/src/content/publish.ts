import { createHash } from 'node:crypto';
import {
  CONTENT_KINDS,
  validateContent,
  type ContentDoc,
  type ContentError,
  type ContentKind,
} from '@netnet/contracts';
import type { Database, Transaction } from '../db/client';
import {
  contentBody,
  currentDocs,
  insertVersion,
  lockContent,
  moveCurrent,
  versionWithHash,
  type ContentRef,
} from '../db/content';

/**
 * Publishing content (architecture §6.5, PRD §2.3): every document is validated, and any error
 * rejects the whole publish, because a half-applied pack is a wrong pack. Then, in one
 * transaction, a document whose body changed gets a new immutable version (or the version that
 * already has that body), what is live moves, and each move is audited. Rolling back points what
 * is live at an older version, audited the same way. The future admin portal calls the same code.
 */

/** The country list is one document; its key. Packs and guides are keyed by their `id`. */
export const COUNTRIES_KEY = 'countries';

export function contentKey({ kind, body }: Pick<ContentDoc, 'kind' | 'body'>): string {
  if (kind === 'countries') return COUNTRIES_KEY;
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== 'string') throw new Error(`A ${kind} has no id.`);
  return id;
}

/** JSON with object keys sorted, so a body's hash ignores key order and layout, as jsonb does. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function bodyHash(body: unknown): string {
  return createHash('sha256').update(canonical(body)).digest('hex');
}

/** The publish was refused: nothing was written. */
export class ContentRejected extends Error {
  override readonly name = 'ContentRejected';
  readonly errors: ContentError[];

  constructor(message: string, errors: ContentError[] = []) {
    super(message);
    this.errors = errors;
  }
}

export interface PublishMeta {
  /** Who wrote the content: the git author. Also recorded as who moved it live. */
  author: string;
  /** The commit the content came from. */
  sourceCommit: string | null;
}

export interface DocOutcome extends ContentRef {
  /** The live version before; null if the document is new. */
  from: number | null;
  /** `new`: a new version was written; `reused`: an earlier version has this body; `unchanged`. */
  change: 'new' | 'reused' | 'unchanged';
}

function isKind(kind: string): kind is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(kind);
}

/** Publishes `docs`, all of them or none. Throws ContentRejected when any document is invalid. */
export async function publishContent(
  db: Database,
  docs: readonly ContentDoc[],
  meta: PublishMeta,
): Promise<DocOutcome[]> {
  const result = validateContent(docs);
  if (!result.ok) {
    throw new ContentRejected(
      `${result.errors.length} errors: nothing was published.`,
      result.errors,
    );
  }
  const keyed = docs.map((doc) => ({
    kind: doc.kind,
    key: contentKey(doc),
    body: doc.body,
    sha256: bodyHash(doc.body),
  }));
  const seen = new Set<string>();
  for (const { kind, key } of keyed) {
    if (seen.has(`${kind}/${key}`)) {
      throw new ContentRejected(`Two documents are ${kind}/${key}: nothing was published.`);
    }
    seen.add(`${kind}/${key}`);
  }

  return db.transaction(async (tx) => {
    await lockContent(tx);
    const live = new Map((await currentDocs(tx)).map((d) => [`${d.kind}/${d.key}`, d]));
    const outcomes: DocOutcome[] = [];
    for (const doc of keyed) {
      const current = live.get(`${doc.kind}/${doc.key}`);
      const from = current?.version ?? null;
      if (current?.sha256 === doc.sha256) {
        outcomes.push({
          kind: doc.kind,
          key: doc.key,
          version: current.version,
          from,
          change: 'unchanged',
        });
        continue;
      }
      const existing = await versionWithHash(tx, doc.kind, doc.key, doc.sha256);
      const version =
        existing ??
        (await insertVersion(tx, {
          ...doc,
          author: meta.author,
          sourceCommit: meta.sourceCommit,
        }));
      await moveCurrent(tx, { kind: doc.kind, key: doc.key, version }, from, meta.author);
      outcomes.push({
        kind: doc.kind,
        key: doc.key,
        version,
        from,
        change: existing === undefined ? 'new' : 'reused',
      });
    }
    return outcomes;
  });
}

/** `kind/key@version`, as `--rollback` takes it. */
export function parseContentRef(text: string): ContentRef | undefined {
  const match = /^([a-z]+)\/([a-z][a-z0-9_]*)@([1-9][0-9]{0,8})$/.exec(text);
  if (!match || !isKind(match[1] ?? '')) return undefined;
  return { kind: match[1] ?? '', key: match[2] ?? '', version: Number(match[3]) };
}

/** The live set as documents `validateContent` takes, with `target`'s body in place of its own. */
async function liveSetWith(
  tx: Transaction,
  target: ContentRef,
  body: unknown,
): Promise<ContentDoc[]> {
  const live = await currentDocs(tx);
  const docs: ContentDoc[] = [];
  for (const ref of live) {
    if (!isKind(ref.kind) || (ref.kind === target.kind && ref.key === target.key)) continue;
    docs.push({
      kind: ref.kind,
      doc: `${ref.kind}/${ref.key}@${ref.version}`,
      body: await contentBody(tx, ref),
    });
  }
  if (isKind(target.kind)) {
    docs.push({ kind: target.kind, doc: `${target.kind}/${target.key}@${target.version}`, body });
  }
  return docs;
}

/**
 * Points `target`'s document back at `target.version`, audited with `actor`. The version must
 * exist, and the live set with it must still validate. Returns the version it moved from (equal to
 * `target.version` when it was already live, and then nothing changes).
 */
export async function rollbackContent(
  db: Database,
  target: ContentRef,
  actor: string,
): Promise<{ from: number }> {
  return db.transaction(async (tx) => {
    await lockContent(tx);
    const body = await contentBody(tx, target);
    const name = `${target.kind}/${target.key}`;
    if (body === undefined) {
      throw new ContentRejected(`${name} has no version ${target.version}.`);
    }
    const current = (await currentDocs(tx)).find(
      (d) => d.kind === target.kind && d.key === target.key,
    );
    if (!current) throw new ContentRejected(`${name} is not published.`);
    if (current.version === target.version) return { from: current.version };
    const result = validateContent(await liveSetWith(tx, target, body));
    if (!result.ok) {
      throw new ContentRejected(
        `With ${name}@${target.version} live, the content would not validate: nothing changed.`,
        result.errors,
      );
    }
    await moveCurrent(tx, target, current.version, actor);
    return { from: current.version };
  });
}
