import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContentDoc, Pack } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import {
  DRAFTS_FOLDER,
  REVIEWS_FILE,
  draftErrors,
  readContent,
  readDrafts,
  readReviews,
} from '../../scripts/content-check';

/**
 * content:check over the drafts and the review record (CONVENTIONS §8). A draft is validated as
 * it would be beside the published content, and never read as content to publish; the review
 * record names only published packs.
 */

const published = readContent().docs;
const drafts = readDrafts().docs;

/** A copy of the real draft `id`, changed by `edit`. */
function draft(id: string, edit: (pack: Pack) => void = () => {}): ContentDoc {
  const found = drafts.find((d) => (d.body as Pack).id === id);
  if (!found) throw new Error(`no draft ${id}`);
  const body = structuredClone(found.body as Pack);
  edit(body);
  return { ...found, body };
}

/** A content folder in a temporary directory, with these files. */
function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

describe('readDrafts() and readContent()', () => {
  it('reads the seven drafts, and readContent (what is published) reads none of them', () => {
    expect(drafts.map((d) => d.doc)).toStrictEqual(
      ['au', 'hk', 'id', 'in', 'ph', 'th', 'vn'].map((id) => `${DRAFTS_FOLDER}/${id}.json`),
    );
    expect(drafts.every((d) => d.kind === 'pack')).toBe(true);
    expect(published.some((d) => d.doc.startsWith(`${DRAFTS_FOLDER}/`))).toBe(false);
  });

  it('reports a draft that is not JSON, and reads none when there is no drafts folder', () => {
    const dir = folder({ [`${DRAFTS_FOLDER}/zz.json`]: '{ not json' });
    expect(readDrafts(dir).errors.map((e) => e.doc)).toStrictEqual([`${DRAFTS_FOLDER}/zz.json`]);
    expect(readDrafts(folder({}))).toStrictEqual({ docs: [], errors: [] });
  });
});

describe('draftErrors()', () => {
  it('finds no error in the real drafts', () => {
    expect(draftErrors(published, drafts)).toStrictEqual([]);
  });

  it('validates a draft against the real generic pack, naming the draft and the path', () => {
    const badCurrency = draft('au', (p) => (p.currency = 'XXX'));
    expect(draftErrors(published, [badCurrency]).map((e) => `${e.doc} ${e.path}`)).toStrictEqual([
      `${DRAFTS_FOLDER}/au.json currency`,
    ]);
    const badFollowUp = draft('au', (p) => {
      const loan = p.checklist.find((i) => i.id === 'car_loan');
      if (loan) loan.onlyIf = 'boat';
    });
    expect(draftErrors(published, [badFollowUp]).map((e) => e.path)).toStrictEqual([
      'checklist[8].onlyIf',
    ]);
    const unanswerable = draft('hk', (p) => {
      delete p.questions.retirement;
    });
    expect(draftErrors(published, [unanswerable]).map((e) => e.path)).toStrictEqual([
      'checklist[1].answer',
      'checklist[2].answer',
    ]);
  });

  it('refuses a draft that takes a published pack’s id, or is not named after its id', () => {
    const copy = { ...draft('au', (p) => (p.id = 'sg')), doc: `${DRAFTS_FOLDER}/sg.json` };
    expect(draftErrors(published, [copy])).toStrictEqual([
      {
        doc: `${DRAFTS_FOLDER}/sg.json`,
        path: 'id',
        message: 'Pack id "sg" is already used by packs/sg.json.',
      },
    ]);
    const misnamed = { ...draft('au'), doc: `${DRAFTS_FOLDER}/oz.json` };
    expect(draftErrors(published, [misnamed]).map((e) => e.message)).toStrictEqual([
      'The id is "au", so the file is named au.json.',
    ]);
  });

  it('leaves errors in the published content to the publish check', () => {
    const broken = published.map((d) =>
      d.doc === 'packs/sg.json' ? { ...d, body: { ...(d.body as Pack), currency: 'XXX' } } : d,
    );
    expect(draftErrors(broken, drafts)).toStrictEqual([]);
  });
});

describe('readReviews()', () => {
  const review = { sha256: 'a'.repeat(64), reviewer: 'FR', on: '2026-10-25' };

  it('reads the real record, empty and valid', () => {
    expect(readReviews(published)).toStrictEqual({ reviews: {}, errors: [] });
  });

  it('reads a review of a published pack', () => {
    const dir = folder({ [REVIEWS_FILE]: JSON.stringify({ sg: review }) });
    expect(readReviews(published, dir)).toStrictEqual({ reviews: { sg: review }, errors: [] });
  });

  it('rejects a review of a draft or of no pack, and a bad hash', () => {
    const dir = folder({
      [REVIEWS_FILE]: JSON.stringify({ au: review, gb: { ...review, sha256: 'abc' } }),
    });
    const { errors } = readReviews(published, dir);
    expect(errors.map((e) => `${e.doc} ${e.path}`)).toStrictEqual([`${REVIEWS_FILE} gb.sha256`]);
    const draftOnly = folder({ [REVIEWS_FILE]: JSON.stringify({ au: review }) });
    expect(readReviews(published, draftOnly).errors).toStrictEqual([
      {
        doc: REVIEWS_FILE,
        path: 'au',
        message: 'There is no pack "au". A pack\'s review is recorded as it moves out of drafts.',
      },
    ]);
  });

  it('reports a record that is missing or not JSON', () => {
    expect(readReviews(published, folder({})).errors.map((e) => e.message)).toStrictEqual([
      'There is no review record; start it as {}.',
    ]);
    const { errors } = readReviews(published, folder({ [REVIEWS_FILE]: '{' }));
    expect(errors[0]?.message).toMatch(/^Cannot be read as JSON/);
  });
});
