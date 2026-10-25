import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_FILE, checkDemo, readContent } from '../../scripts/content-check';

/**
 * The demo household in content/demo/ (architecture §6.5): `content:check` validates it against the
 * content it is loaded with, and `content:publish`, which publishes what `readContent` reads, never
 * sees it.
 */

/** A content directory with only the demo file, holding `text`. */
function withDemo(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'content-demo-'));
  mkdirSync(join(dir, 'demo'));
  writeFileSync(join(dir, DEMO_FILE), text);
  return dir;
}

describe('the demo household in content/', () => {
  it('passes content:check against the repository’s content', () => {
    const { docs, errors } = readContent();
    expect(errors).toStrictEqual([]);
    expect(checkDemo(docs)).toStrictEqual([]);
  });

  it('is never read for publishing', () => {
    const { docs } = readContent();
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.filter((d) => d.doc.startsWith('demo/'))).toStrictEqual([]);
  });

  it('fails content:check when broken, naming the field', () => {
    const { docs } = readContent();
    const dir = withDemo(JSON.stringify({ country: 'SG' }));
    expect(checkDemo(docs, dir).map((e) => [e.doc, e.path])).toStrictEqual([
      [DEMO_FILE, 'baseCurrency'],
      [DEMO_FILE, 'segment'],
      [DEMO_FILE, 'endDate'],
      [DEMO_FILE, 'tags'],
      [DEMO_FILE, 'holdings'],
    ]);
  });

  it('fails content:check when it is not JSON', () => {
    const errors = checkDemo([], withDemo('{ not json'));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/^Cannot be read as JSON: /);
  });

  it('is optional: a content directory without one has nothing to check', () => {
    expect(checkDemo([], mkdtempSync(join(tmpdir(), 'content-none-')))).toStrictEqual([]);
  });
});
