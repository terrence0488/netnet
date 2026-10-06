import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContentDoc } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { missingImages } from '../../scripts/content-check';

/**
 * Which guide images block a production publish (plan F11): a listed guide's images must exist,
 * because the connect flow shows them; an unlisted guide's images land with its listing, so their
 * absence is not reported.
 */

function guide(id: string, listed: boolean, image: string | undefined): ContentDoc {
  return {
    kind: 'agent',
    doc: `agents/${id}.json`,
    body: {
      id,
      name: `Fictional ${id}`,
      listed,
      order: 0,
      platforms: {
        any: { steps: [{ text: 'Open it.', ...(image === undefined ? {} : { image }) }] },
      },
    },
  };
}

describe('missingImages()', () => {
  it("reports a listed guide's missing screenshot", () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-'));
    const missing = missingImages([guide('claude', true, 'images/connect/claude-any-1.png')], dir);
    expect(missing).toStrictEqual([
      {
        doc: 'agents/claude.json',
        path: 'platforms.any.steps[0].image',
        image: 'images/connect/claude-any-1.png',
      },
    ]);
  });

  it('reports nothing for an existing screenshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-'));
    mkdirSync(join(dir, 'images', 'connect'), { recursive: true });
    writeFileSync(join(dir, 'images', 'connect', 'claude-any-1.png'), 'fake png');
    const missing = missingImages([guide('claude', true, 'images/connect/claude-any-1.png')], dir);
    expect(missing).toStrictEqual([]);
  });

  it('skips an unlisted guide: its screenshots land with its listing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'content-'));
    const missing = missingImages(
      [
        guide('chatgpt', false, 'images/connect/chatgpt-any-1.png'),
        guide('claude', true, 'images/connect/claude-any-1.png'),
      ],
      dir,
    );
    expect(missing.map((ref) => ref.image)).toStrictEqual(['images/connect/claude-any-1.png']);
  });
});
