import type { Tokens, TypeStep } from './tokens';

type Declarations = [name: string, value: string][];

const px = (n: number) => `${n}px`;

/** A font stack: names with spaces are quoted, generic and system names are not. */
function stack(names: readonly string[]): string {
  return names.map((n) => (n.includes(' ') ? `'${n}'` : n)).join(', ');
}

/** A text size at computer size, scaled for a phone and floored (design-system §3). */
function scaled(size: number): string {
  return `max(var(--fs-min), calc(${px(size)} * var(--fs)))`;
}

function typeDeclarations(t: Tokens): Declarations {
  const out: Declarations = [];
  const steps: [string, TypeStep][] = Object.entries(t.type);
  const { min, vw, max } = t.displaySize;
  for (const [name, step] of steps) {
    out.push([
      `size-${name}`,
      name === 'display' ? `clamp(${px(min)}, ${vw}vw, ${px(max)})` : scaled(step.size),
    ]);
    out.push([`weight-${name}`, String(step.weight)]);
    out.push([`tracking-${name}`, step.tracking === 0 ? '0' : `${step.tracking}em`]);
    if (step.leading !== undefined) out.push([`leading-${name}`, String(step.leading)]);
  }
  return out;
}

function group(prefix: string, values: Record<string, number>, unit = 'px'): Declarations {
  return Object.entries(values).map(([k, v]) => [`${prefix}-${k}`, `${v}${unit}`]);
}

function rootDeclarations(t: Tokens): Declarations {
  return [
    ...Object.entries(t.color.light).map(([k, v]): [string, string] => [k, v.toLowerCase()]),
    ['wash', String(t.wash.light)],
    ...Object.entries(t.font).map(([k, v]): [string, string] => [`font-${k}`, stack(v)]),
    ['fs', String(t.scale.phone)],
    ['fs-min', px(t.scale.phoneFloor)],
    ...typeDeclarations(t),
    ...group('space', t.space),
    ...group('inset', t.inset),
    ...group('radius', t.radius),
    ...group('border', t.border),
    ...group('offset', t.offset),
    ...Object.keys(t.offset).map((k): [string, string] => [
      `shadow-${k}`,
      `var(--offset-${k}) var(--offset-${k}) 0 var(--drop)`,
    ]),
    ['shadow-focus', 'var(--offset-control) var(--offset-control) 0 var(--brand)'],
    ['hit', px(t.hit.touch)],
    ...Object.entries(t.layout).map(([k, v]): [string, string] => [k, px(v)]),
    ...group('icon', t.icon),
    ...group('duration', t.duration, 'ms'),
    ...Object.entries(t.easing).map(([k, v]): [string, string] => [
      `easing-${k}`,
      `cubic-bezier(${v.join(', ')})`,
    ]),
    ...group('opacity', t.opacity, ''),
    ...group('layer', t.layer, ''),
  ];
}

function block(selector: string, declarations: Declarations, indent = ''): string {
  const lines = declarations.map(([name, value]) => `${indent}  --${name}: ${value};`);
  return `${indent}${selector} {\n${lines.join('\n')}\n${indent}}`;
}

function media(query: string, declarations: Declarations): string {
  return `@media ${query} {\n${block(':root', declarations, '  ')}\n}`;
}

/** tokens.css, exactly as committed. The tokens test fails when the file and this disagree. */
export function renderCss(t: Tokens): string {
  const root = block(':root', rootDeclarations(t)).replace(
    ':root {\n',
    ':root {\n  color-scheme: light dark;\n',
  );
  return [
    '/* Generated from tokens.ts: edit that file, then run `pnpm test -u` to rewrite this one. */',
    '',
    '/* Light (cream) is the reference theme; every name is declared here. */',
    root,
    '',
    '/* Dark (espresso) follows the OS, authored separately (design-system §8). */',
    media('(prefers-color-scheme: dark)', [
      ...Object.entries(t.color.dark).map(([k, v]): [string, string] => [k, v.toLowerCase()]),
      ['wash', String(t.wash.dark)],
    ]),
    '',
    '/* A computer reads the sizes as written; a phone reads them 15% larger, never below 11px. */',
    media(`(min-width: ${px(t.breakpoint.computer)})`, [
      ['fs', '1'],
      ['fs-min', '0px'],
    ]),
    '',
    '/* Wide screens: the measure grows, then stays capped (design-system §7). */',
    media(`(min-width: ${px(t.breakpoint.wide)})`, [['measure', px(t.layout['measure-wide'])]]),
    '',
    media(`(min-width: ${px(t.breakpoint.wider)})`, [['measure', px(t.layout['measure-wider'])]]),
    '',
    '/* Hit targets relax to 36px only where a mouse is positively detected (design-system §6.1). */',
    media('(hover: hover) and (pointer: fine)', [['hit', px(t.hit.fine)]]),
    '',
    '/* Reduced motion: nothing moves. */',
    media(
      '(prefers-reduced-motion: reduce)',
      Object.keys(t.duration).map((k): [string, string] => [`duration-${k}`, '0ms']),
    ),
    '',
  ].join('\n');
}
