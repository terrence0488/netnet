/**
 * `pnpm content:check [--strict]` validates all of content/ (CONVENTIONS §8): every document
 * against its schema and every rule of architecture §7.8 (`validateContent`), each pack and guide in
 * a file named after its id, and every image a guide names. A missing image is a warning, because
 * screenshots arrive after the guides; with --strict, which a production publish uses, it is an
 * error. It also checks the demo household in content/demo/ (`checkDemo`), which is data and never
 * published. Exits non-zero on any error.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agentGuideSchema,
  validateContent,
  validateDemoHousehold,
  type ContentDoc,
  type ContentError,
  type ContentKind,
} from '@netnet/contracts';

export const CONTENT_DIR = resolve(import.meta.dirname, '..', 'content');

/** The folders that hold one document per file, and the kind of each. */
const FOLDERS: readonly (readonly [ContentKind, string])[] = [
  ['pack', 'packs'],
  ['agent', 'agents'],
];
const COUNTRIES_FILE = 'countries.json';

export interface ContentFiles {
  /** Every document, with `doc` its path under content/. */
  docs: ContentDoc[];
  /** Files that could not be read as JSON. */
  errors: ContentError[];
}

/** Reads content/ into the documents `validateContent` takes. */
export function readContent(dir: string = CONTENT_DIR): ContentFiles {
  const docs: ContentDoc[] = [];
  const errors: ContentError[] = [];
  const read = (kind: ContentKind, doc: string) => {
    try {
      const body: unknown = JSON.parse(readFileSync(join(dir, doc), 'utf8'));
      docs.push({ kind, doc, body });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push({ doc, path: '', message: `Cannot be read as JSON: ${reason}` });
    }
  };
  for (const [kind, folder] of FOLDERS) {
    if (!existsSync(join(dir, folder))) continue;
    const names = readdirSync(join(dir, folder)).filter((name) => name.endsWith('.json'));
    for (const name of names.sort()) read(kind, `${folder}/${name}`);
  }
  if (existsSync(join(dir, COUNTRIES_FILE))) read('countries', COUNTRIES_FILE);
  return { docs, errors };
}

/** A pack or guide lives in `<id>.json`, so its file says which one it is. */
export function misnamedFiles(docs: readonly ContentDoc[]): ContentError[] {
  return docs.flatMap(({ kind, doc, body }) => {
    if (kind === 'countries' || typeof body !== 'object' || body === null) return [];
    const id = (body as { id?: unknown }).id;
    const expected = `${String(id)}.json`;
    return typeof id === 'string' && basename(doc) !== expected
      ? [{ doc, path: 'id', message: `The id is "${id}", so the file is named ${expected}.` }]
      : [];
  });
}

export interface ImageRef {
  doc: string;
  path: string;
  image: string;
}

/**
 * Every image a valid guide names (logos and screenshots) that is not in `dir`. Guides that are
 * not listed name no checkable image: the connect flow never shows them, and their screenshots
 * land with their listing (plan F11 stages ChatGPT's after its directory listing).
 */
export function missingImages(docs: readonly ContentDoc[], dir: string = CONTENT_DIR): ImageRef[] {
  const refs: ImageRef[] = [];
  for (const { kind, doc, body } of docs) {
    const parsed = kind === 'agent' ? agentGuideSchema.safeParse(body) : null;
    if (!parsed?.success || !parsed.data.listed) continue;
    const guide = parsed.data;
    if (guide.logo !== undefined) refs.push({ doc, path: 'logo', image: guide.logo });
    for (const [platform, { steps }] of Object.entries(guide.platforms)) {
      steps.forEach((step, i) => {
        if (step.image !== undefined) {
          refs.push({ doc, path: `platforms.${platform}.steps[${i}].image`, image: step.image });
        }
      });
    }
  }
  return refs.filter((ref) => !existsSync(join(dir, ref.image)));
}

/** The demo household (architecture §6.5): read by `content:check` and `demo:load`, never published. */
export const DEMO_FILE = 'demo/household.json';

/**
 * The demo household in `dir` checked against `docs`, the content it is loaded with
 * (`validateDemoHousehold`); nothing when there is none. `readContent` never reads content/demo/,
 * so `content:publish`, which publishes what it reads, never publishes it.
 */
export function checkDemo(docs: readonly ContentDoc[], dir: string = CONTENT_DIR): ContentError[] {
  if (!existsSync(join(dir, DEMO_FILE))) return [];
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(join(dir, DEMO_FILE), 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [{ doc: DEMO_FILE, path: '', message: `Cannot be read as JSON: ${reason}` }];
  }
  return validateDemoHousehold(DEMO_FILE, body, docs);
}

const line = ({ doc, path, message }: ContentError) =>
  `  content/${doc}${path ? ` ${path}` : ''}: ${message}`;

function main(args: readonly string[]): number {
  const unknown = args.filter((arg) => arg !== '--strict');
  if (unknown.length > 0) {
    console.error(`content:check: unknown argument ${unknown.join(' ')}. Usage: [--strict]`);
    return 2;
  }
  const strict = args.includes('--strict');

  const { docs, errors } = readContent();
  const result = validateContent(docs);
  if (!result.ok) errors.push(...result.errors);
  errors.push(...misnamedFiles(docs));
  errors.push(...checkDemo(docs));
  const missing = missingImages(docs).map(({ doc, path, image }) => ({
    doc,
    path,
    message: `content/${image} does not exist.`,
  }));
  if (strict) errors.push(...missing);

  if (!strict && missing.length > 0) {
    console.warn(`content:check: ${missing.length} missing images (an error with --strict):`);
    console.warn(missing.map(line).join('\n'));
  }
  if (errors.length > 0) {
    console.error(`content:check: ${errors.length} errors in ${docs.length} documents:`);
    console.error(errors.map(line).join('\n'));
    return 1;
  }
  const demo = existsSync(join(CONTENT_DIR, DEMO_FILE)) ? ' and the demo household' : '';
  console.log(`content:check: ${docs.length} documents${demo} valid${strict ? ' (strict)' : ''}.`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
