/// <reference lib="dom" />
/**
 * Shared checks for every E2E spec (CONVENTIONS §9, design-system §6.1 and §7): the viewports, an
 * axe check, no sideways scrolling, tap targets, the smallest text, and the page's scroll position.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** The widths every screen is checked at: the narrowest phone, a common phone, a computer. */
export const VIEWPORTS = {
  narrow: { width: 320, height: 640 },
  phone: { width: 390, height: 844 },
  computer: { width: 1280, height: 800 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/** The project a test runs in: `phone` (touch, 390px) or `computer` (mouse, 1280px). */
export function isPhone(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'phone';
}

/** Hit targets (design-system §6.1): 44px for touch, 36px only where a mouse is detected. */
export function hitTarget(testInfo: TestInfo): number {
  return isPhone(testInfo) ? 44 : 36;
}

/** The page never scrolls sideways (PRD J4, J11; design-system §7). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    window.scrollTo(root.scrollWidth, window.scrollY);
    const scrolled = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, scrolled };
  });
  expect(overflow.scrollWidth, 'the page is wider than the viewport').toBeLessThanOrEqual(
    overflow.clientWidth,
  );
  expect(overflow.scrolled, 'the page scrolls sideways').toBe(0);
}

/** axe (WCAG 2.2 A and AA) finds nothing serious or critical. */
export async function expectNoSeriousAxeViolations(page: Page, include?: string): Promise<void> {
  let axe = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
  ]);
  if (include) axe = axe.include(include);
  const { violations } = await axe.analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious, 'serious accessibility violations').toStrictEqual([]);
}

/**
 * Every visible control's tap area is at least `min` in both dimensions, and no two overlap
 * (design-system §6.1 rules 1 and 3). With a modal dialog open, only the dialog is checked: the
 * page behind it cannot be tapped.
 */
export async function expectTapTargets(page: Page, min: number): Promise<void> {
  const problems = await page.evaluate((min) => {
    const SELECTOR = [
      'a[href]',
      'button',
      'input:not([type=hidden])',
      'select',
      'textarea',
      'summary',
      '[role=button]',
      '[role=link]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const dialog = document.querySelector('dialog[open]');
    const scope = dialog ?? document.body;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden';
    };
    const fixed = (el: Element) => {
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).position === 'fixed') return true;
      }
      return false;
    };
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
    const targets = [...scope.querySelectorAll(SELECTOR)].filter(visible);
    const out: { target: string; width: number; height: number }[] = [];
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        out.push({ target: name(el), width: Math.round(r.width), height: Math.round(r.height) });
      }
    }
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const a = targets[i];
        const b = targets[j];
        if (!a || !b || a.contains(b) || b.contains(a) || fixed(a) !== fixed(b)) continue;
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (x > 1 && y > 1) {
          out.push({ target: `overlap: ${name(a)} × ${name(b)}`, width: x, height: y });
        }
      }
    }
    return out;
  }, min);
  expect(problems, `tap targets under ${min}px, or overlapping`).toStrictEqual([]);
}

/** Nothing is smaller than `min` px: on a phone, 11px (design-system §3). */
export async function expectTextAtLeast(page: Page, min: number): Promise<void> {
  const small = await page.evaluate((min) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < min - 0.01) out.push(`${size}px: "${el.textContent?.trim().slice(0, 30)}"`);
    }
    return out;
  }, min);
  expect(small, `text below ${min}px`).toStrictEqual([]);
}

/** How far down the page is scrolled. */
export function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

/** The value of a design token as the page resolves it, e.g. `--paper`. */
export function token(page: Page, name: `--${string}`): Promise<string> {
  return page.evaluate(
    (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    name,
  );
}
