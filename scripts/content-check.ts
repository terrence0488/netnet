/**
 * `pnpm content:check [--strict]` validates all of content/ (CONVENTIONS §8): every document
 * against its schema and every rule of architecture §7.8 (`validateContent`), each pack and guide in
 * a file named after its id, and every image a guide names. A missing image is a warning, because
 * screenshots arrive after the guides; with --strict, which a production publish uses, it is an
 * error. Draft packs (`packs/drafts/`) are checked like any pack and never published, the
 * review record (`reviews.json`) against its schema and the packs, and the demo household
 * in content/demo/ (`checkDemo`), which is data and never published. Exits non-zero on any
 * error.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agentGuideSchema,
  demoHouseholdSchema,
  m12QuestionsSchema,
  packSchema,
  reviewsSchema,
  validateContent,
  validateDemoHousehold,
  validateReviews,
  type ContentDoc,
  type ContentError,
  type ContentKind,
  type Reviews,
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

/* ---- drafts and the review record (CONVENTIONS §8): checked here, never published ---- */

/** Where draft packs live: validated like any pack, never published, until their review. */
export const DRAFTS_FOLDER = 'packs/drafts';
export const REVIEWS_FILE = 'reviews.json';

/** `doc`, a path under `dir`, as JSON, or why it cannot be read. */
function parseJson(dir: string, doc: string): { body: unknown } | { error: ContentError } {
  try {
    return { body: JSON.parse(readFileSync(join(dir, doc), 'utf8')) as unknown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: { doc, path: '', message: `Cannot be read as JSON: ${reason}` } };
  }
}

/**
 * Reads the draft packs in `packs/drafts/`. `readContent`, which `content:publish` uses, reads
 * only the files directly in `packs/`, so a draft is never among what is published.
 */
export function readDrafts(dir: string = CONTENT_DIR): ContentFiles {
  const files: ContentFiles = { docs: [], errors: [] };
  if (!existsSync(join(dir, DRAFTS_FOLDER))) return files;
  const names = readdirSync(join(dir, DRAFTS_FOLDER)).filter((name) => name.endsWith('.json'));
  for (const name of names.sort()) {
    const doc = `${DRAFTS_FOLDER}/${name}`;
    const parsed = parseJson(dir, doc);
    if ('error' in parsed) files.errors.push(parsed.error);
    else files.docs.push({ kind: 'pack', doc, body: parsed.body });
  }
  return files;
}

/**
 * The drafts' errors, each draft validated as it would be beside the published `docs` (so it
 * falls back to the real generic pack and takes no id already in use), and each named after its
 * id. Errors in the published set itself are `validateContent(docs)`'s to report.
 */
export function draftErrors(
  docs: readonly ContentDoc[],
  drafts: readonly ContentDoc[],
): ContentError[] {
  const isDraft = (doc: string) => doc.startsWith(`${DRAFTS_FOLDER}/`);
  const result = validateContent([...docs, ...drafts]);
  return [
    ...(result.ok ? [] : result.errors.filter((e) => isDraft(e.doc))),
    ...misnamedFiles(drafts),
  ];
}

/** The review record, and every problem in it: its shape, and keys naming no pack in `docs`. */
export function readReviews(
  docs: readonly ContentDoc[],
  dir: string = CONTENT_DIR,
): { reviews: Reviews; errors: ContentError[] } {
  if (!existsSync(join(dir, REVIEWS_FILE))) {
    const message = 'There is no review record; start it as {}.';
    return { reviews: {}, errors: [{ doc: REVIEWS_FILE, path: '', message }] };
  }
  const parsed = parseJson(dir, REVIEWS_FILE);
  if ('error' in parsed) return { reviews: {}, errors: [parsed.error] };
  const packIds = new Set(
    docs.flatMap(({ kind, body }) => {
      const pack = kind === 'pack' ? packSchema.safeParse(body) : null;
      return pack?.success ? [pack.data.id] : [];
    }),
  );
  const shape = reviewsSchema.safeParse(parsed.body);
  return {
    reviews: shape.success ? shape.data : {},
    errors: validateReviews(parsed.body, packIds, REVIEWS_FILE),
  };
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

/** The M12 question set (PRD M12): read by `content:check`, never published or loaded into an account. */
export const QUESTIONS_FILE = 'demo/m12-questions.json';

/**
 * The M12 question set in `dir`, against the household it asks about: its schema, then the
 * household's end date and currency as its `asOf` and `currency`, and every holding it names.
 * The set is data, so `readContent` never reads it and `content:publish` never publishes it.
 */
export function checkQuestions(dir: string = CONTENT_DIR): ContentError[] {
  if (!existsSync(join(dir, QUESTIONS_FILE))) {
    return [
      {
        doc: QUESTIONS_FILE,
        path: '',
        message: 'There is no M12 question set: the harness has nothing to ask.',
      },
    ];
  }
  const parsed = parseJson(dir, QUESTIONS_FILE);
  if ('error' in parsed) return [parsed.error];
  const set = m12QuestionsSchema.safeParse(parsed.body);
  if (!set.success) {
    return set.error.issues.map((issue) => ({
      doc: QUESTIONS_FILE,
      path: issue.path.join('.'),
      message: issue.message,
    }));
  }
  const householdText = parseJson(dir, DEMO_FILE);
  if ('error' in householdText) return [];
  const household = demoHouseholdSchema.safeParse(householdText.body);
  if (!household.success) return [];
  const errors: ContentError[] = [];
  const report = (path: string, message: string) =>
    errors.push({ doc: QUESTIONS_FILE, path, message });
  if (set.data.asOf !== household.data.endDate) {
    report(
      'asOf',
      `The ground truth is computed at the household's end date, ${household.data.endDate}.`,
    );
  }
  if (set.data.currency !== household.data.baseCurrency) {
    report('currency', `The household's base currency is ${household.data.baseCurrency}.`);
  }
  const names = new Set(household.data.holdings.map((h) => h.name));
  set.data.questions.forEach((question, i) => {
    if (question.holding !== undefined && !names.has(question.holding)) {
      report(
        `questions.${i}.holding`,
        `There is no holding "${question.holding}" in the household.`,
      );
    }
  });
  return errors;
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
  const drafts = readDrafts();
  errors.push(...drafts.errors, ...draftErrors(docs, drafts.docs), ...readReviews(docs).errors);
  errors.push(...checkDemo(docs), ...checkQuestions());
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
  console.log(`content:check: ${drafts.docs.length} drafts and the review record valid.`);
  console.log(`content:check: ${docs.length} documents${demo} valid${strict ? ' (strict)' : ''}.`);
  return 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
