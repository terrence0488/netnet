/**
 * The design tokens of "Poster" (docs/02-prototype/design-system.md), ported from the prototype's
 * styles.css. This object is the source; `tokens.css` is generated from it (see css.ts) so the web
 * reads CSS custom properties and native reads the same names here.
 *
 * Sizes are numbers in px at the computer's size. On a phone, text is `scale.phone` larger and never
 * below `scale.phoneFloor` px (design-system §3).
 */

/** Light (cream) is the reference theme (design-system §4). */
const light = {
  paper: '#F2EADB',
  card: '#FFFAF1',
  ink: '#1A1714',
  'ink-2': '#4A433A',
  'ink-3': '#6B6255',
  rule: '#E3D7C1',
  'rule-strong': '#BFAE90',
  edge: '#1A1714',
  drop: '#1A1714',
  brand: '#F0643A',
  'brand-text': '#B23C0C',
  'brand-on': '#1A1714',
  agent: '#2F5BD6',
  'agent-text': '#2447B0',
  gain: '#22703F',
  loss: '#B4232F',
  attention: '#8A5A00',
  'warn-bg': '#FBE6B5',
  sun: '#F4B63F',
  'sun-on': '#1A1714',
  scrim: 'rgba(26, 23, 20, 0.55)',
} as const;

export type ColorName = keyof typeof light;

/** Dark (espresso) follows the OS. Authored, not derived from light (design-system §8). */
const dark: Record<ColorName, string> = {
  paper: '#1B1712',
  card: '#2A231B',
  ink: '#F5EDDF',
  'ink-2': '#D2C5AF',
  'ink-3': '#A7987F',
  rule: '#3E3529',
  'rule-strong': '#6B5E4B',
  edge: '#E8DCC6',
  drop: '#000000',
  brand: '#FF7438',
  'brand-text': '#FF8F5E',
  'brand-on': '#1A1714',
  agent: '#7C98FF',
  'agent-text': '#9DB2FF',
  gain: '#6FCF8E',
  loss: '#FF6B81',
  attention: '#F2B640',
  'warn-bg': '#3A2E14',
  sun: '#F2B640',
  'sun-on': '#1A1714',
  scrim: 'rgba(26, 23, 20, 0.55)',
};

export type Theme = 'light' | 'dark';

export const color: Record<Theme, Record<ColorName, string>> = { light, dark };

/** The trend's wash beneath its line, per theme (design-system §6, Trend). */
export const wash: Record<Theme, number> = { light: 0.22, dark: 0.26 };

/** Unbounded for money and headings, Space Grotesk for everything else (design-system §3). */
export const font = {
  display: ['Unbounded', 'Arial Black', 'sans-serif'],
  text: [
    'Space Grotesk',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'sans-serif',
  ],
  mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
} as const;

export type FontName = keyof typeof font;

/** One step of the type scale. `size` is px at the computer's size; `tracking` is in em. */
export interface TypeStep {
  readonly font: FontName;
  readonly weight: number;
  readonly size: number;
  readonly tracking: number;
  readonly leading?: number;
}

/**
 * The type scale (design-system §3), plus the control sizes the prototype sets. `display` sizes to
 * the viewport instead (see `displaySize`) and is never scaled for a phone.
 */
export const type = {
  display: { font: 'display', weight: 700, size: 46, tracking: -0.045, leading: 1.05 },
  figure: { font: 'display', weight: 600, size: 15, tracking: -0.03 },
  'heading-section': { font: 'display', weight: 700, size: 13.5, tracking: -0.01 },
  'heading-card': { font: 'display', weight: 700, size: 13, tracking: -0.01 },
  'heading-screen': { font: 'display', weight: 700, size: 18, tracking: -0.02 },
  'heading-signup': { font: 'display', weight: 700, size: 23, tracking: -0.035, leading: 1.2 },
  body: { font: 'text', weight: 500, size: 15, tracking: -0.005, leading: 1.45 },
  'body-sm': { font: 'text', weight: 400, size: 13.5, tracking: 0, leading: 1.5 },
  label: { font: 'text', weight: 700, size: 10.5, tracking: 0.12 },
  meta: { font: 'text', weight: 400, size: 12, tracking: 0 },
  pct: { font: 'text', weight: 700, size: 11.5, tracking: 0 },
  button: { font: 'text', weight: 700, size: 14, tracking: 0 },
  link: { font: 'text', weight: 700, size: 12, tracking: 0.02 },
  field: { font: 'text', weight: 500, size: 16, tracking: 0 },
  amount: { font: 'display', weight: 600, size: 24, tracking: -0.04 },
  'amount-symbol': { font: 'display', weight: 600, size: 20, tracking: 0 },
  nav: { font: 'text', weight: 600, size: 14, tracking: 0 },
  tab: { font: 'text', weight: 700, size: 10, tracking: 0.02 },
  wordmark: { font: 'display', weight: 800, size: 19, tracking: -0.03 },
} as const satisfies Record<string, TypeStep>;

export type TypeName = keyof typeof type;

/** `display` sizes to the viewport: clamp(min, vw, max). */
export const displaySize = { min: 28, vw: 8.6, max: 46 } as const;

/**
 * The phone scale (design-system §3): every size ×1.15 below the computer breakpoint, and nothing
 * below 11px. Form fields are never below 16px, or iOS zooms into them (§6.1 rule 8).
 */
export const scale = { phone: 1.15, phoneFloor: 11 } as const;

/** Spacing: `space[n]` is n × 2px, the steps the prototype uses. */
export const space = {
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
  6: 12,
  7: 14,
  8: 16,
  9: 18,
  10: 20,
  11: 22,
  12: 24,
  13: 26,
  15: 30,
  16: 32,
  20: 40,
} as const;

/** Spacing with a job: the page's side margin, and the paddings every card, row and sheet share. */
export const inset = {
  gutter: 20,
  'gutter-computer': 40,
  card: 16,
  row: 13,
  sheet: 22,
  field: 12,
} as const;

export const radius = {
  card: 14,
  control: 10,
  sheet: 22,
  dialog: 18,
  pill: 99,
} as const;

/** Outlines: `edge` for cards and controls, `rule` for the soft rules inside a card. */
export const border = { edge: 2, rule: 1.5, hair: 1 } as const;

/** The hard offset shadow's offsets (design-system §4.2 rule 4: cards and controls you can press). */
export const offset = { card: 4, control: 3, icon: 2, sheet: 6 } as const;

/**
 * Hit targets (design-system §6.1, binding): 44px by default; 36px only under
 * `(hover: hover) and (pointer: fine)`.
 */
export const hit = { touch: 44, fine: 36 } as const;

/** Breakpoints (design-system §7): the sidebar from `computer`; the measure grows at `wide`, `wider`. */
export const breakpoint = { computer: 900, wide: 1500, wider: 1800 } as const;

/** Layout (design-system §7). `measure` is the content column at each breakpoint. */
export const layout = {
  sidebar: 232,
  'measure-phone': 520,
  measure: 1180,
  'measure-wide': 1340,
  'measure-wider': 1440,
  'measure-narrow': 400,
  'field-max': 420,
  'tab-h': 64,
  'sheet-w': 460,
} as const;

export const icon = { tab: 21, ui: 18, mark: 16, spinner: 22 } as const;

/** Motion in ms. Every duration is 0 under `prefers-reduced-motion: reduce`. */
export const duration = {
  press: 80,
  switch: 160,
  dialog: 160,
  sheet: 220,
  toast: 220,
  spin: 900,
} as const;

export const easing = { sheet: [0.32, 0.72, 0, 1] } as const;

export const opacity = { disabled: 0.45, 'agent-mark': 0.75 } as const;

export const layer = { tabbar: 40, toast: 60 } as const;

export const tokens = {
  color,
  wash,
  font,
  type,
  displaySize,
  scale,
  space,
  inset,
  radius,
  border,
  offset,
  hit,
  breakpoint,
  layout,
  icon,
  duration,
  easing,
  opacity,
  layer,
} as const;

export type Tokens = typeof tokens;
