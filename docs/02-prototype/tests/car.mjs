/* Home's trend and allocation share one place under the total:
   a carousel on a phone, side by side on a computer. */
import { chromium, devices } from './pw.mjs';
const URL = new globalThis.URL('../index.html', import.meta.url).href;
const t = (n, ok, d) => console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${!ok && d !== undefined ? `   [${d}]` : ''}`);
const b = await chromium.launch();
const seeded = async (p, h) => { await p.evaluate(h => { reset('seeded'); S.account.signedIn = true; save(); location.hash = h; render(); }, h); await p.waitForTimeout(250); };
const geo = p => p.evaluate(() => { const c = document.querySelector('#home-carousel'), r = s => document.querySelector('#s-home ' + s).getBoundingClientRect();
  return { cw:c.clientWidth, sw:c.scrollWidth, sl:c.scrollLeft, trend:r('.o-trend'), alloc:r('.o-alloc'), pos:r('.o-pos'),
    dots:[...document.querySelectorAll('#s-home .swipe-dots i')].map(i => i.classList.contains('on')), vw:innerWidth,
    page:document.scrollingElement.scrollWidth }; });

// ---------- phone
let ctx = await b.newContext({ ...devices['iPhone 13'] }); let p = await ctx.newPage();
await p.goto(URL, { waitUntil:'load' }); await seeded(p, '#/home');
let g = await geo(p);
t('phone: trend and allocation sit in one row, right under the total', Math.abs(g.trend.top - g.alloc.top) < 1 && g.trend.top < g.pos.top);
t('phone: the trend shows first, the allocation waits off to the right', g.trend.left >= 0 && g.alloc.left >= g.vw - 1);
t('phone: each slide is the full content width', Math.abs(g.trend.width - g.alloc.width) < 1 && g.trend.width > g.vw - 60, g.trend.width);
t('phone: the carousel scrolls sideways, the page does not', g.sw > g.cw && g.page <= g.vw);
t('phone: two dots, the first one on', g.dots.length === 2 && g.dots[0] && !g.dots[1], g.dots);
await p.evaluate(() => { const c = document.querySelector('#home-carousel'); c.scrollLeft = c.scrollWidth; }); await p.waitForTimeout(300);
g = await geo(p);
t('phone: swiping brings the allocation into view', g.alloc.left >= 0 && g.alloc.right <= g.vw + 1, `${g.alloc.left}–${g.alloc.right}`);
t('phone: the dots follow the swipe', !g.dots[0] && g.dots[1], g.dots);
await p.click('#s-home .o-alloc [data-act="pie-mode"]'); await p.waitForTimeout(300);
g = await geo(p);
t('phone: Show $ re-renders and stays on the allocation', g.alloc.left >= 0 && g.alloc.right <= g.vw + 1 && g.dots[1], `${g.alloc.left}`);
t('phone: Show $ shows amounts', /\$/.test(await p.$eval('#s-home .o-alloc .lrow b', e => e.textContent)));
await p.click('#s-home .o-list .row'); await p.waitForTimeout(250);
await p.evaluate(() => { location.hash = '#/home'; }); await p.waitForTimeout(300);
g = await geo(p);
t('phone: back from a holding, still on the allocation', g.alloc.left >= 0 && g.dots[1]);
// one slide: nothing to swipe
await p.evaluate(() => { reset('seeded'); S.account.signedIn = true; S.holdings.forEach(h => { if (h.typeId !== S.holdings[0].typeId) h.archived = true; }); save(); location.hash = '#/home'; render(); });
await p.waitForTimeout(250);
t('phone: one type means no allocation, no dots', !(await p.$('#s-home .o-alloc')) && !(await p.$('#s-home .swipe-dots')));
await ctx.close();

// ---------- computer
ctx = await b.newContext({ viewport:{ width:1280, height:900 } }); p = await ctx.newPage();
await p.goto(URL, { waitUntil:'load' }); await seeded(p, '#/home');
g = await geo(p);
t('computer: side by side, trend on the left', Math.abs(g.trend.top - g.alloc.top) < 1 && g.trend.right < g.alloc.left);
t('computer: both fully visible, nothing to scroll, no dots', g.sw <= g.cw + 1 && g.alloc.right <= g.vw && g.dots.length === 2
  && await p.$eval('#s-home .swipe-dots', e => getComputedStyle(e).display) === 'none');
t('computer: above position and holdings', g.alloc.bottom <= g.pos.top);
await ctx.close();
await b.close();
