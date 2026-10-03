/**
 * `pnpm content:publish --env <env> [--strict]` publishes content/ to that environment's database
 * (architecture §6.5, CONVENTIONS §8): every document is validated as `content:check` does, and
 * any error rejects the whole publish. In one transaction, a changed document gets a new immutable
 * version, what is live moves, and each move is audited. An unchanged document changes nothing.
 * The author is the git author of HEAD, and the commit is recorded with each new version.
 *
 * `pnpm content:publish --env <env> --rollback <kind>/<key>@<version>` points a document back at an
 * earlier version, audited with the git user's name.
 *
 * <env> is local, preview or production; a production publish is --strict (a missing image is an
 * error). Reads DATABASE_URL: the app's connection (netnet_app), as `db:seed` does.
 */
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createDatabase, createPool } from '@netnet/api/db/client';
import {
  ContentRejected,
  parseContentRef,
  publishContent,
  rollbackContent,
  type DocOutcome,
} from '@netnet/api/content/publish';
import { validateContent, type ContentError } from '@netnet/contracts';
import { missingImages, misnamedFiles, readContent } from './content-check';
import { requireEnv, run } from './db-env';

const ENVS = ['local', 'preview', 'production'] as const;
const USAGE =
  'Usage: pnpm content:publish --env local|preview|production [--strict] [--rollback <kind>/<key>@<version>]';

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** The git user running a rollback, else HEAD's author. */
function gitUser(): string {
  try {
    const name = git('config', 'user.name');
    if (name) return name;
  } catch {
    // No user configured: fall through.
  }
  return git('log', '-1', '--format=%an');
}

const line = ({ doc, path, message }: ContentError) =>
  `  ${doc}${path ? ` ${path}` : ''}: ${message}`;

function describe(outcome: DocOutcome): string {
  const name = `${outcome.kind}/${outcome.key}`;
  switch (outcome.change) {
    case 'unchanged':
      return `  ${name}: unchanged at version ${outcome.version}`;
    case 'reused':
      return `  ${name}: version ${outcome.from ?? '–'} → ${outcome.version} (an earlier version with this content)`;
    case 'new':
      return `  ${name}: version ${outcome.from ?? '–'} → ${outcome.version} (new)`;
  }
}

await run('content:publish', async () => {
  const { values } = parseArgs({
    options: {
      env: { type: 'string' },
      strict: { type: 'boolean', default: false },
      rollback: { type: 'string' },
    },
  });
  const env = ENVS.find((e) => e === values.env);
  if (!env) throw new Error(`Name the environment with --env. ${USAGE}`);
  if (env === 'production' && !values.strict && values.rollback === undefined) {
    throw new Error('A production publish is strict: add --strict.');
  }

  if (values.rollback !== undefined) {
    const target = parseContentRef(values.rollback);
    if (!target) throw new Error(`--rollback takes <kind>/<key>@<version>, such as pack/sg@2.`);
    const actor = gitUser();
    const pool = createPool(requireEnv('DATABASE_URL'));
    try {
      const { from } = await rollbackContent(createDatabase(pool), target, actor);
      const name = `${target.kind}/${target.key}`;
      return from === target.version
        ? `${env}: ${name} is already at version ${from}; nothing changed.`
        : `${env}: ${name} rolled back from version ${from} to ${target.version}, by ${actor}.`;
    } catch (error) {
      if (error instanceof ContentRejected && error.errors.length > 0) {
        console.error(error.errors.map(line).join('\n'));
      }
      throw error;
    } finally {
      await pool.end();
    }
  }

  const { docs, errors } = readContent();
  const result = validateContent(docs);
  if (!result.ok) errors.push(...result.errors);
  errors.push(...misnamedFiles(docs));
  const missing = missingImages(docs).map(({ doc, path, image }) => ({
    doc,
    path,
    message: `content/${image} does not exist.`,
  }));
  if (values.strict) errors.push(...missing);
  else if (missing.length > 0) {
    console.warn(`${missing.length} missing images (an error with --strict).`);
  }
  if (errors.length > 0) {
    console.error(errors.map((e) => line({ ...e, doc: `content/${e.doc}` })).join('\n'));
    throw new Error(`${errors.length} errors in ${docs.length} documents: nothing was published.`);
  }

  const meta = { author: git('log', '-1', '--format=%an'), sourceCommit: git('rev-parse', 'HEAD') };
  const pool = createPool(requireEnv('DATABASE_URL'));
  let outcomes: DocOutcome[];
  try {
    outcomes = await publishContent(createDatabase(pool), docs, meta);
  } finally {
    await pool.end();
  }
  console.log(outcomes.map(describe).join('\n'));
  const moved = outcomes.filter((o) => o.change !== 'unchanged').length;
  return `${env}: ${moved} of ${outcomes.length} documents changed, from ${meta.sourceCommit.slice(0, 12)} by ${meta.author}.`;
});
