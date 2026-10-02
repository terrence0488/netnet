/// <reference types="node" />
import { breakpoint } from '@netnet/tokens';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CONVENTIONS §13: components use tokens only, never raw colours, sizes or font names. Every CSS
 * Module in the web app is scanned, and so is the global stylesheet, apart from its @font-face
 * rules (the one place a font is named). Media queries cannot read custom properties, so their
 * widths must be the token breakpoints.
 */

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly rule: 'colour' | 'size' | 'type' | 'motion' | 'layer' | 'opacity' | 'breakpoint';
  readonly text: string;
}

const BREAKPOINTS = new Set<number>(Object.values(breakpoint));

const LENGTH =
  /(-?\d*\.?\d+)(px|rem|em|ex|ch|pt|pc|cm|mm|in|q|vh|vw|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw)\b/gi;
const TIME = /(?<![\w-])(\d*\.?\d+)(ms|s)\b/gi;
const EASING = /\b(cubic-bezier|steps|linear)\(/i;
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const COLOUR_PROPERTY =
  /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|box-shadow|fill|stroke|text-decoration(-color)?|caret-color|accent-color)$/;
/** Words a colour-bearing value may hold besides tokens: keywords, functions and units. */
const COLOUR_WORDS = new Set([
  'none',
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'solid',
  'dashed',
  'dotted',
  'double',
  'inset',
  'auto',
  'underline',
  'wavy',
  'from-font',
  'calc',
  'min',
  'max',
  'clamp',
  'color-mix',
  'in',
  'srgb',
  'oklab',
  'px',
]);

/** Each type property, and what it may hold besides its token. */
const TYPE_TOKENS: Record<string, { token: string; allowed: readonly string[] }> = {
  'font-family': { token: 'font', allowed: ['inherit'] },
  'font-size': { token: 'size', allowed: ['inherit'] },
  'font-weight': { token: 'weight', allowed: ['inherit'] },
  'letter-spacing': { token: 'tracking', allowed: ['inherit', 'normal', '0'] },
  'line-height': { token: 'leading', allowed: ['inherit', 'normal', '1'] },
};

/** Replaces each match with spaces, so line numbers still point at the source. */
function blank(css: string, pattern: RegExp): string {
  return css.replace(pattern, (match) => match.replace(/[^\n]/g, ' '));
}

function lineAt(css: string, index: number): number {
  return css.slice(0, index).split('\n').length;
}

const nonZero = (match: RegExpMatchArray) => Number(match[1]) !== 0;

export function findRawValues(file: string, source: string): Finding[] {
  const css = blank(blank(source, /\/\*[\s\S]*?\*\//g), /@font-face\s*\{[^}]*\}/g);
  const found: Finding[] = [];
  const add = (index: number, rule: Finding['rule'], text: string) =>
    found.push({ file, line: lineAt(css, index), rule, text: text.trim() });

  for (const media of css.matchAll(/@media([^{]+)\{/g)) {
    for (const width of media[1]?.matchAll(/(\d*\.?\d+)px/g) ?? []) {
      if (!BREAKPOINTS.has(Number(width[1]))) add(media.index, 'breakpoint', media[0]);
    }
  }

  const declarations = /(?<=^|[{;\s])((?:--)?[a-z][a-z0-9-]*)\s*:\s*([^;{}]+?)\s*(?=[;}])/g;
  for (const declaration of css.matchAll(declarations)) {
    const [text, property = '', value = ''] = declaration;
    const at = declaration.index;
    const bare = value.replace(/var\(--[a-z0-9-]+\)/g, '');
    if (COLOUR_LITERAL.test(bare)) add(at, 'colour', text);
    else if (COLOUR_PROPERTY.test(property)) {
      const words = bare.toLowerCase().match(/[a-z][a-z-]*/g) ?? [];
      if (words.some((word) => !COLOUR_WORDS.has(word) && !word.startsWith('safe-area-inset'))) {
        add(at, 'colour', text);
      }
    }
    if ([...bare.matchAll(LENGTH)].some(nonZero)) add(at, 'size', text);
    if ([...bare.matchAll(TIME)].some(nonZero) || EASING.test(bare)) add(at, 'motion', text);
    const type = TYPE_TOKENS[property];
    if (type) {
      const token = new RegExp(`^var\\(--${type.token}-[a-z0-9-]+\\)$`);
      if (!token.test(value) && !type.allowed.includes(value)) add(at, 'type', text);
    }
    if (property === 'font' && value !== 'inherit') add(at, 'type', text);
    if (property === 'z-index' && !/^var\(--layer-[a-z-]+\)$/.test(value)) add(at, 'layer', text);
    if (property === 'opacity' && !/^(var\(--opacity-[a-z-]+\)|0|1)$/.test(value)) {
      add(at, 'opacity', text);
    }
  }
  return found;
}

const SRC = resolve(import.meta.dirname, '..');

/** Every CSS Module under src/, and the global stylesheet. */
function stylesheets(): Map<string, string> {
  const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.module.css') || file === join('styles', 'global.css'))
    .sort();
  return new Map(files.map((file) => [file, readFileSync(join(SRC, file), 'utf8')]));
}

describe('stylesheets use tokens only (CONVENTIONS §13)', () => {
  it('finds the CSS Modules and the global stylesheet', () => {
    const files = [...stylesheets().keys()];
    expect(files).toContain(join('components', 'Button.module.css'));
    expect(files).toContain(join('styles', 'global.css'));
  });

  it('hold no raw colour, size, type, motion, layer or breakpoint', () => {
    const found = [...stylesheets()].flatMap(([file, css]) => findRawValues(file, css));
    expect(found).toStrictEqual([]);
  });

  describe('the scan itself', () => {
    const scan = (css: string) => findRawValues('planted.module.css', css).map((f) => f.rule);

    it('catches raw colours, by literal and by name', () => {
      expect(scan('.a { color: #1a1714; }')).toStrictEqual(['colour']);
      expect(scan('.a { background: rgba(0, 0, 0, 0.5); }')).toStrictEqual(['colour']);
      expect(scan('.a { border: 2px solid black; }')).toStrictEqual(['colour', 'size']);
      expect(scan('.a { color: white }')).toStrictEqual(['colour']);
    });

    it('catches raw sizes, durations and easings, but not zero', () => {
      expect(scan('.a { padding: 13px 1.5rem; }')).toStrictEqual(['size']);
      expect(scan('.a { max-height: 88vh; }')).toStrictEqual(['size']);
      expect(scan('.a { transition: opacity 0.2s; }')).toStrictEqual(['motion']);
      expect(scan('.a { transition-timing-function: cubic-bezier(0, 0, 1, 1); }')).toStrictEqual([
        'motion',
      ]);
      expect(scan('.a { margin: 0; bottom: env(safe-area-inset-bottom, 0px); }')).toStrictEqual([]);
    });

    it('catches font names, raw weights and raw type settings', () => {
      expect(scan(".a { font-family: 'Space Grotesk', sans-serif; }")).toStrictEqual(['type']);
      expect(scan('.a { font: 700 15px Unbounded; }')).toStrictEqual(['size', 'type']);
      expect(scan('.a { font-weight: 700; }')).toStrictEqual(['type']);
      expect(scan('.a { font-size: larger; }')).toStrictEqual(['type']);
      expect(scan('.a { line-height: 1.3; letter-spacing: 0.1em; }')).toStrictEqual([
        'type',
        'size',
        'type',
      ]);
    });

    it('catches stray layers, opacities and breakpoints', () => {
      expect(scan('.a { z-index: 50; opacity: 0.45; }')).toStrictEqual(['layer', 'opacity']);
      expect(scan('@media (min-width: 768px) { .a { color: var(--ink); } }')).toStrictEqual([
        'breakpoint',
      ]);
    });

    it('accepts tokens, selectors with colons, comments, keywords and font faces', () => {
      const css = [
        '/* a raw #fff in a comment is fine */',
        "@font-face { font-family: Unbounded; src: url('/fonts/u.woff2'); font-weight: 200 900; }",
        '@media (min-width: 900px) {',
        "  .a:not([aria-disabled='true']):hover {",
        '    color: var(--brand-text);',
        '    border: var(--border-edge) dashed var(--edge);',
        '    padding: calc(var(--space-4) * 2) var(--inset-card);',
        '    transition: transform var(--duration-press) var(--easing-sheet);',
        '    font-family: var(--font-display);',
        '    font-size: var(--size-figure);',
        '    font-weight: var(--weight-figure);',
        '    line-height: 1;',
        '    letter-spacing: var(--tracking-label);',
        '    z-index: var(--layer-toast);',
        '    opacity: 0;',
        '  }',
        '}',
      ].join('\n');
      expect(scan(css)).toStrictEqual([]);
    });
  });
});
